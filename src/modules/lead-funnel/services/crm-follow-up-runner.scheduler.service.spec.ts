import { CrmFollowUpRunnerSchedulerService } from './crm-follow-up-runner.scheduler.service';

describe('CrmFollowUpRunnerSchedulerService', () => {
  const configService = {
    get: jest.fn(),
  };

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  };

  const runner = {
    processDueFollowUps: jest.fn(),
  };

  let service: CrmFollowUpRunnerSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CrmFollowUpRunnerSchedulerService(
      configService as any,
      logger as any,
      runner as any,
    );
  });

  it('no inicia el scheduler si esta deshabilitado', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'crmFollowUpRunner.enabled') return 'false';
      return undefined;
    });

    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({} as NodeJS.Timeout);

    await service.onModuleInit();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'CRM follow-up runner scheduler deshabilitado por configuracion.',
      'CrmFollowUpRunnerSchedulerService',
    );

    setIntervalSpy.mockRestore();
  });

  it('ejecuta el runner con el limite configurado y evita solapes', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'crmFollowUpRunner.limit': '7',
      };
      return values[key];
    });
    runner.processDueFollowUps.mockResolvedValue({
      due: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });

    const internal = service as any;
    await internal.runTick();

    expect(runner.processDueFollowUps).toHaveBeenCalledWith(7);
    expect(logger.log).toHaveBeenCalledWith(
      'CRM follow-up runner ejecutado. due=1 sent=1 failed=0 skipped=0',
      'CrmFollowUpRunnerSchedulerService',
    );

    internal.isRunning = true;
    await internal.runTick();

    expect(runner.processDueFollowUps).toHaveBeenCalledTimes(1);
  });
});
