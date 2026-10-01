import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ImportacaoController } from './importacao/importacao.controller';
import { ImportacaoService } from './importacao/importacao.service';

@Module({
  controllers: [ProductsController, ImportacaoController],
  providers: [ProductsService, ImportacaoService],
  exports: [ProductsService],
})
export class ProductsModule {}
