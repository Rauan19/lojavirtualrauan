import { Global, Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';

/** Global: produtos, NF-e e painel consultam os limites sem importar Billing. */
@Global()
@Module({
  providers: [PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlanLimitsModule {}
