import { Injectable, Logger } from '@nestjs/common';
import { WebhookBodyDto } from '../../dto/webhook-body';


@Injectable()
class WebhookOrchestatorService{

    private extractRequest(body: WebhookBodyDto){
        return {
            
        }
    }
    
}