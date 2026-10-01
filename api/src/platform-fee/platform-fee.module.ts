import { Module } from '@nestjs/common';
import { ComissoesController } from './comissoes.controller';
import { ComissoesService } from './comissoes.service';
import { PlatformFeeService } from './platform-fee.service';

@Module({
  controllers: [ComissoesController],
  providers: [PlatformFeeService, ComissoesService],
  exports: [PlatformFeeService],
})
export class PlatformFeeModule {}
