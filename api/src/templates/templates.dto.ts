import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ACESSOS } from './acesso';

class CamposTemplate {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paraQuem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  descricao?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segmentos?: string[];

  @IsOptional()
  @IsObject()
  receita?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsInt()
  ordem?: number;

  @IsOptional()
  @IsIn(ACESSOS)
  acesso?: (typeof ACESSOS)[number];

  /** ids de PlatformPlan que incluem o template */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  planos?: string[];

  /** Venda única; nulo = sem preço */
  @IsOptional()
  @IsInt()
  @Min(0)
  precoCentavos?: number | null;
}

export class CriarTemplateDto extends CamposTemplate {
  // Vai na URL de prévia (?tema=) e no banco da loja: só minúsculas e hífen
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,38}$/, {
    message: 'Chave: só letras minúsculas, números e hífen (2 a 39 caracteres)',
  })
  chave!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  declare nome: string;
}

export class EditarTemplateDto extends CamposTemplate {}

export class CortesiaTemplateDto {
  @IsString()
  storeId!: string;
}
