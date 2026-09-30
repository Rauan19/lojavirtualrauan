import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Fila, urlParaPg } from './fila';
import { FilaImediata } from './fila-imediata';
import { FilaPgBoss } from './fila-pgboss';
import { TravasService } from './travas.service';

/**
 * FILA_DRIVER: "pgboss" (padrão) ou "imediata" (padrão nos testes — executa
 * na hora, sem repetir).
 */
@Global()
@Module({
  providers: [
    {
      provide: Fila,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Fila => {
        const driver =
          config.get<string>('FILA_DRIVER') ||
          (config.get<string>('NODE_ENV') === 'test' ? 'imediata' : 'pgboss');
        if (driver === 'imediata') return new FilaImediata();
        return new FilaPgBoss(
          urlParaPg(config.get<string>('DATABASE_URL') ?? ''),
        );
      },
    },
    TravasService,
  ],
  exports: [Fila, TravasService],
})
export class FilaModule implements OnModuleDestroy {
  constructor(@Inject(Fila) private readonly fila: Fila) {}

  async onModuleDestroy() {
    if (this.fila instanceof FilaPgBoss) await this.fila.parar();
  }
}
