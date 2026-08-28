import {
  Body,
  Controller,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PaymentsService } from '../payments/payments.service';
import { LabelService } from '../shipping/label.service';
import { CustomerJwtGuard } from '../storefront/customer-jwt.guard';
import { GuestOrderScopeGuard } from '../storefront/guest-order-scope.guard';
import {
  BulkUpdateOrderStatusDto,
  CreateOrderDto,
  OrderQueryDto,
  RejectRefundDto,
  RequestRefundDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly labelService: LabelService,
  ) {}

  /** Checkout exige conta — sem login, nem chega aqui (TenantGuard + CustomerJwtGuard). */
  @Post('checkout/orders')
  @UseGuards(TenantGuard, CustomerJwtGuard)
  create(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(store.id, dto, user.id);
  }

  @Get('storefront/orders')
  @UseGuards(TenantGuard, CustomerJwtGuard, GuestOrderScopeGuard)
  myOrders(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Query() query: OrderQueryDto,
  ) {
    return this.ordersService.listForCustomer(store.id, user.id, query);
  }

  @Get('storefront/orders/:id')
  @UseGuards(TenantGuard, CustomerJwtGuard, GuestOrderScopeGuard)
  myOrder(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.getForCustomer(store.id, user.id, id);
  }

  @Post('storefront/orders/:id/confirm-delivery')
  @UseGuards(TenantGuard, CustomerJwtGuard, GuestOrderScopeGuard)
  confirmDelivery(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.confirmDeliveredByCustomer(store.id, user.id, id);
  }

  @Post('storefront/orders/:id/refund-request')
  @UseGuards(TenantGuard, CustomerJwtGuard, GuestOrderScopeGuard)
  requestRefund(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RequestRefundDto,
  ) {
    return this.ordersService.requestRefund(store.id, user.id, id, dto.reason);
  }

  @Get('admin/orders')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  list(@CurrentStore() store: TenantStore, @Query() query: OrderQueryDto) {
    return this.ordersService.list(store.id, query);
  }

  @Get('admin/orders/pending-count')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  pendingOrdersCount(@CurrentStore() store: TenantStore) {
    return this.ordersService.countNewOrders(store.id);
  }

  @Patch('admin/orders/bulk-status')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  bulkStatus(
    @CurrentStore() store: TenantStore,
    @Body() dto: BulkUpdateOrderStatusDto,
  ) {
    return this.ordersService.bulkUpdateStatus(store.id, dto.ids, dto.status);
  }

  @Get('admin/refunds/pending-count')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  pendingRefundsCount(@CurrentStore() store: TenantStore) {
    return this.ordersService.countPendingRefunds(store.id);
  }

  @Get('admin/refunds')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  listRefunds(@CurrentStore() store: TenantStore, @Query('all') all?: string) {
    return this.ordersService.listRefundRequests(store.id, all !== '1');
  }

  @Post('admin/orders/:id/refund/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  approveRefund(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.paymentsService.refundOrder(store.id, id);
  }

  @Post('admin/orders/:id/refund/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  rejectRefund(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: RejectRefundDto,
  ) {
    return this.ordersService.rejectRefund(store.id, id, dto.reason);
  }

  @Get('admin/orders/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  getOne(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.ordersService.getOne(store.id, id);
  }

  @Patch('admin/orders/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  updateStatus(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(store.id, id, dto);
  }

  @Get('admin/orders/:id/receipt')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  receipt(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.ordersService.getReceipt(store.id, id);
  }

  /** Compra e emite a etiqueta na transportadora (Melhor Envio). */
  @Post('admin/orders/:id/label')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  generateLabel(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.labelService.generateForOrder(store.id, id);
  }

  @Post('admin/orders/:id/print')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  print(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.ordersService.printOrder(store.id, id);
  }
}
