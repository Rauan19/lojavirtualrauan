import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditoriaPlataformaInterceptor } from './auditoria.interceptor';
import { PlataformaEquipeController } from './plataforma-equipe.controller';
import { PlataformaEquipeService } from './plataforma-equipe.service';

@Module({
  controllers: [PlataformaEquipeController],
  providers: [
    PlataformaEquipeService,
    // Global: toda alteração feita por Super Admin, em qualquer controller
    { provide: APP_INTERCEPTOR, useClass: AuditoriaPlataformaInterceptor },
  ],
})
export class PlataformaEquipeModule {}
