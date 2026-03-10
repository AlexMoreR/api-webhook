import { Controller, Post, Body, Headers, Res, UnauthorizedException } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { Response } from 'express';
import { LoggerService } from 'src/core/logger/logger.service';
import { FollowUpRunnerService } from './services/follow-up-runner/follow-up-runner.service';

@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly logger: LoggerService,
    private readonly followUpRunnerService: FollowUpRunnerService,
  ) { }

  @Post()
  async recibirWebhook(@Body() payload: any, @Res() res: Response) {
    this.logger.log(`Webhook recibido: ${JSON.stringify(payload).slice(0, 500)}`);
    // 1. Responde inmediatamente al remitente del webhook.
    // Esto libera su conexión rápidamente, evitando timeouts y reintentos.
    res.status(200).send('Webhook recibido, procesando en segundo plano');

    // 2. Inicia el proceso pesado sin esperar el 'await'.
    // Aquí usamos .then().catch() o simplemente dejamos la promesa "flotando".
    this.webhookService.processWebhook(payload)
      .catch(error => {
        this.logger.error(`Error asíncrono en el webhook: ${JSON.stringify(error)}`);
        // No se puede enviar error 500 al remitente, la respuesta ya fue enviada.
      });
    // El hilo de ejecución se libera aquí.
  }

  @Post('follow-up/process')
  async processFollowUps(
    @Body() body: { limit?: number; userId?: string; instanceId?: string; remoteJid?: string } | undefined,
    @Headers('x-runner-key') runnerKey?: string,
  ) {
    const expectedKey = (process.env.FOLLOW_UP_RUNNER_KEY ?? '').trim();
    if (expectedKey && runnerKey !== expectedKey) {
      throw new UnauthorizedException('runner key invalida');
    }

    const requestedLimit = Number(body?.limit ?? 25);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 25;

    return this.followUpRunnerService.processDueFollowUps(limit, {
      userId: body?.userId?.trim() || undefined,
      instanceId: body?.instanceId?.trim() || undefined,
      remoteJid: body?.remoteJid?.trim() || undefined,
    });
  }

}
