import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { REFUND_REASONS } from '../refund-rules';
import { OrderStatus } from '@prisma/client';

export class OrderItemInputDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  /** Atualiza o nome salvo na conta, se vier diferente. */
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerDocument?: string;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  shippingMethod?: string;

  /** Id da opção de entrega escolhida. O preço vem sempre da cotação do servidor. */
  @IsOptional()
  @IsString()
  shippingOptionId?: string;

  /**
   * Só para conferência/telemetria — o servidor recota e ignora este valor.
   * Mantido no DTO para não quebrar clientes antigos com forbidNonWhitelisted.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  saveAddress?: boolean;

  /**
   * Aceite das condições de venda. Decreto 7.962/2013 art. 4º, I manda
   * apresentar o sumário do contrato antes da contratação — o pedido só é
   * aceito com essa confirmação, e o momento fica gravado como prova.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  acceptTerms?: boolean;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  trackingCode?: string | null;

  @IsOptional()
  @IsString()
  trackingUrl?: string | null;

  @IsOptional()
  @IsString()
  carrierShipmentId?: string | null;
}

export class BulkUpdateOrderStatusDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

export class RequestRefundDto {
  /**
   * Motivo estruturado. Define se o produto precisa voltar e se o lojista
   * pode recusar — ver refund-rules.ts.
   */
  @IsIn(REFUND_REASONS as unknown as string[])
  reasonType!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectRefundDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class OrderQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
