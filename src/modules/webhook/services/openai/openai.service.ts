import { Injectable } from '@nestjs/common';

@Injectable()
export class OpenAiService {
  async processInput(input: string): Promise<string> {
    // Aquí envías el input a OpenAI
    return `Respuesta de IA para: ${input}`;
  }
}
