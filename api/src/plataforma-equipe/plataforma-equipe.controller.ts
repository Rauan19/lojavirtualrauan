import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlataformaEquipeService } from './plataforma-equipe.service';

class CriarColaboradorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(10, {
    message: 'A senha provisória precisa ter pelo menos 10 caracteres.',
  })
  @MaxLength(200)
  senhaProvisoria!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  permissoes!: string[];
}

class AtualizarColaboradorDto {
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

  /** Gera uma senha provisória nova (quem esqueceu a senha) */
  @IsOptional()
  @IsString()
  @MinLength(10, {
    message: 'A senha provisória precisa ter pelo menos 10 caracteres.',
  })
  @MaxLength(200)
  senhaProvisoria?: string;
}

/**
 * Só o dono da plataforma chega aqui: /super/equipe não está em nenhuma área
 * de colaborador (ver plataforma-equipe/areas.ts), então o JwtAuthGuard barra.
 */
@Controller('super/equipe')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class PlataformaEquipeController {
  constructor(private readonly equipe: PlataformaEquipeService) {}

  @Get()
  listar() {
    return this.equipe.listar();
  }

  @Get('atividade')
  atividade(@Query('limite') limite?: string) {
    return this.equipe.atividade(Number(limite) || 100);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  criar(@Body() dto: CriarColaboradorDto) {
    return this.equipe.criar(dto);
  }

  @Patch(':id')
  atualizar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AtualizarColaboradorDto,
  ) {
    return this.equipe.atualizar(user.id, id, dto);
  }

  @Delete(':id')
  remover(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.equipe.remover(user.id, id);
  }
}
