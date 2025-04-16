import { Module } from '@nestjs/common';
import { WebhookModule } from './webhook/webhook.module';
import { ServicesService } from './services/services.service';
import { ServicesService } from './services/services.service';

@Module({
  imports: [WebhookModule],
  providers: [ServicesService],
})
export class AppModule {}
