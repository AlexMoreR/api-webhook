import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { LoggerService } from 'src/core/logger/logger.service';
import { PrismaService } from 'src/database/prisma.service';
import { NodeSenderService } from 'src/modules/workflow/services/node-sender.service.ts/node-sender.service';

import { PaymentReceiptAnalyzerService } from './payment-receipt-analyzer.service';
import { PaymentReceiptValidatorService } from './payment-receipt-validator.service';
import { PaymentClientMatcherService } from './payment-client-matcher.service';
import { ProcessResult } from '../types/receipt-analysis.types';

const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? 'cm842kthc0000qd2l66nbnytv';

export type IncomingReceiptPayload = {
  /** Texto extraído del mensaje (ya procesado por MessageTypeHandlerService) */
  content: string;
  /** JID del remitente (cliente que envió el comprobante) */
  remoteJid: string;
};

@Injectable()
export class PaymentReceiptProcessorService {
  private readonly verzayAppUrl: string;
  private readonly cronSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly analyzer: PaymentReceiptAnalyzerService,
    private readonly validator: PaymentReceiptValidatorService,
    private readonly matcher: PaymentClientMatcherService,
    private readonly nodeSender: NodeSenderService,
  ) {
    this.verzayAppUrl = (
      this.configService.get<string>('BILLING_CRON_ENDPOINT_URL') ??
      this.configService.get<string>('NEXTAUTH_URL') ??
      ''
    ).replace(/\/+$/, '');

    this.cronSecret = this.configService.get<string>('CRON_SECRET') ?? '';
  }

  // -------------------------------------------------------------------------
  // Punto de entrada principal
  // -------------------------------------------------------------------------

  async handle(payload: IncomingReceiptPayload): Promise<ProcessResult> {
    const { content, remoteJid } = payload;

    this.logger.log(
      `[PaymentReceiptProcessor] Analizando comprobante de ${remoteJid}`,
      'PaymentReceiptProcessor',
    );

    // 1. Analizar el comprobante con LLM
    const analysis = await this.analyzer.analyze(content, ADMIN_USER_ID);

    if (!analysis.isPaymentReceipt || analysis.confidenceScore < 50) {
      // No es un comprobante — ignorar silenciosamente
      return { success: false, message: 'No identificado como comprobante de pago.' };
    }

    // 2. Validar con reglas de negocio
    const validation = await this.validator.validate(analysis);

    if (!validation.isValid) {
      this.logger.warn(
        `[PaymentReceiptProcessor] Comprobante inválido de ${remoteJid}: ${validation.reason}`,
        'PaymentReceiptProcessor',
      );
      await this.notifyAdmin(
        `⚠️ *Comprobante rechazado* de ${remoteJid}\n*Razón:* ${validation.reason}\n*Monto:* ${analysis.amount} ${analysis.currency}\n*Método:* ${analysis.method}`,
      );
      return { success: false, message: validation.reason };
    }

    // 3. Identificar al cliente por su número de WhatsApp
    const clientUserId = await this.matcher.findClientByRemoteJid(remoteJid);

    if (!clientUserId) {
      this.logger.warn(
        `[PaymentReceiptProcessor] Cliente no encontrado para remoteJid=${remoteJid}`,
        'PaymentReceiptProcessor',
      );
      await this.notifyAdmin(
        `⚠️ *Comprobante sin cliente* de ${remoteJid}\n*Monto:* ${analysis.amount} ${analysis.currency}\n*Método:* ${analysis.method}\n*Referencia:* ${analysis.reference ?? 'N/A'}\n\nConfirmar manualmente.`,
      );
      return { success: false, message: 'Cliente no encontrado para ese número de WhatsApp.' };
    }

    // 4. Construir externalReference para deduplicación
    const externalReference = this.validator.buildExternalReference(analysis);

    // 5. Llamar al endpoint de confirmación de pago en verzay-app
    const confirmResult = await this.callConfirmPayment({
      clientUserId,
      amount: analysis.amount!,
      currencyCode: analysis.currency ?? 'COP',
      externalReference,
      notes: `Comprobante ${analysis.method} | ${analysis.reference ?? ''} | ${analysis.date ?? ''}`.trim(),
    });

    if (!confirmResult.success) {
      this.logger.error(
        `[PaymentReceiptProcessor] Error confirmando pago para userId=${clientUserId}: ${confirmResult.message}`,
        'PaymentReceiptProcessor',
      );
      await this.notifyAdmin(
        `❌ *Error al confirmar pago* de ${remoteJid}\n*Cliente ID:* ${clientUserId}\n*Error:* ${confirmResult.message}`,
      );
      return { success: false, message: confirmResult.message };
    }

    if (confirmResult.alreadyProcessed) {
      return { success: true, message: 'Pago ya procesado anteriormente.', alreadyProcessed: true };
    }

    // 6. Notificar al cliente que su pago fue recibido y confirmado
    await this.notifyClient(
      remoteJid,
      `✅ *¡Pago confirmado!*\n*Monto:* ${analysis.amount} ${analysis.currency}\n*Método:* ${analysis.method}\n*Referencia:* ${analysis.reference ?? 'N/A'}\n\nTu acceso ha sido activado. ¡Gracias!`,
    );

    // 7. Notificar al admin que el pago fue procesado exitosamente
    await this.notifyAdmin(
      `✅ *Pago confirmado automáticamente*\n*Cliente:* ${remoteJid}\n*Monto:* ${analysis.amount} ${analysis.currency}\n*Método:* ${analysis.method}\n*Referencia:* ${analysis.reference ?? 'N/A'}\n*Próximo vencimiento:* ${confirmResult.newDueDate ? new Date(confirmResult.newDueDate).toLocaleDateString('es-CO') : 'N/A'}`,
    );

    this.logger.log(
      `[PaymentReceiptProcessor] Pago confirmado para userId=${clientUserId}, newDueDate=${confirmResult.newDueDate}`,
      'PaymentReceiptProcessor',
    );

    return {
      success: true,
      message: 'Pago confirmado exitosamente.',
      clientUserId,
      newDueDate: confirmResult.newDueDate,
    };
  }

  // -------------------------------------------------------------------------
  // Llamada HTTP a verzay-app
  // -------------------------------------------------------------------------

  private async callConfirmPayment(input: {
    clientUserId: string;
    amount: number;
    currencyCode: string;
    externalReference: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string; newDueDate?: string; alreadyProcessed?: boolean }> {
    if (!this.verzayAppUrl || !this.cronSecret) {
      return {
        success: false,
        message: 'BILLING_CRON_ENDPOINT_URL o CRON_SECRET no configurados.',
      };
    }

    try {
      const response = await axios.post(
        `${this.verzayAppUrl}/api/payment/confirm`,
        {
          clientUserId: input.clientUserId,
          amount: input.amount,
          currencyCode: input.currencyCode,
          source: 'WHATSAPP_RECEIPT',
          externalReference: input.externalReference,
          notes: input.notes ?? null,
        },
        {
          headers: {
            Authorization: `Bearer ${this.cronSecret}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );

      return {
        success: response.data?.success === true,
        message: response.data?.message ?? 'Sin mensaje.',
        newDueDate: response.data?.newDueDate,
        alreadyProcessed: response.data?.alreadyProcessed === true,
      };
    } catch (error: unknown) {
      const msg = (error as any)?.response?.data?.message ?? (error as any)?.message ?? 'Error HTTP';
      return { success: false, message: msg };
    }
  }

  // -------------------------------------------------------------------------
  // Notificaciones WhatsApp
  // -------------------------------------------------------------------------

  private async getAdminInstanceConfig(): Promise<{
    url: string;
    apikey: string;
  } | null> {
    const admin = await this.prisma.user.findUnique({
      where: { id: ADMIN_USER_ID },
      select: {
        apiKey: { select: { url: true } },
        instancias: {
          select: { instanceId: true, instanceName: true, instanceType: true },
        },
      },
    });

    if (!admin) return null;

    const serverUrl = admin.apiKey?.url?.trim();
    const instance =
      admin.instancias.find((i) => i.instanceType === 'Whatsapp') ??
      admin.instancias[0];

    if (!serverUrl || !instance?.instanceId || !instance.instanceName) return null;

    const normalizedBase = /^https?:\/\//i.test(serverUrl)
      ? serverUrl.replace(/\/+$/, '')
      : `https://${serverUrl.replace(/\/+$/, '')}`;

    return {
      url: `${normalizedBase}/message/sendText/${encodeURIComponent(instance.instanceName)}`,
      apikey: instance.instanceId,
    };
  }

  private async notifyAdmin(text: string): Promise<void> {
    try {
      const cfg = await this.getAdminInstanceConfig();
      if (!cfg) return;

      // Notificar al número de notificación del admin (si tiene)
      const admin = await this.prisma.user.findUnique({
        where: { id: ADMIN_USER_ID },
        select: { notificationNumber: true },
      });

      const notifyJid = admin?.notificationNumber?.trim();
      if (!notifyJid) return;

      const jid = notifyJid.includes('@')
        ? notifyJid
        : `${notifyJid.replace(/\D/g, '')}@s.whatsapp.net`;

      await this.nodeSender.sendTextNode(cfg.url, cfg.apikey, jid, text);
    } catch {
      // Silencioso — no queremos romper el flujo por un error de notificación
    }
  }

  private async notifyClient(remoteJid: string, text: string): Promise<void> {
    try {
      const cfg = await this.getAdminInstanceConfig();
      if (!cfg) return;

      const jid = remoteJid.includes('@')
        ? remoteJid
        : `${remoteJid.replace(/\D/g, '')}@s.whatsapp.net`;

      await this.nodeSender.sendTextNode(cfg.url, cfg.apikey, jid, text);
    } catch {
      // Silencioso
    }
  }
}
