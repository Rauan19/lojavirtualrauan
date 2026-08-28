import { Global, Module } from '@nestjs/common';
import { SecretsService } from './secrets.service';

/** Global: praticamente todo módulo que fala com gateway precisa decifrar. */
@Global()
@Module({
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
