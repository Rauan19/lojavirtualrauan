import { Module } from '@nestjs/common';
import { AviseMeController } from './avise-me.controller';
import { AviseMeService } from './avise-me.service';

@Module({
  controllers: [AviseMeController],
  providers: [AviseMeService],
})
export class AviseMeModule {}
