import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PersonalDataService } from './personal-data.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, PersonalDataService],
  exports: [CustomersService, PersonalDataService],
})
export class CustomersModule {}
