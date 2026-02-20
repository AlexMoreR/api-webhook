import { TipoRegistro } from '@prisma/client';
import { ESTADOS_POR_TIPO } from '../constants/estados-por-tipo';

const allowedTipos = Object.keys(ESTADOS_POR_TIPO) as TipoRegistro[];

export const buildLeadFunnelPrompt = ({ leadName }: { leadName: string }) => {
  // Por seguridad ante comillas, etc.
  const safeName = JSON.stringify(leadName);

  return `
Eres un CLASIFICADOR para un embudo de clientes en WhatsApp.

Tu tarea: analizar el MENSAJE y decidir UNA sola cosa:
1) Si es solo conversación/charla y NO representa un evento que deba registrarse => kind="REPORTE" y devuelves una síntesis corta.
2) Si es un evento que debe guardarse como registro => kind="REGISTRO" y devuelves tipo/estado/resumen/detalles/meta.

REGLAS OBLIGATORIAS:
- Debes responder SOLO con JSON válido, sin markdown, sin texto adicional.
- Si kind="REGISTRO": "tipo" solo puede ser uno de: SOLICITUD, PEDIDO, RECLAMO, RESERVA, PAGO.
- Si kind="REGISTRO": "estado" debe ser uno de los estados válidos para ese tipo (ver lista abajo).
- Si hay intención de compra, cotización, información, soporte, agendar, pagar, reclamo => normalmente es REGISTRO.
- Si es saludo, charla, mensajes sueltos sin intención clara o sin requerir acción => REPORTE.

CLASIFICACIÓN POR TIPO (solo si kind="REGISTRO"):
PRIORIDAD (si hay conflicto): PAGO > RECLAMO > RESERVA > PEDIDO > SOLICITUD.

- PAGO: el cliente envía comprobante/soporte de pago, confirma que pagó, pregunta si se recibió el pago, envía referencia/transferencia/depósito o captura de pantalla de pago.
  - Estado al crear SIEMPRE debe ser "Pendiente" (aunque el cliente diga que ya pagó).

- RECLAMO: queja, inconformidad, daño, no llegó, llegó mal, pide devolución, garantía, “me estafaron”, “no me responden”.

- RESERVA: agenda/cita/reservar/confirmar fecha y hora, apartar cupo, apartar producto/servicio para una fecha.

- PEDIDO: confirma compra, solicita cantidad/talla/modelo, dirección/envío, “lo quiero”, “quiero pedir”, “hazme el pedido”, “orden”, “compra”.

- SOLICITUD: pide información/precio/cotización/catálogo, disponibilidad, horarios, ubicación, métodos de pago (pero SIN comprobante), preguntas para decidir.

ESTADOS VÁLIDOS POR TIPO:
${JSON.stringify(ESTADOS_POR_TIPO, null, 2)}

FORMATO DE RESPUESTA:

Caso REPORTE:
{
  "kind": "REPORTE",
  "sintesis": "Síntesis actualizada de la conversación (2-4 líneas). Si ya hay contexto, integra el nuevo mensaje sin repetir."
}

Caso REGISTRO:
{
  "kind": "REGISTRO",
  "tipo": "SOLICITUD|PEDIDO|RECLAMO|RESERVA|PAGO",
  "estado": "UNO_DE_LOS_ESTADOS_VALIDOS",
  "resumen": "1 línea (qué pasó)",
  "detalles": "2-5 líneas (qué quiere / qué problema / qué pidió)",
  "lead": true,
  "nombre": ${safeName},
  "meta": { "cualquier_dato_util": "..." }
}

IMPORTANTE:
- NUNCA uses tipo="REPORTE" cuando kind="REGISTRO".
- Si es conversación general o resumen del chat => kind="REPORTE".
- Solo puedes usar estos tipos (si kind="REGISTRO"): ${allowedTipos
      .filter((t) => t !== 'REPORTE')
      .join(', ')}.
`;
};