import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SellerDocType, StoreStatus, StoreType } from '@prisma/client';

/**
 * Signup público (sem autenticação). Só os campos que um visitante anônimo
 * pode preencher — NUNCA aceitar planDueAt/monthlyFee/status daqui, senão
 * dá pra criar loja já ACTIVE sem pagar.
 */
export class PublicSignupDto {
  @IsString()
  @MinLength(2)
  storeName!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(6)
  adminPassword!: string;

  /** Id de um dos planos públicos (ver GET /public/plans). Só afeta exibição — a cobrança real é configurada depois. */
  @IsOptional()
  @IsString()
  planId?: string;

  // Documento do responsável/empresa — obrigatório: sem isso não dá pra
  // emitir NFC-e nem receber pagamento via Mercado Pago de verdade depois.
  @IsEnum(SellerDocType)
  sellerDocType!: SellerDocType;

  @IsString()
  sellerDocument!: string;

  @IsString()
  phone!: string;

  // Endereço completo — vira tanto o perfil fiscal da loja quanto a origem
  // do frete (Configurações → Frete já pede exatamente isso pra emitir
  // etiqueta; preencher aqui evita pedir de novo).
  @IsString()
  zipCode!: string;

  @IsString()
  @MinLength(3)
  street!: string;

  @IsString()
  number!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  @MinLength(2)
  neighborhood!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsString()
  @Length(2, 2)
  state!: string;
}

export class CreateStoreDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(6)
  adminPassword!: string;

  @IsString()
  adminName!: string;

  @IsOptional()
  @IsEnum(StoreType)
  storeType?: StoreType;

  // Documento, telefone e endereço obrigatórios — mesma regra do signup
  // público. Sem isso a loja não emite nota nem gera etiqueta de frete.
  @IsEnum(SellerDocType)
  sellerDocType!: SellerDocType;

  @IsString()
  sellerDocument!: string;

  @IsOptional()
  @IsString()
  sellerLegalName?: string;

  @IsString()
  sellerPhone!: string;

  @IsString()
  sellerZipCode!: string;

  @IsString()
  @MinLength(3)
  sellerStreet!: string;

  @IsString()
  sellerNumber!: string;

  @IsOptional()
  @IsString()
  sellerComplement?: string;

  @IsString()
  @MinLength(2)
  sellerNeighborhood!: string;

  @IsString()
  @MinLength(2)
  sellerCity!: string;

  @IsString()
  @Length(2, 2)
  sellerState!: string;

  @IsOptional()
  @IsString()
  planName?: string;

  @IsOptional()
  @IsDateString()
  planDueAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyFee?: number;

  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;
}

export class UpdateStoreBrandingDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  customDomain?: string;

  @IsOptional()
  @IsBoolean()
  marqueeEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  marqueeImages?: string[];

  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  tiktokUrl?: string;
}

export class UpdateStoreStatusDto {
  @IsEnum(StoreStatus)
  status!: StoreStatus;

  @IsOptional()
  @IsString()
  planName?: string;

  @IsOptional()
  @IsDateString()
  planDueAt?: string;
}

export class UpdateStoreBySuperDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;

  @IsOptional()
  @IsEnum(StoreType)
  storeType?: StoreType;

  @IsOptional()
  @IsString()
  planName?: string;

  @IsOptional()
  @IsDateString()
  planDueAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyFee?: number | null;

  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  adminPassword?: string;

  @IsOptional()
  @IsString()
  sellerPhone?: string | null;
}

export class UpdateMercadoPagoDto {
  @IsOptional()
  @IsString()
  mpAccessToken?: string;

  @IsOptional()
  @IsString()
  mpPublicKey?: string;

  /** pro | personalized — como o cliente final paga na vitrine */
  @IsOptional()
  @IsString()
  checkoutMode?: string;
}

export class UpdateShippingConfigDto {
  @IsOptional()
  @IsString()
  freteModo?: string;

  @IsOptional()
  freteValorFixo?: number;

  @IsOptional()
  freteGratisAcima?: number | null;

  @IsOptional()
  @IsString()
  freteToken?: string | null;

  /** Gera e paga a etiqueta sozinho quando o pagamento é aprovado. */
  @IsOptional()
  @IsBoolean()
  freteEtiquetaAuto?: boolean;

  @IsOptional()
  @IsString()
  freteCepOrigem?: string | null;

  @IsOptional()
  @IsString()
  freteRuaOrigem?: string | null;

  @IsOptional()
  @IsString()
  freteNumeroOrigem?: string | null;

  @IsOptional()
  @IsString()
  freteComplementoOrigem?: string | null;

  @IsOptional()
  @IsString()
  freteBairroOrigem?: string | null;

  @IsOptional()
  @IsString()
  freteCidadeOrigem?: string | null;

  @IsOptional()
  @IsString()
  freteUfOrigem?: string | null;

  @IsOptional()
  @IsBoolean()
  freteSandbox?: boolean;

  @IsOptional()
  @IsString()
  freteEmailContato?: string | null;

  /** Slugs liberados no checkout (ex.: correios, jadlog). [] ou omitido = todas. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  freteTransportadoras?: string[] | null;
}

export class UpdatePrinterConfigDto {
  @IsOptional()
  @IsString()
  printerType?: 'BROWSER' | 'NETWORK' | 'BLUETOOTH';

  @IsOptional()
  @IsString()
  printerHost?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  printerPort?: number;

  @IsOptional()
  @IsString()
  printerName?: string | null;

  @IsOptional()
  @IsBoolean()
  printerAutoPrint?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  printerPaperWidth?: number;

  /** Dias após envio para marcar Entregue automaticamente (0 = off). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  autoDeliverDays?: number;
}

export class UpdateStoreProfileDto {
  @IsOptional()
  @IsEnum(StoreType)
  storeType?: StoreType;

  @IsOptional()
  @IsEnum(SellerDocType)
  sellerDocType?: SellerDocType | null;

  @IsOptional()
  @IsString()
  sellerDocument?: string | null;

  @IsOptional()
  @IsString()
  sellerLegalName?: string | null;

  @IsOptional()
  @IsString()
  sellerTradeName?: string | null;

  @IsOptional()
  @IsString()
  sellerIe?: string | null;

  @IsOptional()
  @IsString()
  sellerIm?: string | null;

  @IsOptional()
  @IsString()
  sellerPhone?: string | null;

  @ValidateIf((_, o) => o.sellerEmail != null && o.sellerEmail !== '')
  @IsEmail()
  @IsOptional()
  sellerEmail?: string | null;

  @IsOptional()
  @IsString()
  sellerZipCode?: string | null;

  @IsOptional()
  @IsString()
  sellerStreet?: string | null;

  @IsOptional()
  @IsString()
  sellerNumber?: string | null;

  @IsOptional()
  @IsString()
  sellerComplement?: string | null;

  @IsOptional()
  @IsString()
  sellerNeighborhood?: string | null;

  @IsOptional()
  @IsString()
  sellerCity?: string | null;

  @IsOptional()
  @IsString()
  sellerState?: string | null;
}

export class UpdateStorePoliciesDto {
  @IsOptional()
  @IsString()
  termsHtml?: string | null;

  @IsOptional()
  @IsString()
  privacyHtml?: string | null;

  @IsOptional()
  @IsString()
  returnsHtml?: string | null;
}

export class UpdateNfeConfigDto {
  @IsOptional()
  @IsBoolean()
  nfeEnabled?: boolean;

  @IsOptional()
  @IsString()
  nfeProvider?: string | null;

  @IsOptional()
  @IsString()
  nfeApiToken?: string | null;

  @IsOptional()
  @IsString()
  nfeEnvironment?: 'homologacao' | 'producao';

  @IsOptional()
  @IsString()
  nfeSeries?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nfeNextNumber?: number;

  @IsOptional()
  @IsString()
  nfeCscId?: string | null;

  @IsOptional()
  @IsString()
  nfeCscToken?: string | null;
}
