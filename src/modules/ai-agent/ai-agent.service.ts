import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from 'src/core/logger/logger.service';
import FormData from 'form-data';

@Injectable()
export class AiAgentService {
  private readonly openAiApiKey: string;
  private readonly openAiChatUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly openAiWhisperUrl = 'https://api.openai.com/v1/audio/transcriptions';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.openAiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';

    if (!this.openAiApiKey) {
      this.logger.error('❌ API Key de OpenAI no encontrada. Verifica tu archivo .env', '', 'AiAgentService');
    }
  }

  private getHeaders() {
    if (!this.openAiApiKey) {
      throw new Error('No se puede hacer petición: API Key de OpenAI no configurada.');
    }

    return {
      Authorization: `Bearer ${this.openAiApiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async processInput(content: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.openAiChatUrl,
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'Eres un asistente amigable y eficiente.' },
              { role: 'user', content },
            ],
            temperature: 0.7,
          },
          {
            headers: this.getHeaders(),
          },
        ),
      );

      return response.data.choices?.[0]?.message?.content?.trim() ?? '[ERROR_OPENAI_EMPTY_RESPONSE]';
    } catch (error) {
      this.logger.error('❌ Error procesando input con OpenAI', error?.response?.data || error.message, 'AiAgentService');
      return '[ERROR_PROCESSING_OPENAI_INPUT]';
    }
  }

  async transcribeAudio(audioUrl: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', audioUrl); // Aquí deberías descargar y subir el archivo real
      formData.append('model', 'whisper-1');
      formData.append('language', 'es');

      const response = await firstValueFrom(
        this.httpService.post(
          this.openAiWhisperUrl,
          formData,
          {
            headers: {
              ...this.getHeaders(),
              ...formData.getHeaders(), // Necesario para FormData
            },
          },
        ),
      );

      return response.data.text ?? '[ERROR_TRANSCRIPTION_FAILED]';
    } catch (error) {
      this.logger.error('❌ Error transcribiendo audio con OpenAI', error?.response?.data || error.message, 'AiAgentService');
      return '[ERROR_TRANSCRIBING_AUDIO]';
    }
  }

  async describeImage(imageUrl: string): Promise<string> {
    try {
      const prompt = `Describe esta imagen de forma clara: ${imageUrl}`;

      const response = await firstValueFrom(
        this.httpService.post(
          this.openAiChatUrl,
          {
            model: 'gpt-4-vision-preview',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          },
          {
            headers: this.getHeaders(),
          },
        ),
      );

      return response.data.choices?.[0]?.message?.content?.trim() ?? '[ERROR_DESCRIBING_IMAGE]';
    } catch (error) {
      this.logger.error('❌ Error describiendo imagen con OpenAI', error?.response?.data || error.message, 'AiAgentService');
      return '[ERROR_DESCRIBING_IMAGE]';
    }
  }
}
