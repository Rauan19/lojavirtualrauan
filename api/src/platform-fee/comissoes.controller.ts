import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import { AllowPastDue } from '../common/decorators/allow-past-due.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ComissoesService } from './comissoes.service';

class LiberacaoDto {
  /** true = ligada, false = desligada, null = segue a chave geral */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsBoolean()
  platformFeeEnabled!: boolean | null;
}

@Controller('platform-fee')
export class ComissoesController {
  constructor(private readonly comissoes: ComissoesService) {}

  /** Lojista: taxa do plano, conexão com o MP e total do mês. */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  @AllowPastDue()
  daLoja(@CurrentStore() store: TenantStore, @Query('mes') mes?: string) {
    return this.comissoes.daLoja(store.id, mes);
  }

  @Get('relatorio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  relatorio(@Query('mes') mes?: string) {
    return this.comissoes.relatorio(mes);
  }

  @Get('relatorio.csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async csv(@Res() res: Response, @Query('mes') mes?: string) {
    const conteudo = await this.comissoes.csv(mes);
    const nome = `comissoes-${/^\d{4}-\d{2}$/.test(mes ?? '') ? mes : 'mes-atual'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(conteudo);
  }

  @Patch('lojas/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  liberar(@Param('storeId') storeId: string, @Body() dto: LiberacaoDto) {
    return this.comissoes.definirLiberacao(
      storeId,
      dto.platformFeeEnabled ?? null,
    );
  }

  @Post('divergencias/:orderId/resolver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  resolver(@Param('orderId') orderId: string) {
    return this.comissoes.resolverDivergencia(orderId);
  }
}
