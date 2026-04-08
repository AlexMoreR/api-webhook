import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class PaymentClientMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca qué cliente de Verzay tiene este número de WhatsApp
   * registrado como notifyRemoteJid en su UserBilling.
   *
   * @param remoteJid  Número de WhatsApp del remitente (formato: 57XXXXXXXXXX@s.whatsapp.net)
   * @returns userId del cliente o null si no se encontró
   */
  async findClientByRemoteJid(remoteJid: string): Promise<string | null> {
    if (!remoteJid) return null;

    // Normalizar: extraer solo los dígitos del JID para buscar variaciones
    const digitsOnly = remoteJid.replace(/\D/g, '');

    // Intentar match exacto primero
    const exactMatch = await this.prisma.userBilling.findFirst({
      where: { notifyRemoteJid: remoteJid },
      select: { userId: true },
    });
    if (exactMatch) return exactMatch.userId;

    // Intentar match por dígitos (por si el JID viene con o sin sufijo)
    if (digitsOnly.length >= 8) {
      const allBillings = await this.prisma.userBilling.findMany({
        where: { notifyRemoteJid: { not: null } },
        select: { userId: true, notifyRemoteJid: true },
      });

      for (const billing of allBillings) {
        const storedDigits = (billing.notifyRemoteJid ?? '').replace(/\D/g, '');
        if (storedDigits === digitsOnly) {
          return billing.userId;
        }
        // Match parcial: los últimos 10 dígitos (número local sin código de país)
        if (
          digitsOnly.length >= 10 &&
          storedDigits.endsWith(digitsOnly.slice(-10))
        ) {
          return billing.userId;
        }
      }
    }

    return null;
  }
}
