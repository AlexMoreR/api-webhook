import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaService } from 'src/database/prisma.service';
import { LoggerService } from 'src/core/logger/logger.service';
import { AiAgentModule } from 'src/modules/ai-agent/ai-agent.module';
import { WorkflowModule } from 'src/modules/workflow/workflow.module';

import { PaymentReceiptAnalyzerService } from './services/payment-receipt-analyzer.service';
import { PaymentReceiptValidatorService } from './services/payment-receipt-validator.service';
import { PaymentClientMatcherService } from './services/payment-client-matcher.service';
import { PaymentReceiptProcessorService } from './services/payment-receipt-processor.service';
import { WompiService } from './wompi/wompi.service';

@Module({
  imports: [
    ConfigModule,
    AiAgentModule,   // provee LlmClientFactory, NodeSenderService
    WorkflowModule,  // provee NodeSenderService (también exportado desde AiAgentModule)
  ],
  providers: [
    PrismaService,
    LoggerService,
    PaymentReceiptAnalyzerService,
    PaymentReceiptValidatorService,
    PaymentClientMatcherService,
    PaymentReceiptProcessorService,
    WompiService,
  ],
  exports: [PaymentReceiptProcessorService, WompiService],
})
export class PaymentReceiptModule {}
