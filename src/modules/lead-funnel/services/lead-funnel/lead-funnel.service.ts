import { Injectable, Logger } from '@nestjs/common';
import { ClassifyMessageDto } from '../../dto/classify-message.dto';
import { LeadClassifierIaService } from '../lead-classifier-ia/lead-classifier-ia.service';
import { RegistroService } from '../registro/registro.service';
import { ReporteSintesisService } from '../reporte-sintesis/reporte-sintesis.service';
import { TipoRegistro } from '@prisma/client';

type LeadFunnelResult =
    | {
        ok: true;
        action: 'CREATED_REGISTRO';
        sessionDbId: number;
        tipo: TipoRegistro;
        estado?: string;
        registroId?: number;
        resumen?: string;
    }
    | {
        ok: true;
        action: 'UPDATED_SINTESIS';
        sessionDbId: number;
        sintesisLength: number;
    }
    | {
        ok: true;
        action: 'SKIPPED';
        reason: string;
        sessionDbId: number;
    }
    | {
        ok: false;
        action: 'ERROR';
        sessionDbId: number;
        step: 'CLASSIFY' | 'CREATE_REGISTRO' | 'UPDATE_SINTESIS';
        error: string;
    };

@Injectable()
export class LeadFunnelService {
    private readonly logger = new Logger(LeadFunnelService.name);

    constructor(
        private readonly classifier: LeadClassifierIaService,
        private readonly registroService: RegistroService,
        private readonly reporteService: ReporteSintesisService,
    ) { }

    async processIncomingText(input: ClassifyMessageDto): Promise<LeadFunnelResult> {
        const sessionDbId = input.sessionDbId;

        this.logger.debug(
            `[processIncomingText] start sessionDbId=${sessionDbId} userId=${input.userId} instanceId=${input.instanceId} remoteJid=${input.remoteJid}`,
        );
        this.logger.debug(
            `[processIncomingText] text="${(input.text ?? '').toString().slice(0, 180)}"`,
        );

        // 1) CLASIFICAR
        let result: any;
        try {
            this.logger.debug(`[CLASSIFY] calling classifier.classify() sessionDbId=${sessionDbId}`);
            result = await this.classifier.classify(input);
            this.logger.debug(`[CLASSIFY] result=${JSON.stringify(result)}`);
        } catch (err: any) {
            const msg = err?.message || String(err);
            this.logger.error(`[CLASSIFY] error sessionDbId=${sessionDbId}: ${msg}`, err?.stack || err);
            return {
                ok: false,
                action: 'ERROR',
                sessionDbId,
                step: 'CLASSIFY',
                error: msg,
            };
        }

        if (!result || !result.kind) {
            this.logger.debug(`[SKIP] classifier returned empty/invalid result sessionDbId=${sessionDbId}`);
            return {
                ok: true,
                action: 'SKIPPED',
                sessionDbId,
                reason: 'CLASSIFIER_EMPTY_OR_INVALID',
            };
        }

        // 2) SI ES REGISTRO -> crear
        if (result.kind === 'REGISTRO') {
            if (!result.tipo) {
                this.logger.debug(`[SKIP] kind=REGISTRO but tipo missing sessionDbId=${sessionDbId}`);
                return {
                    ok: true,
                    action: 'SKIPPED',
                    sessionDbId,
                    reason: 'REGISTRO_MISSING_TIPO',
                };
            }

            const payload = {
                sessionId: sessionDbId,
                tipo: result.tipo as TipoRegistro,
                estado: result.estado,
                resumen: result.resumen,
                detalles: result.detalles,
                lead: result.lead,
                nombre: result.nombre,
                meta: result.meta,
                fecha: new Date(),
            };

            this.logger.debug(`[CREATE_REGISTRO] payload=${JSON.stringify(payload)}`);

            try {
                const created = await this.registroService.createRegistro(payload as any);

                if (!created.ok) {
                    this.logger.error(
                        `[CREATE_REGISTRO] failed sessionDbId=${sessionDbId} error=${created.error}`,
                    );

                    return {
                        ok: false,
                        action: 'ERROR',
                        sessionDbId,
                        step: 'CREATE_REGISTRO',
                        error: created.error,
                    };
                }

                this.logger.debug(
                    `[CREATE_REGISTRO] success sessionDbId=${sessionDbId} registroId=${created.registroId}`,
                );

                this.logger.log(
                    `Registro creado: tipo=${payload.tipo} estado=${payload.estado ?? '-'} sessionId=${sessionDbId}`,
                );

                return {
                    ok: true,
                    action: 'CREATED_REGISTRO',
                    sessionDbId,
                    tipo: payload.tipo,
                    estado: payload.estado,
                    registroId: created.registroId,
                    resumen: payload.resumen,
                };
            } catch (err: any) {
                const msg = err?.message || String(err);
                this.logger.error(
                    `[CREATE_REGISTRO] exception sessionDbId=${sessionDbId}: ${msg}`,
                    err?.stack || err,
                );
                return {
                    ok: false,
                    action: 'ERROR',
                    sessionDbId,
                    step: 'CREATE_REGISTRO',
                    error: msg,
                };
            }
        }

        // 3) REPORTE -> actualizar síntesis
        const sintesis = result.sintesis ?? result.resumen ?? '';
        if (!sintesis || !sintesis.trim()) {
            this.logger.debug(`[SKIP] kind=REPORTE but sintesis empty sessionDbId=${sessionDbId}`);
            return {
                ok: true,
                action: 'SKIPPED',
                sessionDbId,
                reason: 'REPORTE_EMPTY_SINTESIS',
            };
        }

        this.logger.debug(
            `[UPDATE_SINTESIS] sessionDbId=${sessionDbId} sintesisLength=${sintesis.length}`,
        );

        try {
            await this.reporteService.updateSintesis(sessionDbId, sintesis);
            this.logger.debug(`[UPDATE_SINTESIS] success sessionDbId=${sessionDbId}`);
            this.logger.log(`Síntesis actualizada sessionId=${sessionDbId}`);

            return {
                ok: true,
                action: 'UPDATED_SINTESIS',
                sessionDbId,
                sintesisLength: sintesis.length,
            };
        } catch (err: any) {
            const msg = err?.message || String(err);
            this.logger.error(
                `[UPDATE_SINTESIS] error sessionDbId=${sessionDbId}: ${msg}`,
                err?.stack || err,
            );
            return {
                ok: false,
                action: 'ERROR',
                sessionDbId,
                step: 'UPDATE_SINTESIS',
                error: msg,
            };
        }
    }
}