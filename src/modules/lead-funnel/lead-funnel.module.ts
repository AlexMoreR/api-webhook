import { Module } from '@nestjs/common';
import { LeadFunnelService } from './services/lead-funnel/lead-funnel.service';
import { LeadClassifierIaService } from './services/lead-classifier-ia/lead-classifier-ia.service';
import { RegistroService } from './services/registro/registro.service';
import { ReporteSintesisService } from './services/reporte-sintesis/reporte-sintesis.service';
import { LeadFunnelController } from './lead-funnel.controller';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [AiAgentModule],
  providers: [
    LeadFunnelService,
    LeadClassifierIaService,
    RegistroService,
    ReporteSintesisService,
  ],
  controllers: [LeadFunnelController],
  exports: [LeadFunnelService], 
})
export class LeadFunnelModule {}
