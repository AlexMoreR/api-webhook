import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { TipoRegistro } from '@prisma/client';
import { getDefaultEstado, ESTADOS_POR_TIPO } from '../../constants/estados-por-tipo';

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

    constructor(private readonly prisma: PrismaService) { }

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
