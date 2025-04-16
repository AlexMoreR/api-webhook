import { Injectable } from '@nestjs/common';
// import { HistorialService } from './funciones/historial.service';
// import { GptService } from './funciones/gpt.service';
// import { ClienteService } from './funciones/cliente.service';
import { SessionService } from '../session/session.service';

@Injectable()
export class WebhookService {
  constructor(
    // private readonly historialService: HistorialService,
    // private readonly gptService: GptService,
    // private readonly clienteService: ClienteService,
    private sessionService: SessionService
  ) { }

  async procesarWebhook(body: any) {
    const {
      instance = 'Desconocido',
      apikey,
      server_url,
      data = {},
    } = body;

    const remoteJid = (data?.key?.remoteJid || '').replace('@s.whatsapp.net', '');
    const pushName = data?.pushName || 'Desconocido';
    const message = data?.message?.conversation || 'Sin mensaje';
    const clientePath = `${instance}/clientes/${remoteJid}`;

    const isNew = await this.sessionService.getSession(remoteJid, instance);

    console.log(`NEWWWWWWWWWW: ${isNew}`);


    // Guardar historial
    // await this.historialService.guardarMensaje(remoteJid, message, pushName);

    // Obtener historial para GPT
    // // let historial = this.historialService.obtenerHistorial(remoteJid);
    // if (historial.length > 30) historial = historial.slice(-10);

    // // Generar respuesta GPT
    // const respuesta = await this.gptService.generarRespuesta(instance, remoteJid, historial, message);

    console.log(`IA: ${JSON.stringify(body)}`);
    console.log(`****pushname: ${JSON.stringify(pushName)}`);
    console.log(`****message: ${JSON.stringify(message)}`);
    console.log(`****clientePath: ${JSON.stringify(clientePath)}`);

    // Enviar respuesta por Evolution (puedes extraer esto a un servicio también)
    // await sendMessage(server_url, apikey, instance, remoteJid, 'text', respuesta);
  }
}
