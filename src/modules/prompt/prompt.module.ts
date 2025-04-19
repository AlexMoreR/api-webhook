import { Module } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { PromptService } from './prompt.service';

@Module({
  providers: [PromptService, PrismaService],
  exports: [PromptService],
})
export class PromptModule {}