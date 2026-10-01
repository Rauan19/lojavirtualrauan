import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ImportacaoController } from './importacao/importacao.controller';
import { ImportacaoService } from './importacao/importacao.service';
import { CompreJuntoController } from './compre-junto.controller';
import { CompreJuntoService } from './compre-junto.service';

@Module({
  controllers: [
    ProductsController,
    ImportacaoController,
    CompreJuntoController,
  ],
  providers: [ProductsService, ImportacaoService, CompreJuntoService],
  exports: [ProductsService],
})
export class ProductsModule {}
