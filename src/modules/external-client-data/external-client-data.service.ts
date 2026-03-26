import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { LoggerService } from 'src/core/logger/logger.service';
import {
  buildWhatsAppJidCandidates,
} from 'src/utils/whatsapp-jid.util';
import type {
  ExternalClientDataRecord,
  IExternalClientDataProvider,
} from './interfaces/external-client-data.interface';

@Injectable()
export class ExternalClientDataService implements IExternalClientDataProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Busca los datos externos de un cliente usando candidatos de JID.
   * Genera variantes (con/sin sufijo, sólo dígitos) para cubrir distintos formatos
   * que pueden haber sido usados al importar los datos.
   */
  async getByRemoteJid(
    userId: string,
    remoteJid: string,
  ): Promise<ExternalClientDataRecord | null> {
    if (!userId || !remoteJid) return null;

    const candidates = buildWhatsAppJidCandidates(remoteJid);

    try {
      const record = await this.prisma.externalClientData.findFirst({
        where: {
          userId,
          remoteJid: { in: candidates },
        },
      });

      if (!record) return null;

      return record.data as ExternalClientDataRecord;
    } catch (error: any) {
      this.logger.error(
        `[ExternalClientData] Error al buscar datos para remoteJid=${remoteJid}`,
        error?.message,
        'ExternalClientDataService',
      );
      return null;
    }
  }

  /**
   * Convierte el mapa de datos en una cadena legible para el agente de IA.
   * Ejemplo: "CEDULA: 12345678 | SERVICIO: Internet 10Mb | MONTO: $25.00"
   */
  formatForAgent(data: ExternalClientDataRecord): string {
    return Object.entries(data)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${key.toUpperCase()}: ${String(value)}`)
      .join(' | ');
  }
}
