// src/common/helpers/convert-delay-to-seconds.helper.ts
export const unitToSeconds = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

/**
 * Convierte un delay con formato "unidad-valor" (ej. "minutes-5") a segundos numéricos.
 *
 * @param delay Formato como "minutes-5", "hours-2", "days-1"
 * @returns Número de segundos
 * @throws Error si el formato es inválido
 */
export function convertDelayToSeconds(delay: string): number {
  if (!delay) {
    throw new Error('El parámetro delay es requerido.');
  }

  const [unit, valueStr] = delay.split('-');
  const value = parseInt(valueStr, 10);

  if (!['seconds', 'minutes', 'hours', 'days'].includes(unit) || isNaN(value)) {
    throw new Error(`Formato de delay inválido: ${delay}`);
  }

  return value * unitToSeconds[unit];
}

/**
 * Convierte un delay con formato "unidad-valor" a una fecha futura formateada "DD/MM/YYYY HH:MM".
 * Usar exclusivamente para nodos de tipo pause/trigger que necesitan una fecha de reactivación.
 *
 * @param delay Formato como "minutes-5", "hours-2", "days-1"
 * @returns Fecha futura como string "DD/MM/YYYY HH:MM"
 * @throws Error si el formato es inválido
 */
export function convertDelayToFutureDate(delay: string): string {
  const seconds = convertDelayToSeconds(delay);

  const futureDate = new Date(Date.now() + seconds * 1000);

  const day = String(futureDate.getDate()).padStart(2, '0');
  const month = String(futureDate.getMonth() + 1).padStart(2, '0');
  const year = futureDate.getFullYear();
  const hours = String(futureDate.getHours()).padStart(2, '0');
  const minutes = String(futureDate.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
