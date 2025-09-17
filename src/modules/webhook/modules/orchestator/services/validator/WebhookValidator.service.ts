import { Injectable, LoggerService } from "@nestjs/common";
import { Pausar, User } from "@prisma/client";
import { AiCreditsService } from "src/modules/ai-credits/ai-credits.service";
import { SessionTriggerService } from "src/modules/session-trigger/session-trigger.service";
import { SessionService } from "src/modules/session/session.service";
import { NodeSenderService } from "src/modules/workflow/services/node-sender.service.ts/node-sender.service";
import { CreditValidationInput, getReactivateDate, onAutoRepliesInterface, stopOrResumeConversation } from "src/types/open-ai";
import { isGroupChat } from "src/modules/webhook/utils/is-group-chat";
import { MessageDirectionService } from "src/modules/webhook/services/message-direction/message-direction.service";
import { ClientData } from "src/modules/webhook/dto/client-data";
import { UserContext } from "src/modules/webhook/dto/user-context";
import { SeguimientosService } from "src/modules/seguimientos/seguimientos.service";
import { AutoRepliesService } from "src/modules/auto-replies/auto-replies.service";
import { WorkflowService } from "src/modules/workflow/services/workflow.service.ts/workflow.service";
import { AntifloodService } from "src/modules/webhook/services/antiflood/antiflood.service";

@Injectable()
export class WebhookValidatorService {
    constructor(

        private readonly logger: LoggerService,
        private readonly aiCreditsService: AiCreditsService,
        private readonly nodeSenderService: NodeSenderService,
        private readonly sessionService: SessionService,
        private readonly sessionTriggerService: SessionTriggerService,
        private readonly messageDirectionService: MessageDirectionService,
        private readonly seguimientosService: SeguimientosService,
        private readonly autoRepliesService: AutoRepliesService,
        private readonly workflowService: WorkflowService,
        private readonly antifloodService: AntifloodService,



    ) { }
    async getReactivateDate({ userWithRelations }: getReactivateDate): Promise<string | null> {
        if (!userWithRelations) {
            this.logger.error('Se esperaba el userWithRelations para reactivar el chat.');
            return null;
        }

        const minutesToReactivate = parseInt(userWithRelations.autoReactivate ?? '');
        if (isNaN(minutesToReactivate)) {
            this.logger.error(`Valor inválido para autoReactivate: "${userWithRelations.autoReactivate}"`);
            return null;
        }

        const MILLISECONDS_PER_MINUTE = 60000;
        const currentDate = new Date();
        const futureDate = new Date(currentDate.getTime() + minutesToReactivate * MILLISECONDS_PER_MINUTE);

        // Formateamos la fecha como string
        const formatDate = (date: Date): string => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            const day = pad(date.getDate());
            const month = pad(date.getMonth() + 1);
            const year = date.getFullYear();
            const hours = pad(date.getHours());
            const minutes = pad(date.getMinutes());
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        };

        const formatted = formatDate(futureDate);
        return formatted;
    }

    async checkOrRegisterSession(
        remoteJid: string,
        instanceName: string,
        userId: string,
        pushName: string,
        userWithRelations: User & { pausar: Pausar[] }
    ): Promise<boolean> {
        const session = await this.sessionService.getSession(remoteJid, instanceName, userId);
        if (session) {
            this.logger.log(`[SESSION] Usuario ya registrado: ${remoteJid}`, 'WebhookService');

            const hasTrigger = await this.sessionTriggerService.findBySessionId(session.id.toString());
            const dateReactivate = await this.getReactivateDate({ userWithRelations });

            if (!hasTrigger) {
                if (dateReactivate) {
                    await this.sessionTriggerService.create(session.id.toString(), dateReactivate);
                    this.logger.log(`[TRIGGER] Reactivación programada para: ${dateReactivate}`, 'WebhookService');
                }
            } else {
                if (dateReactivate) {
                    await this.sessionTriggerService.updateTimeBySessionId(session.id.toString(), dateReactivate);
                    this.logger.log(`[TRIGGER] Fecha actualizada a: ${dateReactivate}`, 'WebhookService');
                }
            }

            return session.status;
        }

        await this.sessionService.registerSession(userId, remoteJid, pushName, instanceName);
        this.logger.log(`✅ Registro exitoso para ${remoteJid}`, 'WebhookService');
        return true;
    }
    async creditValidation({ userId, flags, webhookUrl, apiUrl, apikey, userPhone }: CreditValidationInput): Promise<boolean> {
        try {
            if (!webhookUrl || webhookUrl.trim() === '') {

                this.logger.warn(`creditValidation: webhookUrl vacío para userId=${userId}`);
                return false;
            }

            const credits = await this.aiCreditsService.getCreditsByUser(userId);

            if (!credits.success) {
                try {
                    await this.nodeSenderService.sendTextNode(apiUrl, apikey, userPhone, flags[0].message);
                } catch (error) {
                    this.logger.error(`Error enviando notificación por flag ${credits.msg}`, error?.message || error);
                }
                return false;
            }

            const { available } = credits;

            this.logger.log(`creditValidation: Créditos disponibles para ${userId} → ${available}`);

            // 1. Analizar flags y notificar si corresponde
            const range = 5; // margen de ±5 créditos

            for (const flag of flags) {
                const min = flag.value - range;
                const max = flag.value + range;

                if (available >= min && available <= max) {
                    this.logger.log(
                        `⚠️ userId=${userId} alcanzó rango de créditos ${flag.value} (dentro de ${min}-${max}). Enviando mensaje... "${flag.message}"`
                    );

                    try {
                        await this.nodeSenderService.sendTextNode(apiUrl, apikey, userPhone, flag.message);
                    } catch (error) {
                        this.logger.error(`Error enviando notificación por flag ${flag.value}`, error?.message || error);
                    }
                }
            }

            // 2. Detener el flujo si no hay créditos
            if (available <= 0) {
                this.logger.error(`❌ SIN CRÉDITOS: Deteniendo flujo para userId=${userId}`);
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error('Error en creditValidation', error?.message || error, 'WebhookService');
            return false;
        }
    }
    isGroupChat(remoteJid: string): boolean {
        return remoteJid.endsWith('@g.us');
    }
    public async isFromMe({ fromMe, conversationMsg, remoteJid, instanceId, sessionStatus, userWithRelations, instanceName, apikey, server_url }) {
        if (this.messageDirectionService.isFromMe(fromMe)) {
            /* Encargada de reanudar o pausar el chat */
            await this.stopOrResumeConversation({ conversationMsg, remoteJid, instanceId, sessionStatus, userWithRelations, instanceName, apikey, server_url });
            return;
        }
    }
    private async stopOrResumeConversation(
        {
            conversationMsg,
            remoteJid,
            instanceId,
            sessionStatus,
            userWithRelations,
            instanceName,
            apikey,
            server_url
        }: stopOrResumeConversation) {


        // Poner el estado del chat en falso
        await this.sessionService.updateSessionStatus(remoteJid, instanceName, false, userWithRelations.id);
        this.logger.log(`Chat pausado.`, 'WebhookService');

        //Pausar chat  
        if (!sessionStatus) {
            // Monitoreo de PAUSA: buscar palabra clave para reactivación
            if (!userWithRelations) {
                this.logger.warn('No se encontró el usuario para obtener la frase de reactivación.', 'WebhookService');
                return;
            }

            const dataPausar = userWithRelations.pausar ?? [];
            const pausarItem = dataPausar.find(p => p.tipo === 'abrir');

            if (!pausarItem) {
                this.logger.warn('El usuario no tiene frase de reactivación configurada.', 'WebhookService');
                return;
            }

            const phraseToReactivateChat = pausarItem.mensaje;
            this.logger.log(`Frase de reactivación del usuario: "${phraseToReactivateChat}"`, 'WebhookService');

            // 3. Verificar si el cliente escribió la frase correcta para reactivar
            if (conversationMsg === phraseToReactivateChat.trim().toLowerCase()) {
                this.logger.log('Frase correcta detectada. Reactivando chat...', 'WebhookService');
                await this.sessionService.updateSessionStatus(remoteJid, instanceName, true, userWithRelations.id);
                return;
            }
        }

        const pharaseToDelSeguimiento = userWithRelations.del_seguimiento ?? '';

        //Eliminar seguimiento
        if (conversationMsg === pharaseToDelSeguimiento.trim().toLowerCase()) {
            this.logger.log('Frase correcta detectada. Eliminando seguimiento...', 'WebhookService');
            try {
                const { count } = await this.seguimientosService.deleteSeguimientosByRemoteJid(remoteJid, instanceName);
                if (count && count > 0) {
                    this.logger.log('Seguimiento eliminado con exito.', 'WebhookService');
                } else {
                    this.logger.log('No se encontró un seguimiento relacionado.', 'WebhookService');
                }
            } catch (error) {
                this.logger.error('ERROR_SEGUIMIENTOS', error);
            }
        };

        //Flujo de respuestas rapidas
        await this.onAutoReplies({
            userId: userWithRelations.id.toString(),
            conversationMsg,
            server_url,
            apikey,
            instanceName,
            remoteJid,
        });
    };
    /**
     * Busca coincidencias de mensajes automáticos configurados para un usuario
     * y ejecuta el workflow correspondiente si encuentra una coincidencia exacta.
     *
     * @private
     * @param {string} userId - ID del usuario que posee las respuestas automáticas configuradas.
     * @param {string} conversationMsg - Mensaje de conversación recibido que se comparará con las respuestas automáticas.
     * @param {string} server_url - URL base del servidor Evolution API para la ejecución del workflow.
     * @param {string} apikey - Clave API para autorización en el servidor Evolution.
     * @param {string} instanceName - Nombre de la instancia de Evolution asociada a la sesión del usuario.
     * @param {string} remoteJid - Identificador remoto del cliente de WhatsApp (por ejemplo, número de teléfono en formato JID).
     * @returns {Promise<void>} - No retorna ningún valor. Ejecuta el workflow asociado o registra errores en el sistema de logs.
     */
    private async onAutoReplies({ userId, conversationMsg, server_url, apikey, instanceName, remoteJid, }: onAutoRepliesInterface): Promise<void> {
        try {
            const autoReplies = await this.autoRepliesService.getAutoRepliesByUserId(userId);

            if (!autoReplies || autoReplies.length === 0) return;

            const matchedReply = autoReplies.find(
                reply => reply.mensaje?.trim().toLowerCase() === conversationMsg
            );

            if (matchedReply) {
                // Aquí puedes ejecutar lo que desees con matchedReply
                // Por ejemplo: enviar la respuesta automática
                this.logger.log(`Respuesta rápida encontrada: ${matchedReply.mensaje}`);
                //Obtener workflow by ID
                const workflow = await this.workflowService.getWorkflowByWorkflowId(matchedReply.workflowId);
                if (!workflow) return;

                await this.workflowService.executeWorkflow(
                    workflow?.name ?? '',
                    server_url,
                    apikey,
                    instanceName,
                    remoteJid,
                    userId
                );
            }
        } catch (error) {
            this.logger.error('Error al procesar autoReplies', error);
        }
    };

    async sessionActive({ remoteJid, userId }): Promise<Boolean> {
        const sessionActive = await this.sessionService.isSessionActive(remoteJid, userId);
        this.logger.log(`Estado de la session: ${sessionActive}`, 'WebhookService');

        if (!sessionActive) {
            // Terminar flujo
            return false;
        }
        return true
    }

    async isSynchronizedPattern(remoteJid: string, instanceName: string, userId: string):Promise<Boolean> {

        /* Registra un nuevo mensaje y evalúa si hay un patrón robótico de sincronía */
        // Primero registramos
        this.antifloodService.registerMessageTimestamp(remoteJid);
        // Luego evaluamos
        if (this.antifloodService.isSynchronizedPattern(remoteJid)) {
            await this.sessionService.updateSessionStatus(remoteJid, instanceName, false, userId);
            return false;
        }
        return true

    }
}