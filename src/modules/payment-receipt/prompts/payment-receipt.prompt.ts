import { PrismaService } from 'src/database/prisma.service';
import { CRM_AGENT_PROMPT_IDS } from 'src/types/CRM_AGENT_PROMPT_IDS';

/**
 * Prompt para analizar comprobantes de pago recibidos por WhatsApp.
 * El contenido puede ser texto plano de un mensaje o la descripción
 * de una imagen ya procesada por Vision.
 */
export function buildPaymentReceiptPrompt(): string {
  return `Eres un sistema experto en verificar comprobantes de pago para la empresa Verzay.

Tu tarea es analizar el contenido de un mensaje de WhatsApp y determinar si es un comprobante de pago legítimo.

## Métodos de pago válidos para Verzay
- **WOMPI**: Links de pago verzay.com, confirmaciones Wompi
- **BANCOLOMBIA**: Cuenta de ahorros 752-000-164-59 a nombre de Lennis Vernaza, CC 1006827516
- **NEQUI**: Transferencias Nequi a los mismos datos de Bancolombia
- **BINANCE**: Pagos a oscarmanrique_contreras@hotmail.com o rondongenesis606@gmail.com

## Planes disponibles (montos válidos en USD)
- $49 / $49.50
- $99 / $99.50
- $119.50
- $149
- $249

## Criterios de autenticidad
Un comprobante es auténtico si tiene:
1. Estructura de comprobante real (encabezado de banco/plataforma, fecha, montos)
2. Número de transacción o referencia
3. Monto coincidente con los planes de Verzay
4. Cuenta o destino coincidente con los datos de Verzay
5. Fecha coherente (no futura, no más de 30 días atrás)

## Respuesta requerida
Responde ÚNICAMENTE con un JSON válido, sin markdown, sin explicaciones:

{
  "isPaymentReceipt": boolean,
  "confidenceScore": number (0-100),
  "method": "WOMPI" | "BANCOLOMBIA" | "NEQUI" | "BINANCE" | "OTRO",
  "amount": number | null,
  "currency": "COP" | "USD" | null,
  "reference": string | null,
  "date": string | null,
  "payerName": string | null,
  "recipientAccount": string | null,
  "rawText": string
}

- **rawText**: copia exacta del texto analizado (máximo 500 caracteres)
- **confidenceScore**: 0 si no es comprobante, 100 si es perfectamente identificable
- **reference**: número de transacción o confirmación del banco/plataforma
- **date**: formato ISO 8601 (ej: "2026-04-08T10:00:00.000Z") o null
- Si algún dato no está presente, usa null`;
}

async function findPromptText(
  prisma: PrismaService,
  userId: string,
  agentId: string,
) {
  const prompt = await prisma.agentPrompt.findFirst({
    where: {
      userId,
      agentId,
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      promptText: true,
    },
  });

  return String(prompt?.promptText ?? '').trim();
}

export async function resolvePaymentReceiptPrompt(args: {
  prisma: PrismaService;
  userId: string;
}) {
  const promptText = await findPromptText(
    args.prisma,
    args.userId,
    CRM_AGENT_PROMPT_IDS.paymentReceiptAnalyzer,
  );

  return promptText || buildPaymentReceiptPrompt();
}
