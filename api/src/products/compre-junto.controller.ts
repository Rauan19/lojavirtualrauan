import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
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
    return this.compreJunto.definir(store.id, id, dto.ids);
  }
}
