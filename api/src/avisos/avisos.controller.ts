import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { AvisosService } from './avisos.service';

class ChavesDto {
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

class InscreverDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;

  @ValidateNested()
  @Type(() => ChavesDto)
  keys!: ChavesDto;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  device?: string;
}

class CancelarDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}

/** Cada pessoa da equipe liga os avisos nos próprios aparelhos. */
@Controller('admin/avisos')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.STORE_ADMIN)
export class AvisosController {
  constructor(private readonly avisos: AvisosService) {}

  @Get()
  painel(@CurrentUser() user: AuthUser) {
    return this.avisos.painel(user.id);
  }

  @Post('inscrever')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  inscrever(
    @CurrentUser() user: AuthUser,
    @CurrentStore() store: TenantStore,
    @Body() dto: InscreverDto,
  ) {
    return this.avisos.inscrever(user.id, store.id, dto);
  }

  @Delete('inscrever')
  cancelar(@CurrentUser() user: AuthUser, @Body() dto: CancelarDto) {
    return this.avisos.cancelar(user.id, dto.endpoint);
  }

  @Post('teste')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  testar(@CurrentUser() user: AuthUser) {
    return this.avisos.testar(user.id);
  }
}
