/**
 * Utilidades para generar referencias de pago Wompi con clientUserId embebido.
 *
 * Formato: verzay-{userId}-{planCode}-{timestamp}
 * Ejemplo: verzay-cm842kthc0000qd2l66nbnytv-plan99-1712534400000
 *
 * El WompiService extrae el userId de este formato cuando recibe la confirmación.
 */

/** Códigos de plan estándar de Verzay */
export type VerzayPlanCode =
  | 'plan49'
  | 'plan49-50'
  | 'plan99'
  | 'plan99-50'
  | 'plan119-50'
  | 'plan149'
  | 'plan249'
  | 'agente-ia';

/**
 * Genera la referencia que debe ir en el link de pago de Wompi.
 * Esta referencia permite al webhook identificar automáticamente al cliente.
 */
export function buildWompiReference(
  clientUserId: string,
  planCode: VerzayPlanCode | string,
): string {
  const ts = Date.now();
  return `verzay-${clientUserId}-${planCode}-${ts}`;
}

/**
 * Extrae el clientUserId de una referencia Wompi.
 * Devuelve null si el formato no es válido.
 */
export function extractClientUserIdFromReference(reference: string): string | null {
  if (!reference?.startsWith('verzay-')) return null;

  const rest = reference.slice('verzay-'.length);
  const parts = rest.split('-');
  // Los últimos 2 segmentos son planCode y timestamp
  // El resto es el userId (que puede contener guiones al ser un cuid)
  if (parts.length < 3) return null;

  const userId = parts.slice(0, parts.length - 2).join('-');
  return userId || null;
}
