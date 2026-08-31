import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CustomerQueryDto {
  /** Busca por nome, e-mail ou telefone. */
  @IsOptional()
  @IsString()
  q?: string;

  /** `recent` (padrão), `spent`, `orders`, `name`. */
  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
