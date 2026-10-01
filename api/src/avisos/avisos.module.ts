import { Global, Module } from '@nestjs/common';
import { AvisosController } from './avisos.controller';
import { AvisosService } from './avisos.service';

/** Global: o fluxo de pagamento avisa a venda sem importar este módulo. */
@Global()
@Module({
  controllers: [AvisosController],
  providers: [AvisosService],
  exports: [AvisosService],
})
export class AvisosModule {}
