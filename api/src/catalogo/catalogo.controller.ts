import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CatalogoService } from './catalogo.service';

@Controller()
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  /**
   * Feed público que o Google Merchant Center e o Meta leem sozinhos.
   * Só dados que já estão na vitrine (nome, preço, foto, estoque).
   */
  @Get('public/catalogo/:arquivo')
  async feed(@Param('arquivo') arquivo: string, @Res() res: Response) {
    const m = /^([a-z0-9-]+)\.xml$/.exec(arquivo);
    if (!m) throw new NotFoundException();
    const xml = await this.catalogo.feedXml(m[1]);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  }

  @Get('admin/catalogo')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  resumo(@CurrentStore() store: TenantStore) {
    return this.catalogo.resumo(store.id);
  }
}
