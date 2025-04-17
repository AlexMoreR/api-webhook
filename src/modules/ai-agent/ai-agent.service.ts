import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiAgentService {
  private readonly openAiApiKey: string;
  private readonly openAiUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.openAiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  /**
   * Procesa un input textual enviándolo a OpenAI para obtener una respuesta inteligente.
   * @param {string} content - El texto o mensaje que se quiere procesar.
   * @returns {Promise<string>} - La respuesta generada por OpenAI.
   */
  async processInput(content: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.openAiUrl,
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'Eres un asistente amigable y eficiente.' },
              { role: 'user', content },
            ],
            temperature: 0.7,
          },
          {
            headers: {
              Authorization: `Bearer ${this.openAiApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const aiMessage = response.data.choices?.[0]?.message?.content ?? '';
      return aiMessage.trim();
    } catch (error) {
      console.error('Error procesando input con OpenAI', error.response?.data || error.message);
      return 'Lo siento, hubo un error procesando tu mensaje.';
    }
  }
}
