import type { ConfigService } from '@nestjs/config';

import { LoggerService } from 'src/core/logger/logger.service';

import { BillingCronService } from './billing-cron.service';

describe('BillingCronService', () => {
  const getConfigMock = jest.fn();
  const configService: Pick<ConfigService, 'get'> = {
    get: getConfigMock,
  };

  const logger: Pick<LoggerService, 'log' | 'warn' | 'error'> = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  let service: BillingCronService;
  const originalFetch = global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingCronService(
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
    );
    fetchMock = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('omite la ejecucion si aun no llega la hora configurada', async () => {
    getConfigMock.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'billingCron.hour': '10',
        'billingCron.minute': '0',
        'billingCron.timeZone': 'America/Bogota',
        'billingCron.endpointUrl': 'https://app.verzay.co/api/cron/billing',
      };
      return values[key];
    });

    const result = await service.execute({
      source: 'scheduler',
      now: new Date('2026-03-19T14:59:00.000Z'),
    });

    expect(result.triggered).toBe(false);
    expect(result.skippedReason).toBe('NOT_DUE');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ejecuta una sola vez por ventana diaria y evita duplicados', async () => {
    getConfigMock.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'billingCron.hour': '10',
        'billingCron.minute': '0',
        'billingCron.timeZone': 'America/Bogota',
        'billingCron.endpointUrl': 'https://app.verzay.co/api/cron/billing',
        'billingCron.secret': 'test-secret',
        'billingCron.timeoutMs': '5000',
      };
      return values[key];
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({ success: true })),
    } as unknown as Response);

    const first = await service.execute({
      source: 'scheduler',
      now: new Date('2026-03-19T15:00:00.000Z'),
    });
    const second = await service.execute({
      source: 'scheduler',
      now: new Date('2026-03-19T15:05:00.000Z'),
    });

    expect(first.success).toBe(true);
    expect(first.triggered).toBe(true);
    expect(second.triggered).toBe(false);
    expect(second.skippedReason).toBe('ALREADY_RAN');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('permite ejecucion manual forzada aunque ya exista corrida del dia', async () => {
    getConfigMock.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'billingCron.hour': '10',
        'billingCron.minute': '0',
        'billingCron.timeZone': 'America/Bogota',
        'billingCron.endpointUrl': 'https://app.verzay.co/api/cron/billing',
      };
      return values[key];
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({ success: true })),
    } as unknown as Response);

    await service.execute({
      source: 'scheduler',
      now: new Date('2026-03-19T15:00:00.000Z'),
    });
    const forced = await service.execute({
      source: 'manual',
      force: true,
      now: new Date('2026-03-19T15:01:00.000Z'),
    });

    expect(forced.success).toBe(true);
    expect(forced.triggered).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
