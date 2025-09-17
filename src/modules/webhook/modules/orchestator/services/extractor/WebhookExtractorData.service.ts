import { Injectable } from "@nestjs/common";
import { User } from "@prisma/client";
//Services
import { InstancesService } from "src/modules/instances/instances.service";
import { UserService } from "src/modules/user/user.service";
//Dto
import { ClientData } from "src/modules/webhook/dto/client-data";
import { UserContext } from "src/modules/webhook/dto/user-context";
import { WebhookBodyDto, WebhookDataDto } from "src/modules/webhook/dto/webhook-body";
import { MessageTypeHandlerService } from "src/modules/webhook/services/message-type-handler/message-type-handler.service";

@Injectable()
export class WebhookExtractorDataService {
    constructor(
        private readonly instancesService: InstancesService,
        private readonly userService: UserService,
        private readonly messageTypeHandlerService:MessageTypeHandlerService
    
    ) {

    }
    async getClientData(data: WebhookDataDto): Promise<ClientData> {

        const remoteJid = data?.key?.remoteJid ?? '';
        const pushName = data?.pushName || 'Desconocido';
        const conversationMsg = (data?.message?.conversation ?? '').trim().toLowerCase();
        const fromMe = data?.key?.fromMe ?? false;
        const messageType = data?.messageType ?? '';
        const mediaUrl = data.message?.mediaUrl?? ''
        const mediaType = data.message?.audioMessage?.mimetype||data.message?.imageMessage?.mimetype||''

        //Objeto cliente 
        const clientData = new ClientData(remoteJid, pushName, conversationMsg, fromMe, messageType,mediaUrl,mediaType,this.messageTypeHandlerService,);
        return clientData
    }
    async getUserData(body: WebhookBodyDto): Promise<UserContext> {
        const {
            instance: instanceName,
            server_url,
            apikey,
        } = body;

        // Lógica para obtener el usuario y la instancia
        const prismaInstancia = await this.instancesService.getUserId(instanceName);
        if (!prismaInstancia) throw new Error('Instancia no encontrada');
        //Se busca la informacion del usuario en la aplicacion a partir de su instancia en evolution api
        const userId = prismaInstancia?.userId ?? '';
        const instanceId = prismaInstancia?.instanceId ?? '';
        /* user information */
        const user = await this.userService.getUserById(userId) as User;
        const llmClientApikey = user?.apiUrl as string

        const userContext = new UserContext(
            //Datos del usuario
            userId,
            instanceId,
            instanceName,
            apikey,
            llmClientApikey,
            `${server_url}/message/sendText/${instanceName}`,
            user?.webhookUrl ?? '',
            user.notificationNumber,
            user.muteAgentResponses,
            user.del_seguimiento ?? '',
            user.autoReactivate ?? '',

            //Inyeccion de servicio del usuario e instancia
            this.instancesService,
            this.userService,
        )
        return userContext
    }
}