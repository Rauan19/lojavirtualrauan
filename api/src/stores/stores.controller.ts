import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import {
  CreateStoreDto,
  PublicSignupDto,
  UpdateMercadoPagoDto,
  UpdateNfeConfigDto,
  UpdatePrinterConfigDto,
  UpdateShippingConfigDto,
  UpdateStoreBrandingDto,
  UpdateStoreBySuperDto,
  UpdateStorePoliciesDto,
  UpdateStoreProfileDto,
  UpdateStoreStatusDto,
} from './dto/store.dto';
import { StoresService } from './stores.service';
import { AuthService } from '../auth/auth.service';
import { Throttle } from '@nestjs/throttler';

@Controller('stores')
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  /**
   * Signup público: qualquer visitante cria a própria loja, sem passar pelo
   * Super Admin. Sempre nasce em TRIAL (o DTO não aceita status/pagamento).
   *
   * Rate limit agressivo — sem captcha nesta primeira versão, é a única
   * barreira contra alguém gerar lojas em massa.
   */
  @Post('signup')
  @Throttle({
    default: {
      // process.env direto (não ConfigService): decorator roda na carga da
      // classe, antes de qualquer injeção de dependência existir.
      limit: Number(process.env.SIGNUP_RATE_LIMIT_PER_HOUR) || 5,
      ttl: 60 * 60_000,
    },
  })
  async signup(@Body() dto: PublicSignupDto) {
    const { slug } = await this.storesService.signup(dto);
    // Reaproveita o login normal: mesmo formato de token que o painel espera,
    // sem duplicar a lógica de assinatura do JWT.
    const session = await this.authService.login({
      email: dto.adminEmail,
      password: dto.adminPassword,
    });
    return { ...session, slug };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  findAll() {
    return this.storesService.findAll();
  }

  @Get('billing')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  billing() {
    return this.storesService.billingSummary();
  }

  @Get('public/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.storesService.findBySlug(slug);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  me(@CurrentStore() store: TenantStore) {
    return this.storesService.findOne(store.id);
  }

  @Get('me/store-type-config')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  storeTypeConfig(@CurrentStore() store: TenantStore) {
    return this.storesService.getStoreTypeConfig(store.id);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateProfile(
    @CurrentStore() store: TenantStore,
    @Body() dto: UpdateStoreProfileDto,
  ) {
    return this.storesService.updateProfile(store.id, dto);
  }

  @Patch('me/policies')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updatePolicies(
    @CurrentStore() store: TenantStore,
    @Body() dto: UpdateStorePoliciesDto,
  ) {
    return this.storesService.updatePolicies(store.id, dto);
  }

  @Patch('me/nfe')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateNfe(
    @CurrentStore() store: TenantStore,
    @Body() dto: UpdateNfeConfigDto,
  ) {
    return this.storesService.updateNfeConfig(store.id, dto);
  }

  @Patch('me/branding')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateBranding(
    @CurrentStore() store: TenantStore,
    @Body() dto: UpdateStoreBrandingDto,
  ) {
    return this.storesService.updateBranding(store.id, dto);
  }

  @Patch('me/mercadopago')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateMp(
    @CurrentStore() store: TenantStore,
    @Body() dto: UpdateMercadoPagoDto,
  ) {
    return this.storesService.updateMercadoPago(store.id, dto);
  }

  @Post('me/mercadopago/test')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  testMp(@CurrentStore() store: TenantStore) {
    return this.storesService.testMercadoPago(store.id);
  }

  @Patch('me/shipping')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateShipping(
    @CurrentStore() store: TenantStore,
    @Body() dto: UpdateShippingConfigDto,
  ) {
    return this.storesService.updateShipping(store.id, dto);
  }

  @Patch('me/printer')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updatePrinter(
    @CurrentStore() store: TenantStore,
    @Body() dto: UpdatePrinterConfigDto,
  ) {
    return this.storesService.updatePrinter(store.id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStoreStatusDto) {
    return this.storesService.updateStatus(id, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  findOneForSuper(@Param('id') id: string) {
    return this.storesService.findByIdForSuper(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  updateBySuper(@Param('id') id: string, @Body() dto: UpdateStoreBySuperDto) {
    return this.storesService.updateBySuper(id, dto);
  }
}
