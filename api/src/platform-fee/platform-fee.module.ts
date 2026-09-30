import { Module } from '@nestjs/common';
import { PlatformFeeService } from './platform-fee.service';

@Module({
  providers: [PlatformFeeService],
  exports: [PlatformFeeService],
})
export class PlatformFeeModule {}
