import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class InstallmentsBatchItemDto {
  @IsString()
  id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  freeUntil?: number;
}

export class InstallmentsBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => InstallmentsBatchItemDto)
  items!: InstallmentsBatchItemDto[];

  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}
