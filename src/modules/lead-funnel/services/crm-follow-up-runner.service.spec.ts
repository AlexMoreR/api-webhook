import { CrmFollowUpStatus, LeadStatus } from '@prisma/client';

import { CrmFollowUpRunnerService } from './crm-follow-up-runner.service';

describe('CrmFollowUpRunnerService', () => {
  const prisma = {
    crmFollowUp: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const logger = {
    error: jest.fn(),
  };

  const aiAgentService = {
    generateFollowUpMessage: jest.fn(),
  };

  const chatHistoryService = {
    saveMessage: jest.fn(),
  };

  const nodeSenderService = {
    sendTextNode: jest.fn(),
  };

  const crmFollowUpRuleService = {
    getRuleForUser: jest.fn(),
  };

  let service: CrmFollowUpRunnerService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new CrmFollowUpRunnerService(
      prisma as any,
      logger as any,
      aiAgentService as any,
      chatHistoryService as any,
      nodeSenderService as any,
      crmFollowUpRuleService as any,
    );
  });

  it('cancela el follow-up al procesar si la feature del usuario esta deshabilitada', async () => {
    prisma.crmFollowUp.findMany.mockResolvedValue([
      {
        id: 'cfu-1',
        userId: 'user-1',
        leadStatusSnapshot: LeadStatus.TIBIO,
        attemptCount: 0,
        maxAttempts: 2,
        scheduledFor: new Date('2026-03-14T10:00:00.000Z'),
        createdAt: new Date('2026-03-14T09:00:00.000Z'),
      },
    ]);
    prisma.crmFollowUp.updateMany.mockResolvedValue({ count: 1 });
    prisma.crmFollowUp.findUnique.mockResolvedValue({
      id: 'cfu-1',
      userId: 'user-1',
      remoteJid: '573001111111@s.whatsapp.net',
      instanceId: 'inst-1',
      leadStatusSnapshot: LeadStatus.TIBIO,
      session: {
        id: 10,
        remoteJid: '573001111111@s.whatsapp.net',
        instanceId: 'inst-1',
        pushName: 'Cliente',
      },
      user: {
        enabledCrmFollowUps: false,
        apiKey: {
          url: 'https://evo.example.com',
          key: 'secret',
        },
      },
    });

    const summary = await service.processDueFollowUps(10, { userId: 'user-1' });

    expect(summary).toEqual({
      scanned: 1,
      due: 1,
      sent: 0,
      failed: 0,
      skipped: 1,
    });
    expect(prisma.crmFollowUp.update).toHaveBeenCalledWith({
      where: { id: 'cfu-1' },
      data: {
        status: CrmFollowUpStatus.CANCELLED,
        cancelledAt: expect.any(Date),
        lastProcessedAt: expect.any(Date),
      },
    });
    expect(crmFollowUpRuleService.getRuleForUser).not.toHaveBeenCalled();
    expect(aiAgentService.generateFollowUpMessage).not.toHaveBeenCalled();
  });
});
