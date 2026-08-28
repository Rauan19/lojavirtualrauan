import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ProductsService } from '../products/products.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { GuestOrderScopeGuard } from './guest-order-scope.guard';
import {
  AddressDto,
  CreateReviewDto,
  CustomerLoginDto,
  CustomerRegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/storefront.dto';
import { StorefrontService } from './storefront.service';

@Controller('storefront')
@UseGuards(TenantGuard)
export class StorefrontController {
  constructor(
    private readonly storefrontService: StorefrontService,
    private readonly productsService: ProductsService,
  ) {}

  @Post('auth/register')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  register(
    @CurrentStore() store: TenantStore,
    @Body() dto: CustomerRegisterDto,
  ) {
    return this.storefrontService.register(store.id, dto);
  }

  @Post('auth/login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  login(@CurrentStore() store: TenantStore, @Body() dto: CustomerLoginDto) {
    return this.storefrontService.login(store.id, dto);
  }

  @Post('auth/forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(
    @CurrentStore() store: TenantStore,
    @Body() dto: ForgotPasswordDto,
  ) {
    return this.storefrontService.forgotPassword(store.id, dto);
  }

  @Post('auth/reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @CurrentStore() store: TenantStore,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.storefrontService.resetPassword(store.id, dto);
  }

  @Get('auth/me')
  @UseGuards(CustomerJwtGuard, GuestOrderScopeGuard)
  me(@CurrentStore() store: TenantStore, @CurrentUser() user: AuthUser) {
    return this.storefrontService.me(store.id, user.id);
  }

  @Get('favorites')
  @UseGuards(CustomerJwtGuard)
  listFavorites(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
  ) {
    return this.storefrontService.listFavorites(store.id, user.id);
  }

  @Post('favorites/:productId')
  @UseGuards(CustomerJwtGuard)
  addFavorite(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    return this.storefrontService.addFavorite(store.id, user.id, productId);
  }

  @Delete('favorites/:productId')
  @UseGuards(CustomerJwtGuard)
  removeFavorite(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    return this.storefrontService.removeFavorite(store.id, user.id, productId);
  }

  @Get('addresses')
  @UseGuards(CustomerJwtGuard, GuestOrderScopeGuard)
  listAddresses(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
  ) {
    return this.storefrontService.listAddresses(store.id, user.id);
  }

  @Post('addresses')
  @UseGuards(CustomerJwtGuard, GuestOrderScopeGuard)
  createAddress(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddressDto,
  ) {
    return this.storefrontService.createAddress(store.id, user.id, dto);
  }

  @Put('addresses/:id')
  @UseGuards(CustomerJwtGuard, GuestOrderScopeGuard)
  updateAddress(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddressDto,
  ) {
    return this.storefrontService.updateAddress(store.id, user.id, id, dto);
  }

  @Patch('addresses/:id/default')
  @UseGuards(CustomerJwtGuard, GuestOrderScopeGuard)
  setDefault(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.storefrontService.setDefaultAddress(store.id, user.id, id);
  }

  @Delete('addresses/:id')
  @UseGuards(CustomerJwtGuard, GuestOrderScopeGuard)
  deleteAddress(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.storefrontService.deleteAddress(store.id, user.id, id);
  }

  @Post('reviews')
  @UseGuards(CustomerJwtGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createReview(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.productsService.createReview(store.id, user.id, dto);
  }
}
