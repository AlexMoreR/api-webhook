import { Module } from '@nestjs/common';
import { ExternalClientDataService } from './external-client-data.service';

@Module({
  providers: [ExternalClientDataService],
  exports: [ExternalClientDataService],
})
export class ExternalClientDataModule {}
