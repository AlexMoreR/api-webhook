import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { TipoRegistro } from '@prisma/client';
import {
  getDefaultEstado,
  ESTADOS_POR_TIPO,
} from '../../constants/estados-por-tipo';
import { normalizeText } from '../../utils/normalize-text';

type CreateRegistroResult =
  | {
      ok: true;
      registroId: number;
      sessionId: number;
      tipo: TipoRegistro;
      estado: string;
    }
  | {
      ok: false;
      sessionId: number;
      tipo: TipoRegistro;
      estado?: string;
      error: string;
    };

@Injectable()
export class RegistroService {
  private readonly logger = new Logger(RegistroService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mergeResumen(prev: string | null | undefined, next: string) {
    const p = normalizeText(prev ?? '');
    const n = normalizeText(next ?? '');
    if (!n) return p;
    if (!p) return n;
    if (p.includes(n)) return p;
    const merged = `${p}\n${n}`;
    return merged.length > 6000 ? merged.slice(-6000) : merged;
  }

  async upsertReporte(sessionId: number, resumen: string) {
    const n = normalizeText(resumen);
    if (!n) return;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { pushName: true },
    });

    const pushName = (session?.pushName ?? '').trim();
    const nombreFinal =
      pushName && pushName.toLowerCase() !== 'desconocido' ? pushName : null;

    const current = await this.prisma.registro.findFirst({
      where: { sessionId, tipo: 'REPORTE' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, resumen: true, nombre: true },
    });

    if (!current) {
      await this.prisma.registro.create({
        data: {
          sessionId,
          tipo: 'REPORTE',
          estado: getDefaultEstado('REPORTE'),
          resumen: n,
          nombre: nombreFinal,
          fecha: new Date(),
        },
      });
      return;
    }

    const merged = this.mergeResumen(current.resumen, n);

    await this.prisma.registro.update({
      where: { id: current.id },
      data: {
        resumen: merged,
        fecha: new Date(),
        //si estaba vacío, se pone
        ...(current.nombre ? {} : { nombre: nombreFinal }),
      },
    });
  }

  async createRegistro(params: {
    sessionId: number;
    tipo: TipoRegistro;
    estado?: string;
    resumen?: string;
    detalles?: string;
    lead?: boolean;
    nombre?: string;
    meta?: any;
    fecha?: Date;
  }): Promise<CreateRegistroResult> {
    this.logger.debug(
      `[createRegistro] start sessionId=${params.sessionId} tipo=${params.tipo} estadoIn=${params.estado ?? '-'}`,
    );

    const estadosValidos = ESTADOS_POR_TIPO[params.tipo] ?? [];
    this.logger.debug(
      `[createRegistro] estadosValidos(${params.tipo})=${JSON.stringify(estadosValidos)}`,
    );

    const estadoFinal =
      params.estado && estadosValidos.includes(params.estado)
        ? params.estado
        : getDefaultEstado(params.tipo);

    this.logger.debug(`[createRegistro] estadoFinal=${estadoFinal}`);

    const payload = {
      sessionId: params.sessionId,
      tipo: params.tipo,
      estado: estadoFinal,
      resumen: params.resumen ?? null,
      detalles: params.detalles ?? null,
      lead: params.lead ?? null,
      nombre: params.nombre ?? null,
      meta: params.meta ?? null,
      fecha: params.fecha ?? new Date(),
    };

    this.logger.debug(`[createRegistro] payload=${JSON.stringify(payload)}`);

    try {
      const created = await this.prisma.registro.create({ data: payload });

      this.logger.debug(
        `[createRegistro] success registroId=${created.id} sessionId=${params.sessionId} tipo=${params.tipo} estado=${estadoFinal}`,
      );

      return {
        ok: true,
        registroId: created.id,
        sessionId: params.sessionId,
        tipo: params.tipo,
        estado: estadoFinal,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.logger.error(
        `[createRegistro] error sessionId=${params.sessionId} tipo=${params.tipo} estado=${estadoFinal}: ${msg}`,
        err?.stack || err,
      );

      return {
        ok: false,
        sessionId: params.sessionId,
        tipo: params.tipo,
        estado: estadoFinal,
        error: msg,
      };
    }
  }
}
