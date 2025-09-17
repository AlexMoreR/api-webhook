import { Injectable, Logger } from '@nestjs/common';
import { WebhookBodyDto } from '../../dto/webhook-body';
import { ClientData } from '../../dto/client-data';
import { UserContext } from '../../dto/user-context';
import { InstancesService } from 'src/modules/instances/instances.service';
import { UserService } from 'src/modules/user/user.service';
import { Pausar, User } from '@prisma/client';
import { WebhookExtractorDataService } from './services/extractor/WebhookExtractorData.service';
import { WebhookValidatorService } from './services/validator/WebhookValidator.service';
import { flags } from 'src/types/open-ai';


@Injectable()
export class WebhookOrchestatorService {
    constructor(
        private readonly instancesService: InstancesService,
        private readonly userService: UserService,
        private readonly webhookExtractorDataService: WebhookExtractorDataService,
        private readonly webhookValidatorService: WebhookValidatorService,
    ) {

    }

    async extractRequest(body: WebhookBodyDto): Promise<{ clientData: ClientData, userContext: UserContext }> {
        // Se extraen los datos de la llamada del webhook
        const { data } = body
        const userContext = await this.webhookExtractorDataService.getUserData(body)
        const clientData = await this.webhookExtractorDataService.getClientData(data)
        const sessionStatus = {}

        return { clientData, userContext }
    }

    async validateRequest(clientData: ClientData, userContext: UserContext): Promise<Boolean> {

        let success = false
        const creditOk = this.webhookValidatorService.creditValidation({
            userId: userContext.id,
            apikey: userContext.evoApikey,
            apiUrl: userContext.apiUrl,
            flags,
            userPhone:userContext.notificationNumber,
            webhookUrl:userContext.webhookUrl,
        })

        if(!creditOk){
            success = false
        }

        clientData.getExtractedContent(userContext)


        


        return success
    }

    createResponse() { }

}