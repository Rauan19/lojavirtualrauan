import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CompreJuntoService } from './compre-junto.service';

class CompreJuntoDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  ids!: string[];

  /** Desconto nos sugeridos levados junto (0 a 30%). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  descontoPct?: number;
}

class ItemPreviaDto {
  @IsString()
  @MaxLength(40)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

class PreviaDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ItemPreviaDto)
  items!: ItemPreviaDto[];
}

@Controller()
export class CompreJuntoController {
  constructor(private readonly compreJunto: CompreJuntoService) {}

  @Get('catalog/products/:idOrSlug/compre-junto')
  @UseGuards(TenantGuard)
  vitrine(
    @CurrentStore() store: TenantStore,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    return this.compreJunto.daVitrine(store.id, idOrSlug);
  }

  /** Checkout: quanto o combo desconta neste carrinho (preços do banco). */
  @Post('storefront/compre-junto/desconto')
  @UseGuards(TenantGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  previa(@CurrentStore() store: TenantStore, @Body() dto: PreviaDto) {
    return this.compreJunto.previa(store.id, dto.items);
  }

  @Get('admin/products/:id/compre-junto')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  painel(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.compreJunto.doPainel(store.id, id);
  }

  @Put('admin/products/:id/compre-junto')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  definir(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: CompreJuntoDto,
  ) {
    return this.compreJunto.definir(store.id, id, dto.ids, dto.descontoPct);
  }
}
