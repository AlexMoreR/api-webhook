import { Module } from '@nestjs/common';
import { WebhookModule } from './webhook/webhook.module';
import { ServicesService } from './services/services.service';
import { PrismaService } from './prisma.service';
import { SessionService } from './session/session.service';

@Module({
  imports: [WebhookModule],
  providers: [ServicesService, PrismaService, SessionService],
})
export class AppModule {}
