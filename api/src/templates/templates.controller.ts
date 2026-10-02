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
import { Role } from '@prisma/client';
import {
  CurrentStore,
  type TenantStore,
} from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import {
  CortesiaTemplateDto,
  CriarTemplateDto,
  EditarTemplateDto,
} from './templates.dto';
import { TemplatesService } from './templates.service';

@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** Galeria do painel do lojista: ativos e se a loja pode usar cada um */
  @Get('admin/templates')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  galeria(@CurrentStore() store: TenantStore) {
    return this.templates.galeriaDaLoja(store.id);
  }

  /** Receita de um template, para a prévia da vitrine (?tema=) */
  @Get('templates/:chave')
  um(@Param('chave') chave: string) {
    return this.templates.resolver(chave);
  }

  @Get('super/templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  todos() {
    return this.templates.listarTodos();
  }

  @Post('super/templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  criar(@Body() dto: CriarTemplateDto) {
    return this.templates.criar(dto);
  }

  @Patch('super/templates/:chave')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  editar(@Param('chave') chave: string, @Body() dto: EditarTemplateDto) {
    return this.templates.editar(chave, dto);
  }

  @Delete('super/templates/:chave')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  excluir(@Param('chave') chave: string) {
    return this.templates.excluir(chave);
  }

  @Post('super/templates/:chave/cortesia')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  cortesia(@Param('chave') chave: string, @Body() dto: CortesiaTemplateDto) {
    return this.templates.darCortesia(chave, dto.storeId);
  }
}
