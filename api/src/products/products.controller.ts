import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  CreateCategoryDto,
  CreateProductDto,
  ProductQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  createCategory(
    @CurrentStore() store: TenantStore,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.productsService.createCategory(store.id, dto);
  }

  @Get('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  listAdminCategories(@CurrentStore() store: TenantStore) {
    return this.productsService.listCategories(store.id);
  }

  @Patch('admin/categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateCategory(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.productsService.updateCategory(store.id, id, dto);
  }

  @Delete('admin/categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  removeCategory(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.productsService.removeCategory(store.id, id);
  }

  @Post('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  createProduct(
    @CurrentStore() store: TenantStore,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(store.id, dto);
  }

  @Get('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  listAdminProducts(
    @CurrentStore() store: TenantStore,
    @Query() query: ProductQueryDto,
  ) {
    return this.productsService.listProducts(store.id, query, false);
  }

  @Get('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  getAdminProduct(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.productsService.getProduct(store.id, id, false);
  }

  @Patch('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateProduct(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(store.id, id, dto);
  }

  @Post('admin/products/:id/images')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  addImages(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() body: { urls: string[] },
  ) {
    return this.productsService.addImages(store.id, id, body.urls || []);
  }

  @Delete('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  removeProduct(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.productsService.removeProduct(store.id, id);
  }

  @Get('catalog/categories')
  @UseGuards(TenantGuard)
  listPublicCategories(@CurrentStore() store: TenantStore) {
    return this.productsService.listCategories(store.id, true);
  }

  @Get('catalog/products')
  @UseGuards(TenantGuard)
  listPublicProducts(
    @CurrentStore() store: TenantStore,
    @Query() query: ProductQueryDto,
  ) {
    return this.productsService.listProducts(store.id, query, true);
  }

  @Get('catalog/products/:idOrSlug')
  @UseGuards(TenantGuard)
  getPublicProduct(
    @CurrentStore() store: TenantStore,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    return this.productsService.getProduct(store.id, idOrSlug, true);
  }

  @Get('catalog/products/:idOrSlug/reviews')
  @UseGuards(TenantGuard)
  listReviews(
    @CurrentStore() store: TenantStore,
    @Param('idOrSlug') idOrSlug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.listReviews(
      store.id,
      idOrSlug,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );
  }

  @Get('catalog/brands')
  @UseGuards(TenantGuard)
  listBrands(@CurrentStore() store: TenantStore) {
    return this.productsService.listBrands(store.id);
  }

  @Get('admin/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  listReviewsAdmin(
    @CurrentStore() store: TenantStore,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.listReviewsAdmin(
      store.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Patch('admin/reviews/:id/hidden')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  setReviewHidden(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body('hidden') hidden: boolean,
  ) {
    return this.productsService.setReviewHidden(store.id, id, Boolean(hidden));
  }

  @Delete('admin/reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  deleteReview(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.productsService.deleteReview(store.id, id);
  }
}
