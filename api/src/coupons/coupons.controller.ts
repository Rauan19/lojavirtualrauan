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
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CouponsService } from './coupons.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto/coupon.dto';

@Controller()
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get('admin/coupons')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  list(@CurrentStore() store: TenantStore) {
    return this.couponsService.list(store.id);
  }

  @Post('admin/coupons')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  create(@CurrentStore() store: TenantStore, @Body() dto: CreateCouponDto) {
    return this.couponsService.create(store.id, dto);
  }

  @Patch('admin/coupons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  update(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.couponsService.update(store.id, id, dto);
  }

  @Delete('admin/coupons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  remove(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.couponsService.remove(store.id, id);
  }

  @Post('checkout/coupons/validate')
  @UseGuards(TenantGuard)
  validate(@CurrentStore() store: TenantStore, @Body() dto: ValidateCouponDto) {
    return this.couponsService.validate(store.id, dto);
  }

  @Get('catalog/coupon-banner')
  @UseGuards(TenantGuard)
  storefrontBanner(@CurrentStore() store: TenantStore) {
    return this.couponsService.findStorefrontBanner(store.id);
  }
}
