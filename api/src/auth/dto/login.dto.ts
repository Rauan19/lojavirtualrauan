import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class AdminForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class SegundaEtapaDto {
  @IsString()
  @MinLength(20)
  desafio!: string;

  /** 6 dígitos do app ou um código de recuperação (XXXXX-XXXXX) */
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  codigo!: string;
}

export class CodigoDoisFatoresDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  codigo!: string;
}

export class DesativarDoisFatoresDto extends CodigoDoisFatoresDto {
  @IsString()
  @MinLength(1)
  senha!: string;
}
