import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePlatformMercadoPagoDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  mpAccessToken?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  mpPublicKey?: string;

  /** true = usar sandbox (credenciais de teste). */
  @IsOptional()
  @IsBoolean()
  mpUseSandbox?: boolean;

  /** E-mail do Comprador de teste (@testuser.com). Aceita TESTUSERxxx. */
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @MinLength(5)
  mpTestPayerEmail?: string;
}
