import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiAgentService {
  private readonly openAiApiKey: string;
  private readonly openAiUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly openAiWhisperUrl = 'https://api.openai.com/v1/audio/transcriptions';
  private readonly openAiVisionUrl = 'https://api.openai.com/v1/chat/completions'; // mismo endpoint, cambiando prompt

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

  
  async transcribeAudio(audioUrl: string): Promise<string> {
    // Aquí deberías descargar el audio y enviarlo como FormData a Whisper
    // Ejemplo pseudo-código:

    const response = await firstValueFrom(
      this.httpService.post(
        this.openAiWhisperUrl,
        {
          file: audioUrl, // <-- Aquí normalmente subirías el audio como buffer
          model: 'whisper-1',
          language: 'es',
        },
        {
          headers: {
            Authorization: `Bearer ${this.openAiApiKey}`,
            'Content-Type': 'multipart/form-data',
          },
        },
      ),
    );

    return response.data.text ?? '[AUDIO_TRANSCRIPTION_FAILED]';
  }

  async describeImage(imageUrl: string): Promise<string> {
    // Aquí describes la imagen usando GPT-4 Vision
    const prompt = `Describe detalladamente esta imagen: ${imageUrl}`;

    const response = await firstValueFrom(
      this.httpService.post(
        this.openAiUrl,
        {
          model: 'gpt-4-vision-preview', // modelo que soporta imágenes
          messages: [
            { role: 'user', content: prompt },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.openAiApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return response.data.choices?.[0]?.message?.content?.trim() ?? '[IMAGE_DESCRIPTION_FAILED]';
  }
}
