import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageDirectionService {
  isFromMe(fromMe: boolean): boolean {
    return fromMe;
  }
}
