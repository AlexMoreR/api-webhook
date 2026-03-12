import { CrmFollowUpStatus, LeadStatus } from '@prisma/client';

import { CrmFollowUpPlannerService } from './crm-follow-up-planner.service';

describe('CrmFollowUpPlannerService', () => {
  const prisma = {
    session: {
      findUnique: jest.fn(),
    },
    crmFollowUp: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const logger = {
    log: jest.fn(),
  };

  const crmFollowUpRuleService = {
    getRuleForUser: jest.fn(),
  };

  let service: CrmFollowUpPlannerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-11T15:00:00.000Z'));

    service = new CrmFollowUpPlannerService(
      prisma as any,
      logger as any,
      crmFollowUpRuleService as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancela pendientes cuando el lead queda finalizado', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 20,
      remoteJid: '573001111111@s.whatsapp.net',
      instanceId: 'inst-1',
    });
    prisma.crmFollowUp.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.syncFromLeadStatus({
      sessionId: 20,
      userId: 'user-1',
      leadStatus: LeadStatus.FINALIZADO,
      summary: 'Compra cerrada y completada.',
      sourceHash: 'hash-finalizado',
      sourceReportId: 300,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        action: 'CANCELLED_PENDING',
        count: 2,
      }),
    );
    expect(prisma.crmFollowUp.create).not.toHaveBeenCalled();
  });

  it('crea un crm follow-up nuevo usando la regla vigente', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      remoteJid: '573002222222@s.whatsapp.net',
      instanceId: 'inst-2',
    });
    prisma.crmFollowUp.updateMany.mockResolvedValue({ count: 0 });
    prisma.crmFollowUp.findFirst.mockResolvedValue(null);
    prisma.crmFollowUp.create.mockImplementation(async ({ data }: any) => ({
      id: 'cfu_1',
      scheduledFor: data.scheduledFor,
    }));
    crmFollowUpRuleService.getRuleForUser.mockResolvedValue({
      ruleKey: 'tibio-default',
      enabled: true,
      delayMinutes: 60,
      maxAttempts: 3,
      goal: 'Retomar la conversacion',
      prompt: 'Habla claro y breve',
      fallbackMessage: 'Seguimos atentos.',
      allowedWeekdays: [1, 2, 3, 4, 5],
      sendStartTime: '09:00',
      sendEndTime: '18:00',
      timezone: 'America/Bogota',
    });

    const result = await service.syncFromLeadStatus({
      sessionId: 21,
      userId: 'user-2',
      leadStatus: LeadStatus.TIBIO,
      summary: 'Pidio precio, disponibilidad y quiere retomar esta semana.',
      sourceHash: 'hash-tibio',
      sourceReportId: 301,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        action: 'CREATED',
        followUpId: 'cfu_1',
      }),
    );
    expect(prisma.crmFollowUp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 21,
          userId: 'user-2',
          leadStatusSnapshot: LeadStatus.TIBIO,
          status: CrmFollowUpStatus.PENDING,
          scheduledFor: new Date('2026-03-11T16:00:00.000Z'),
        }),
        select: {
          id: true,
          scheduledFor: true,
        },
      }),
    );
  });
});
