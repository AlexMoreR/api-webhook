import { Test, TestingModule } from '@nestjs/testing';
import { MessageTypeHandlerService } from './message-type-handler.service';

describe('MessageTypeHandlerService', () => {
  let service: MessageTypeHandlerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageTypeHandlerService],
    }).compile();

    service = module.get<MessageTypeHandlerService>(MessageTypeHandlerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
