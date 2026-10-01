import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  AdminForgotPasswordDto,
  AdminResetPasswordDto,
  CodigoDoisFatoresDto,
  DesativarDoisFatoresDto,
  LoginDto,
  SegundaEtapaDto,
} from './dto/login.dto';
import { DoisFatoresService } from './dois-fatores.service';
import {
  JwtAuthGuard,
  PermitirSemSegundoFator,
} from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly doisFatores: DoisFatoresService,
  ) {}

  /** Anti brute-force: 8 tentativas / minuto por IP */
  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: AdminForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: AdminResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @PermitirSemSegundoFator()
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id, Boolean(user.mfaSetupOnly));
  }

  // ---------- Verificação em duas etapas ----------

  /** 2ª etapa do login: passe da senha + código do app. */
  @Post('2fa/login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  segundaEtapa(@Body() dto: SegundaEtapaDto) {
    return this.authService.loginSegundaEtapa(dto.desafio, dto.codigo);
  }

  @Get('2fa')
  @UseGuards(JwtAuthGuard)
  @PermitirSemSegundoFator()
  statusDoisFatores(@CurrentUser() user: AuthUser) {
    this.soPainel(user);
    return this.doisFatores.status(user.id);
  }

  /** Gera o QR code. */
  @Post('2fa/ativar')
  @UseGuards(JwtAuthGuard)
  @PermitirSemSegundoFator()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  iniciarAtivacao(@CurrentUser() user: AuthUser) {
    this.soPainel(user);
    return this.doisFatores.iniciarAtivacao(user.id);
  }

  /** Confirma com o primeiro código; devolve os códigos de recuperação e uma sessão nova. */
  @Post('2fa/confirmar')
  @UseGuards(JwtAuthGuard)
  @PermitirSemSegundoFator()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirmarAtivacao(
    @CurrentUser() user: AuthUser,
    @Body() dto: CodigoDoisFatoresDto,
  ) {
    this.soPainel(user);
    const r = await this.doisFatores.confirmarAtivacao(user.id, dto.codigo);
    // A ativação derruba as sessões antigas (inclusive esta): manda outra
    return { ...r, ...(await this.authService.sessaoDoUsuario(user.id)) };
  }

  @Post('2fa/desativar')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  desativar(
    @CurrentUser() user: AuthUser,
    @Body() dto: DesativarDoisFatoresDto,
  ) {
    this.soPainel(user);
    return this.doisFatores.desativar(user.id, dto.senha, dto.codigo);
  }

  @Post('2fa/recuperacao')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  novosCodigos(
    @CurrentUser() user: AuthUser,
    @Body() dto: CodigoDoisFatoresDto,
  ) {
    this.soPainel(user);
    return this.doisFatores.novosCodigosRecuperacao(user.id, dto.codigo);
  }

  /** 2FA é de quem entra no painel; cliente da loja tem outro login. */
  private soPainel(user: AuthUser) {
    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.STORE_ADMIN) {
      throw new ForbiddenException();
    }
  }
}
