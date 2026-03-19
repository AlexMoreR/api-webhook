import {
  Body,
  Controller,
  Headers,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { Response } from 'express';
import { LoggerService } from 'src/core/logger/logger.service';
import { BillingCronService } from './services/billing-cron/billing-cron.service';
import { WebhookBodyDto } from './dto/webhook-body';

@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly logger: LoggerService,
    private readonly billingCronService: BillingCronService,
  ) {}

  @Post()
  recibirWebhook(@Body() payload: WebhookBodyDto, @Res() res: Response) {
    void this.logger.log(
      `Webhook recibido: ${JSON.stringify(payload).slice(0, 500)}`,
    );
    // 1. Responde inmediatamente al remitente del webhook.
    // Esto libera su conexión rápidamente, evitando timeouts y reintentos.
    res.status(200).send('Webhook recibido, procesando en segundo plano');

    // 2. Inicia el proceso pesado sin esperar el 'await'.
    // Aquí usamos .then().catch() o simplemente dejamos la promesa "flotando".
    void this.webhookService.processWebhook(payload).catch((error: unknown) => {
      void this.logger.error(
        `Error asíncrono en el webhook: ${JSON.stringify(error)}`,
      );
      // No se puede enviar error 500 al remitente, la respuesta ya fue enviada.
    });
    // El hilo de ejecución se libera aquí.
  }

  @Post('billing/process')
  async processBillingCron(
    @Body() body: { force?: boolean } | undefined,
    @Headers('x-runner-key') runnerKey?: string,
  ) {
    const expectedKey =
      (process.env.BILLING_CRON_RUNNER_KEY ?? '').trim() ||
      (process.env.FOLLOW_UP_RUNNER_KEY ?? '').trim();

    if (expectedKey && runnerKey !== expectedKey) {
      throw new UnauthorizedException('runner key invalida');
    }

    return this.billingCronService.execute({
      source: 'manual',
      force: body?.force !== false,
    });
  }
}
