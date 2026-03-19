import { Injectable } from '@nestjs/common';
import { LoggerService } from 'src/core/logger/logger.service';
import { InstancesService } from 'src/modules/instances/instances.service';

interface ToggleWebhookParams {
  userId: string;
  enable: boolean;
  webhookUrl: string;
}

@Injectable()
export class WebhookControlService {
  constructor(
    private readonly logger: LoggerService,
    private readonly instancesService: InstancesService,
  ) {}

  /**
   * 🔁 toggleWebhook
   * Activa o desactiva el webhook de una instancia para un usuario dado.
   *
   * @param {ToggleWebhookParams} params - Parámetros con userId, estado (enable) y webhookUrl
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  public async toggleWebhook({
    userId,
    enable,
    webhookUrl,
  }: ToggleWebhookParams): Promise<{ success: boolean; message: string }> {
    if (!userId || typeof userId !== 'string' || !webhookUrl) {
      this.logger.warn('toggleWebhook: parámetros inválidos o faltantes');
      return { success: false, message: 'Faltan parámetros requeridos.' };
    }

    try {
      const instances = await this.instancesService.getInstances(userId);

      if (!instances?.length) {
        this.logger.warn(
          `No se encontraron instancias activas para userId=${userId}`,
        );
        return {
          success: false,
          message: 'No se encontraron instancias activas.',
        };
      }

      const { instanceName, instanceId, serverUrl } = instances[0] ?? {};

      if (!instanceName || !instanceId || !serverUrl) {
        this.logger.warn(`Instancia incompleta para userId=${userId}`);
        return {
          success: false,
          message: 'La instancia está incompleta o no tiene datos válidos.',
        };
      }

      const evoAPI = `https://${serverUrl}/webhook/set/${instanceName}`;

      this.logger.log(
        `Enviando solicitud webhook a ${evoAPI} para userId=${userId}`,
      );

      const response = await fetch(evoAPI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: instanceId,
        },
        body: JSON.stringify({
          webhook: {
            enabled: enable,
            url: webhookUrl,
            base64: true,
            events: ['MESSAGES_UPSERT'],
          },
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorDetail = '';

        if (contentType?.includes('application/json')) {
          const json = await response.json();
          errorDetail = json?.message || JSON.stringify(json);
        } else {
          errorDetail = await response.text();
        }

        this.logger.error(
          `Error en respuesta del servidor Evolution: ${errorDetail}`,
        );
        throw new Error(`Error del servidor Evolution: ${errorDetail}`);
      }

      this.logger.log(
        `Webhook ${enable ? 'activado' : 'desactivado'} correctamente para userId=${userId}`,
      );

      return {
        success: true,
        message: `Webhook ${enable ? 'activado' : 'desactivado'} correctamente`,
      };
    } catch (err) {
      this.logger.error(`[TOGGLE_WEBHOOK_ERROR]`, err);
      return {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : 'Error inesperado al actualizar el webhook',
      };
    }
  }
}
