import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { LoggerService } from 'src/core/logger/logger.service';
import { PrismaService } from 'src/database/prisma.service';
import { LlmClientFactory } from 'src/modules/ai-agent/services/llmClientFactory/llmClientFactory.service';
import { resolvePaymentReceiptPrompt } from '../prompts/payment-receipt.prompt';
import { ReceiptAnalysis } from '../types/receipt-analysis.types';

const FALLBACK_ANALYSIS: ReceiptAnalysis = {
  isPaymentReceipt: false,
  confidenceScore: 0,
  method: 'OTRO',
  amount: null,
  currency: null,
  reference: null,
  date: null,
  payerName: null,
  recipientAccount: null,
  rawText: '',
};

@Injectable()
export class PaymentReceiptAnalyzerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmClientFactory: LlmClientFactory,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Obtiene la config de IA del usuario admin para hacer la llamada LLM.
   * Usa el mismo patrón que AiAgentService.getClientForUser().
   */
  private async getAdminLlmConfig(adminUserId: string): Promise<{
    apiKey: string;
    model: string;
    provider: string;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { defaultProviderId: true, defaultAiModelId: true },
    });

    if (!user?.defaultProviderId || !user?.defaultAiModelId) return null;

    const provider = await this.prisma.aiProvider.findUnique({
      where: { id: user.defaultProviderId },
      select: { name: true },
    });

    const model = await this.prisma.aiModel.findUnique({
      where: { id: user.defaultAiModelId },
      select: { name: true },
    });

    const cfg = await this.prisma.userAiConfig.findFirst({
      where: { userId: adminUserId, isActive: true, providerId: user.defaultProviderId },
      select: { apiKey: true },
    });

    if (!provider?.name || !model?.name || !cfg?.apiKey) return null;

    return { apiKey: cfg.apiKey, model: model.name, provider: provider.name };
  }

  /**
   * Analiza el contenido de un mensaje para determinar si es un comprobante de pago.
   * @param content  Texto plano del mensaje o descripción de imagen ya procesada por Vision
   * @param adminUserId  ID del usuario admin (para usar su config de IA)
   */
  async analyze(content: string, adminUserId: string): Promise<ReceiptAnalysis> {
    if (!content || content.trim().length < 5) {
      return { ...FALLBACK_ANALYSIS, rawText: content };
    }

    const llmConfig = await this.getAdminLlmConfig(adminUserId);
    if (!llmConfig) {
      this.logger.warn(
        `[PaymentReceiptAnalyzer] Sin config LLM para adminUserId=${adminUserId}`,
        'PaymentReceiptAnalyzer',
      );
      return { ...FALLBACK_ANALYSIS, rawText: content };
    }

    try {
      const client = this.llmClientFactory.getClient({
        provider: llmConfig.provider as any,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
      });
      const systemPrompt = await resolvePaymentReceiptPrompt({
        prisma: this.prisma,
        userId: adminUserId,
      });

      const response = await client.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(content.slice(0, 3000)),
      ]);

      const raw = response.content.toString().trim();
      // Extraer JSON limpio (el modelo a veces envuelve con markdown)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(
          `[PaymentReceiptAnalyzer] Respuesta LLM sin JSON válido`,
          'PaymentReceiptAnalyzer',
        );
        return { ...FALLBACK_ANALYSIS, rawText: content };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<ReceiptAnalysis>;

      return {
        isPaymentReceipt: Boolean(parsed.isPaymentReceipt),
        confidenceScore: typeof parsed.confidenceScore === 'number'
          ? Math.max(0, Math.min(100, parsed.confidenceScore))
          : 0,
        method: (['WOMPI', 'BANCOLOMBIA', 'NEQUI', 'BINANCE', 'OTRO'] as const)
          .includes(parsed.method as any)
          ? (parsed.method as ReceiptAnalysis['method'])
          : 'OTRO',
        amount: typeof parsed.amount === 'number' ? parsed.amount : null,
        currency: parsed.currency === 'COP' || parsed.currency === 'USD'
          ? parsed.currency
          : null,
        reference: typeof parsed.reference === 'string' ? parsed.reference.trim() || null : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        payerName: typeof parsed.payerName === 'string' ? parsed.payerName.trim() || null : null,
        recipientAccount: typeof parsed.recipientAccount === 'string'
          ? parsed.recipientAccount.trim() || null
          : null,
        rawText: typeof parsed.rawText === 'string'
          ? parsed.rawText.slice(0, 500)
          : content.slice(0, 500),
      };
    } catch (error: unknown) {
      this.logger.error(
        `[PaymentReceiptAnalyzer] Error analizando comprobante: ${JSON.stringify(error)}`,
        'PaymentReceiptAnalyzer',
      );
      return { ...FALLBACK_ANALYSIS, rawText: content };
    }
  }
}
