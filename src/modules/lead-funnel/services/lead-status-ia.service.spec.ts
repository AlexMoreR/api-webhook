import { createHash } from 'crypto';

import { LeadStatus } from '@prisma/client';

import { LeadStatusIaService } from './lead-status-ia.service';

describe('LeadStatusIaService', () => {
  const prisma = {
    session: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userAiConfig: {
      findFirst: jest.fn(),
    },
    aiProvider: {
      findUnique: jest.fn(),
    },
    aiModel: {
      findUnique: jest.fn(),
    },
  };

  const llmClientFactory = {
    getClient: jest.fn(),
  };

  const logger = {
    warn: jest.fn(),
  };

  let service: LeadStatusIaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeadStatusIaService(
      prisma as any,
      llmClientFactory as any,
      logger as any,
    );
  });

  it('omite la clasificacion cuando el resumen es muy corto', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 10,
      leadStatus: LeadStatus.FRIO,
      leadStatusSourceHash: null,
      registros: [{ id: 99, resumen: 'Muy corto' }],
    });

    const result = await service.refreshFromLatestReporte({
      sessionId: 10,
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        reason: 'SUMMARY_TOO_SHORT',
      }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
    expect(llmClientFactory.getClient).not.toHaveBeenCalled();
  });

  it('evita volver a clasificar cuando el resumen no cambio', async () => {
    const resumen =
      'El cliente pidio informacion detallada, esta comparando opciones y solicito precio final.';
    const sourceHash = createHash('sha1').update(resumen).digest('hex');

    prisma.session.findUnique.mockResolvedValue({
      id: 11,
      leadStatus: LeadStatus.TIBIO,
      leadStatusSourceHash: sourceHash,
      registros: [{ id: 100, resumen }],
    });

    const result = await service.refreshFromLatestReporte({
      sessionId: 11,
      userId: 'user-2',
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        reason: 'UNCHANGED_SOURCE',
        sourceHash,
        leadStatus: LeadStatus.TIBIO,
      }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
    expect(llmClientFactory.getClient).not.toHaveBeenCalled();
  });

  it('usa el fallback heuristico cuando la IA no esta disponible', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 12,
      leadStatus: LeadStatus.FRIO,
      leadStatusSourceHash: null,
      registros: [
        {
          id: 101,
          resumen:
            'El cliente dijo: quiero contratar hoy mismo, te pago esta tarde y quiero avanzar cuanto antes.',
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValue({
      defaultProviderId: null,
      defaultAiModelId: null,
    });

    const result = await service.refreshFromLatestReporte({
      sessionId: 12,
      userId: 'user-3',
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: true,
        leadStatus: LeadStatus.CALIENTE,
      }),
    );
    expect(prisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        data: expect.objectContaining({
          leadStatus: LeadStatus.CALIENTE,
        }),
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });
});
