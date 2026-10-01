import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { AviseMeService } from './avise-me.service';

class AviseMeDto {
  @IsString()
  @MaxLength(40)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;
}

@Controller()
export class AviseMeController {
  constructor(private readonly aviseMe: AviseMeService) {}

  /** Vitrine: "Avise-me quando chegar". Limite apertado contra abuso. */
  @Post('storefront/avise-me')
  @UseGuards(TenantGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registrar(@CurrentStore() store: TenantStore, @Body() dto: AviseMeDto) {
    return this.aviseMe.registrar(store.id, dto);
  }

  @Get('admin/avise-me')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  painel(@CurrentStore() store: TenantStore) {
    return this.aviseMe.painel(store.id);
  }
}
