import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlatformPlanDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @Min(0)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodDays?: number;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsBoolean()
  highlight?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  /** Máximo de produtos. 0 ou null = sem limite. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxProducts?: number | null;

  @IsOptional()
  @IsBoolean()
  nfeIncluded?: boolean;

  /** Comissão por venda em pontos-base: 200 = 2%. Máximo 10%. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  feeBps?: number;

  @IsOptional()
  @IsBoolean()
  customDomainIncluded?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;
}

export class UpdatePlatformPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodDays?: number;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsBoolean()
  highlight?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Máximo de produtos. 0 ou null = sem limite. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxProducts?: number | null;

  @IsOptional()
  @IsBoolean()
  nfeIncluded?: boolean;

  /** Comissão por venda em pontos-base: 200 = 2%. Máximo 10%. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  feeBps?: number;

  @IsOptional()
  @IsBoolean()
  customDomainIncluded?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;
}

export class UpdatePlatformGeneralDto {
  /** Dias de teste grátis no signup público. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trialDays?: number;
}
