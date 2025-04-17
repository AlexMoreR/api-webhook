import { Test, TestingModule } from '@nestjs/testing';
import { MessageDirectionService } from './message-direction.service';

describe('MessageDirectionService', () => {
  let service: MessageDirectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageDirectionService],
    }).compile();

    service = module.get<MessageDirectionService>(MessageDirectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
