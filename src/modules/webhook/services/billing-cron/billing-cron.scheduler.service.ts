import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { LoggerService } from 'src/core/logger/logger.service';

import { BillingCronService } from './billing-cron.service';

@Injectable()
export class BillingCronSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly logger: LoggerService,
    private readonly billingCronService: BillingCronService,
  ) {}

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  async onModuleInit() {
    const settings = this.billingCronService.getSettings();

    if (!settings.enabled) {
      await this.logger.log(
        'Billing cron scheduler deshabilitado por configuracion.',
        'BillingCronSchedulerService',
      );
      return;
    }

    this.timer = setInterval(() => {
      void this.runTick();
    }, settings.intervalMs);

    await this.logger.log(
      `Billing cron scheduler iniciado. Intervalo=${settings.intervalMs}ms hora=${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')} tz=${settings.timeZone}`,
      'BillingCronSchedulerService',
    );
  }

  onModuleDestroy() {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
  }

  private async runTick() {
    if (this.isRunning) {
      await this.logger.warn(
        'Se omite una corrida del billing cron porque la anterior sigue en ejecucion.',
        'BillingCronSchedulerService',
      );
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.billingCronService.execute({
        source: 'scheduler',
      });

      if (result.triggered && result.success) {
        await this.logger.log(
          `Billing cron procesado. slot=${result.slotKey} status=${result.statusCode ?? 200}`,
          'BillingCronSchedulerService',
        );
      } else if (
        !result.success &&
        result.skippedReason !== 'MISSING_ENDPOINT'
      ) {
        await this.logger.error(
          'Error ejecutando billing cron scheduler.',
          result.error ?? result.message,
          'BillingCronSchedulerService',
        );
      } else if (result.skippedReason === 'MISSING_ENDPOINT') {
        await this.logger.warn(result.message, 'BillingCronSchedulerService');
      }
    } catch (error: unknown) {
      await this.logger.error(
        'Error ejecutando billing cron scheduler.',
        this.getErrorMessage(error),
        'BillingCronSchedulerService',
      );
    } finally {
      this.isRunning = false;
    }
  }
}
