import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageTypeHandlerService {
    extractContentByType(messageType: string, data: any): string {
        switch (messageType) {
            case 'conversation':
                return data?.message?.conversation ?? '';
            case 'audioMessage':
                return '[AUDIO_MESSAGE]'; // Aquí podrías procesar el audio luego
            case 'imageMessage':
                return '[IMAGE_MESSAGE]'; // Aquí podrías procesar la imagen
            default:
                return '[UNKNOWN_MESSAGE_TYPE]';
        }
    }
}
