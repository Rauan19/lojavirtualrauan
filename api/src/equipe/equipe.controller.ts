import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EquipeService } from './equipe.service';

class ConvidarDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  permissoes!: string[];
}

class AtualizarDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  permissoes?: string[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Só o dono chega aqui: /admin/equipe é 'dono' em areas.ts. */
@Controller('admin/equipe')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
export class EquipeController {
  constructor(
    private readonly equipe: EquipeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  listar(@CurrentStore() store: TenantStore) {
    return this.equipe.listar(store.id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async convidar(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Body() dto: ConvidarDto,
  ) {
    return this.equipe.convidar(store.id, await this.nome(user), dto);
  }

  @Post(':id/reenviar')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async reenviar(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.equipe.reenviarConvite(store.id, id, await this.nome(user));
  }

  @Patch(':id')
  atualizar(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: AtualizarDto,
  ) {
    return this.equipe.atualizar(store.id, id, dto);
  }

  @Delete(':id')
  remover(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.equipe.remover(store.id, id);
  }

  private async nome(user: AuthUser) {
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });
    return u?.name || 'O dono da loja';
  }
}
