import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; // <-- importa HttpModule
import { ConfigModule } from '@nestjs/config'; // <-- también debes tenerlo para ConfigService
import { AiAgentService } from './ai-agent.service';
import { PromptService } from '../prompt/prompt.service';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { IntentionService } from './services/intention/intention.service';
import { NodeSenderService } from '../workflow/services/node-sender.service.ts/node-sender.service';

@Module({
  imports: [
    HttpModule, 
    ConfigModule, // necesario porque usas ConfigService
  ],
  providers: [AiAgentService, PromptService, ChatHistoryService, IntentionService, NodeSenderService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
