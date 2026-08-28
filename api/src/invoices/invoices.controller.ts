import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { InvoicesService } from './invoices.service';

class CancelInvoiceDto {
  @IsOptional()
  @IsString()
  justificativa?: string;
}

@Controller()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('admin/orders/:id/invoice')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  issue(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.invoicesService.issueForOrder(store.id, id);
  }

  @Get('admin/orders/:id/invoice')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  get(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.invoicesService.getInvoice(store.id, id);
  }

  @Delete('admin/orders/:id/invoice')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  cancel(
    @CurrentStore() store: TenantStore,
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
  ) {
    return this.invoicesService.cancelInvoice(store.id, id, dto.justificativa);
  }
}
