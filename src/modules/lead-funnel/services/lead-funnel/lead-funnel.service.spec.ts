import { LeadStatus } from '@prisma/client';

import { LeadFunnelService } from './lead-funnel.service';

describe('LeadFunnelService', () => {
  const classifier = {
    classify: jest.fn(),
  };

  const registroService = {
    createRegistro: jest.fn(),
    upsertReporte: jest.fn(),
  };

  const leadStatusIaService = {
    refreshFromLatestReporte: jest.fn(),
  };

  const crmFollowUpPlannerService = {
    syncFromLeadStatus: jest.fn(),
  };

  const crmFollowUpRunnerService = {
    cancelPendingOnReply: jest.fn(),
  };

  let service: LeadFunnelService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new LeadFunnelService(
      classifier as any,
      registroService as any,
      leadStatusIaService as any,
      crmFollowUpPlannerService as any,
      crmFollowUpRunnerService as any,
    );

    crmFollowUpRunnerService.cancelPendingOnReply.mockResolvedValue({ count: 0 });
    registroService.upsertReporte.mockResolvedValue(undefined);
    classifier.classify.mockResolvedValue({
      kind: 'REPORTE',
      sintesis:
        'El cliente pidio informacion detallada, comparo opciones y solicito precio final para decidir esta semana.',
    });
  });

  it('omite la clasificacion de lead cuando la feature esta deshabilitada', async () => {
    const result = await service.processIncomingText({
      userId: 'user-1',
      instanceId: 'inst-1',
      remoteJid: '573001111111@s.whatsapp.net',
      sessionDbId: 100,
      text: 'Quiero conocer el precio y las opciones disponibles.',
      enabledLeadStatusClassifier: false,
      enabledCrmFollowUps: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        action: 'UPDATED_SINTESIS',
        sessionDbId: 100,
      }),
    );
    expect(registroService.upsertReporte).toHaveBeenCalledWith(
      100,
      expect.stringContaining('precio final'),
    );
    expect(leadStatusIaService.refreshFromLatestReporte).not.toHaveBeenCalled();
    expect(crmFollowUpPlannerService.syncFromLeadStatus).not.toHaveBeenCalled();
  });

  it('clasifica lead pero no planifica follow-up cuando esa feature esta deshabilitada', async () => {
    leadStatusIaService.refreshFromLatestReporte.mockResolvedValue({
      applied: true,
      sessionId: 101,
      leadStatus: LeadStatus.TIBIO,
      reason: 'Pidio precio y disponibilidad.',
      sourceHash: 'hash-101',
      sourceReportId: 501,
      summary:
        'El cliente pidio precio, disponibilidad y dijo que revisara la propuesta durante la semana.',
    });

    const result = await service.processIncomingText({
      userId: 'user-2',
      instanceId: 'inst-2',
      remoteJid: '573002222222@s.whatsapp.net',
      sessionDbId: 101,
      text: 'Enviame por favor la cotizacion completa.',
      enabledLeadStatusClassifier: true,
      enabledCrmFollowUps: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        action: 'UPDATED_SINTESIS',
        sessionDbId: 101,
      }),
    );
    expect(leadStatusIaService.refreshFromLatestReporte).toHaveBeenCalledWith({
      sessionId: 101,
      userId: 'user-2',
    });
    expect(crmFollowUpPlannerService.syncFromLeadStatus).not.toHaveBeenCalled();
  });
});
