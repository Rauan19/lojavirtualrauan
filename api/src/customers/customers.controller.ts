import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CustomersService } from './customers.service';
import { PersonalDataService } from './personal-data.service';
import { CustomerQueryDto } from './dto/customer.dto';

@Controller('admin/customers')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly personalData: PersonalDataService,
  ) {}

  @Get()
  list(@CurrentStore() store: TenantStore, @Query() query: CustomerQueryDto) {
    return this.customersService.list(store.id, query);
  }

  @Get(':id')
  getOne(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.customersService.getOne(store.id, id);
  }

  /** LGPD art. 18, II e V — o lojista atende um pedido de acesso/portabilidade. */
  @Get(':id/dados-pessoais')
  exportData(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.personalData.export(store.id, id);
  }

  /** LGPD art. 18, VI — exclusão, feita por anonimização. Não tem desfazer. */
  @Post(':id/anonimizar')
  anonymize(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.personalData.anonymize(store.id, id);
  }
}
