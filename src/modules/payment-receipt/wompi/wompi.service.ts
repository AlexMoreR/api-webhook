import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { LoggerService } from 'src/core/logger/logger.service';
import { WompiEventDto, WompiTransaction } from './wompi-event.dto';

/** Formato de referencia: verzay-{userId}-{planCode}-{timestamp} */
const REFERENCE_PREFIX = 'verzay-';

@Injectable()
export class WompiService {
  private readonly integritySecret: string;
  private readonly verzayAppUrl: string;
  private readonly cronSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.integritySecret =
      this.configService.get<string>('WOMPI_INTEGRITY_SECRET') ?? '';
    this.verzayAppUrl = (
      this.configService.get<string>('BILLING_CRON_ENDPOINT_URL') ??
      this.configService.get<string>('NEXTAUTH_URL') ??
      ''
    ).replace(/\/+$/, '');
    this.cronSecret = this.configService.get<string>('CRON_SECRET') ?? '';
  }

  // -------------------------------------------------------------------------
  // Punto de entrada
  // -------------------------------------------------------------------------

  async process(event: WompiEventDto): Promise<void> {
    // 1. Solo procesar eventos de transacciones aprobadas
    if (event.event !== 'transaction.updated') {
      this.logger.log(
        `[Wompi] Evento ignorado: ${event.event}`,
        'WompiService',
      );
      return;
    }

    const tx = event.data?.transaction;
    if (!tx) {
      this.logger.warn('[Wompi] Evento sin data.transaction', 'WompiService');
      return;
    }

    if (tx.status !== 'APPROVED') {
      this.logger.log(
        `[Wompi] Transacción ${tx.id} con estado ${tx.status} — ignorada.`,
        'WompiService',
      );
      return;
    }

    // 2. Validar firma HMAC
    if (this.integritySecret) {
      const isValid = this.validateSignature(event);
      if (!isValid) {
        this.logger.warn(
          `[Wompi] Firma inválida para transacción ${tx.id}. Evento descartado.`,
          'WompiService',
        );
        return;
      }
    } else {
      this.logger.warn(
        '[Wompi] WOMPI_INTEGRITY_SECRET no configurado — validación de firma omitida.',
        'WompiService',
      );
    }

    // 3. Extraer clientUserId de la referencia
    const clientUserId = this.extractClientUserId(tx.reference);
    if (!clientUserId) {
      this.logger.warn(
        `[Wompi] Referencia sin formato Verzay: "${tx.reference}". Ignorado.`,
        'WompiService',
      );
      return;
    }

    // 4. Confirmar el pago vía verzay-app
    await this.callConfirmPayment(tx, clientUserId);
  }

  // -------------------------------------------------------------------------
  // Validación de firma
  // Wompi firma: SHA256( prop_values_concatenados + integrity_secret )
  // -------------------------------------------------------------------------

  private validateSignature(event: WompiEventDto): boolean {
    try {
      const { checksum, properties } = event.signature;

      // Construir el string a hashear: valores de cada propiedad + secret
      const values = properties.map((prop) => {
        // prop = "transaction.id" → navegar event.data.transaction.id
        const parts = prop.split('.');
        let node: any = event;
        for (const part of parts) {
          node = node?.[part];
        }
        return String(node ?? '');
      });

      const payload = values.join('') + this.integritySecret;
      const expected = createHash('sha256').update(payload).digest('hex');

      return expected === checksum;
    } catch (error: unknown) {
      this.logger.error(
        `[Wompi] Error validando firma: ${(error as any)?.message}`,
        'WompiService',
      );
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Extracción del clientUserId desde la referencia
  // Formato: verzay-{userId}-{planCode}-{timestamp}
  // -------------------------------------------------------------------------

  private extractClientUserId(reference: string): string | null {
    if (!reference?.startsWith(REFERENCE_PREFIX)) return null;

    // Quitar prefijo "verzay-"
    const rest = reference.slice(REFERENCE_PREFIX.length);
    // El userId termina en el primer "-" que precede al planCode
    // Formato: {userId}-{planCode}-{timestamp}
    // userId puede contener guiones (cuid), así que buscamos desde el final:
    // los últimos dos segmentos separados por "-" son planCode y timestamp
    const parts = rest.split('-');
    if (parts.length < 3) return null;

    // timestamp = último parte (solo dígitos)
    // planCode  = penúltimo parte
    // userId    = todo lo anterior
    const userId = parts.slice(0, parts.length - 2).join('-');
    return userId || null;
  }

  // -------------------------------------------------------------------------
  // Llamada HTTP a verzay-app /api/payment/confirm
  // -------------------------------------------------------------------------

  private async callConfirmPayment(
    tx: WompiTransaction,
    clientUserId: string,
  ): Promise<void> {
    if (!this.verzayAppUrl || !this.cronSecret) {
      this.logger.error(
        '[Wompi] BILLING_CRON_ENDPOINT_URL o CRON_SECRET no configurados.',
        'WompiService',
      );
      return;
    }

    const amountInUnits = tx.amount_in_cents / 100;
    const currencyCode = (tx.currency ?? 'COP').toUpperCase();

    try {
      const response = await axios.post(
        `${this.verzayAppUrl}/api/payment/confirm`,
        {
          clientUserId,
          amount: amountInUnits,
          currencyCode,
          source: 'WOMPI_WEBHOOK',
          externalReference: tx.id,   // ID único de la transacción Wompi
          notes: `Wompi | ref:${tx.reference} | método:${tx.payment_method_type}`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.cronSecret}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );

      if (response.data?.alreadyProcessed) {
        this.logger.log(
          `[Wompi] Transacción ${tx.id} ya procesada anteriormente.`,
          'WompiService',
        );
        return;
      }

      if (response.data?.success) {
        this.logger.log(
          `[Wompi] Pago confirmado — userId=${clientUserId} txId=${tx.id} newDueDate=${response.data.newDueDate}`,
          'WompiService',
        );
      } else {
        this.logger.warn(
          `[Wompi] Error al confirmar pago — userId=${clientUserId} msg=${response.data?.message}`,
          'WompiService',
        );
      }
    } catch (error: unknown) {
      const msg =
        (error as any)?.response?.data?.message ??
        (error as any)?.message ??
        'Error HTTP';
      this.logger.error(
        `[Wompi] Fallo al llamar /api/payment/confirm para userId=${clientUserId}: ${msg}`,
        'WompiService',
      );
    }
  }
}
