import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  /** Preço promocional (o que o cliente paga) */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  promoPrice!: number;

  /** Preço “de” (riscado). Se omitido, usa o preço atual do produto */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  compareAt?: number;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  promoPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  compareAt?: number;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
