import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  Prisma,
  Role,
  SellerDocType,
  StoreStatus,
  StoreType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { PlatformPlansService } from '../billing/platform-plans.service';
import { type PlatformPlan } from '../billing/platform-plans';
import { SecretsService } from '../common/secrets/secrets.service';
import { slugify } from '../common/utils/slugify';
import { buildMercadoPagoWebhookUrl } from '../common/utils/mercadopago-webhook-url';
import { assertMercadoPagoKeyPair } from '../common/utils/mercadopago-keys';
import { normalizeCustomDomain } from '../common/utils/normalize-domain';
import { sanitizeStoreHtml } from '../common/utils/sanitize-store-html';
import { resolvePublicAddress } from '../common/utils/network-target';
import { isValidBrazilianPhone } from '../common/utils/phone-br';
import {
  CreateStoreDto,
  PublicSignupDto,
  UpdateMercadoPagoDto,
  UpdateNfeConfigDto,
  UpdatePrinterConfigDto,
  UpdateShippingConfigDto,
  UpdateStoreBrandingDto,
  UpdateStoreBySuperDto,
  UpdateStorePoliciesDto,
  UpdateStoreProfileDto,
  UpdateStoreStatusDto,
} from './dto/store.dto';
import { comPadrao, defaultPolicies } from './default-policies';
import {
  STORE_TYPE_CONFIGS,
  categoriesForStoreType,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
  resolveStoreLayout,
} from './store-type';

const BRAZILIAN_STATES = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]);

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
    private readonly billingService: BillingService,
    private readonly platformPlansService: PlatformPlansService,
  ) {}

  /**
   * Signup público (sem autenticação). Sempre TRIAL — dto não tem como
   * pedir status/planDueAt/monthlyFee, então não existe caminho pra criar
   * loja já ACTIVE sem pagar.
   */
  async signup(dto: PublicSignupDto) {
    const slug = await this.resolveAvailableSlug(dto.slug || dto.storeName);
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const trialDays = await this.billingService.getTrialDays();
    const planDueAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    const plan = await this.resolvePlan(dto.planId);

    const sellerProfile = this.buildFullSellerProfile({
      sellerDocType: dto.sellerDocType,
      sellerDocument: dto.sellerDocument,
      phone: dto.phone,
      // CNPJ tende a ser a razão social da empresa; CPF costuma ser o
      // próprio nome de quem está se cadastrando. Editável depois em Perfil.
      legalName:
        dto.sellerDocType === SellerDocType.CNPJ
          ? dto.storeName.trim()
          : dto.adminName.trim(),
      contactEmail: dto.adminEmail,
      zipCode: dto.zipCode,
      street: dto.street,
      number: dto.number,
      complement: dto.complement,
      neighborhood: dto.neighborhood,
      city: dto.city,
      state: dto.state,
    });

    const store = await this.prisma.$transaction(async (tx) => {
      const created = await tx.store.create({
        data: {
          name: dto.storeName.trim(),
          slug,
          storeType: StoreType.GENERAL,
          planName: plan.name,
          status: StoreStatus.TRIAL,
          planDueAt,
          monthlyFee: new Prisma.Decimal(plan.amount),
          ...sellerProfile,
        },
      });

      await tx.user.create({
        data: {
          email: dto.adminEmail.toLowerCase().trim(),
          passwordHash,
          name: dto.adminName.trim(),
          role: Role.STORE_ADMIN,
          storeId: created.id,
        },
      });

      const categories = categoriesForStoreType(StoreType.GENERAL);
      await tx.category.createMany({
        data: categories.map((c) => ({
          storeId: created.id,
          name: c.name,
          slug: c.slug,
          active: true,
        })),
      });

      return created;
    });

    return { storeId: store.id, slug: store.slug };
  }

  /** Adiciona sufixo numérico até achar um slug livre. Self-serve não pode travar em "slug já em uso". */
  private async resolveAvailableSlug(seed: string): Promise<string> {
    const base = slugify(seed) || 'loja';
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const exists = await this.prisma.store.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new ConflictException(
      'Não foi possível gerar um link único para a loja',
    );
  }

  /**
   * Plano escolhido no signup — só define o valor exibido, a cobrança real
   * acontece depois em Configurações → Planos. Sem planId (fluxo atual do
   * signup público, que não pergunta plano), cai no primeiro plano ativo.
   */
  private async resolvePlan(planId?: string): Promise<PlatformPlan> {
    const plans = await this.platformPlansService.listActive();
    return plans.find((p) => p.id === planId) || plans[0];
  }

  async create(dto: CreateStoreDto) {
    const slug = slugify(dto.slug || dto.name);
    const exists = await this.prisma.store.findUnique({ where: { slug } });
    if (exists) {
      throw new ConflictException('Slug já em uso');
    }

    const storeType = StoreType.GENERAL;
    const sellerProfile = this.buildFullSellerProfile({
      sellerDocType: dto.sellerDocType,
      sellerDocument: dto.sellerDocument,
      phone: dto.sellerPhone,
      legalName:
        dto.sellerLegalName?.trim() ||
        (dto.sellerDocType === SellerDocType.CNPJ
          ? dto.name.trim()
          : dto.adminName.trim()),
      contactEmail: dto.adminEmail,
      zipCode: dto.sellerZipCode,
      street: dto.sellerStreet,
      number: dto.sellerNumber,
      complement: dto.sellerComplement,
      neighborhood: dto.sellerNeighborhood,
      city: dto.sellerCity,
      state: dto.sellerState,
    });

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const planDueAt = dto.planDueAt
      ? new Date(dto.planDueAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: dto.name,
          slug,
          storeType,
          planName: dto.planName || 'mensal',
          status: dto.status || StoreStatus.TRIAL,
          planDueAt,
          monthlyFee:
            dto.monthlyFee !== undefined
              ? new Prisma.Decimal(dto.monthlyFee)
              : new Prisma.Decimal(199.9),
          ...sellerProfile,
        },
      });

      await tx.user.create({
        data: {
          email: dto.adminEmail.toLowerCase(),
          passwordHash,
          name: dto.adminName,
          role: Role.STORE_ADMIN,
          storeId: store.id,
        },
      });

      const categories = categoriesForStoreType(storeType);
      await tx.category.createMany({
        data: categories.map((c) => ({
          storeId: store.id,
          name: c.name,
          slug: c.slug,
          active: true,
        })),
      });

      return this.decorateStore(store, {
        products: 0,
        orders: 0,
        customers: 0,
      });
    });
  }

  async findAll() {
    const stores = await this.prisma.store.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true, orders: true, customers: true } },
        users: {
          where: { role: Role.STORE_ADMIN },
          select: { id: true, name: true, email: true, active: true },
          take: 1,
        },
      },
    });

    return stores.map((s) =>
      this.decorateStore(s, s._count, s.users[0] ?? null),
    );
  }

  async findByIdForSuper(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, orders: true, customers: true } },
        users: {
          where: { role: Role.STORE_ADMIN },
          select: { id: true, name: true, email: true, active: true },
          take: 1,
        },
      },
    });
    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }
    return this.decorateStore(store, store._count, store.users[0] ?? null);
  }

  async updateBySuper(storeId: string, dto: UpdateStoreBySuperDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        users: {
          where: { role: Role.STORE_ADMIN },
          take: 1,
        },
      },
    });
    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    if (dto.slug) {
      const slug = slugify(dto.slug);
      const exists = await this.prisma.store.findFirst({
        where: { slug, NOT: { id: storeId } },
      });
      if (exists) {
        throw new ConflictException('Slug já em uso');
      }
    }

    if (dto.adminEmail) {
      const email = dto.adminEmail.toLowerCase();
      const exists = await this.prisma.user.findFirst({
        where: {
          email,
          storeId,
          role: Role.STORE_ADMIN,
          NOT: { id: store.users[0]?.id },
        },
      });
      if (exists) {
        throw new ConflictException('E-mail já em uso nesta loja');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.StoreUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.slug !== undefined) data.slug = slugify(dto.slug);
      if (dto.status !== undefined) data.status = dto.status;
      // Ramo da loja escolhe as sugestões de categoria e o estilo padrão da
      // vitrine. Variações/atributos continuam por produto.
      if (dto.storeType !== undefined) data.storeType = dto.storeType;
      if (dto.planName !== undefined) data.planName = dto.planName;
      if (dto.planDueAt !== undefined) {
        data.planDueAt = dto.planDueAt ? new Date(dto.planDueAt) : null;
      }
      if (dto.monthlyFee !== undefined) {
        data.monthlyFee =
          dto.monthlyFee === null ? null : new Prisma.Decimal(dto.monthlyFee);
      }
      if (dto.sellerPhone !== undefined) {
        data.sellerPhone = dto.sellerPhone?.trim() || null;
      }

      const updated = await tx.store.update({
        where: { id: storeId },
        data,
        include: {
          _count: {
            select: { products: true, orders: true, customers: true },
          },
        },
      });

      const admin = store.users[0];
      let adminRow = admin
        ? {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            active: admin.active,
          }
        : null;

      if (admin && (dto.adminName || dto.adminEmail || dto.adminPassword)) {
        const userData: Prisma.UserUpdateInput = {};
        if (dto.adminName) userData.name = dto.adminName;
        if (dto.adminEmail) userData.email = dto.adminEmail.toLowerCase();
        if (dto.adminPassword) {
          userData.passwordHash = await bcrypt.hash(dto.adminPassword, 10);
          // Senha trocada pelo Super Admin derruba as sessões do lojista
          userData.tokenVersion = { increment: 1 };
        }
        const saved = await tx.user.update({
          where: { id: admin.id },
          data: userData,
          select: { id: true, name: true, email: true, active: true },
        });
        adminRow = saved;
      }

      return this.decorateStore(updated, updated._count, adminRow);
    });
  }

  async findBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        customDomain: true,
        status: true,
        storeType: true,
        storeFont: true,
        storeCardRatio: true,
        analyticsGaId: true,
        analyticsPixelId: true,
        sellerTradeName: true,
        sellerLegalName: true,
        sellerDocType: true,
        sellerDocument: true,
        sellerCity: true,
        sellerState: true,
        sellerPhone: true,
        /*
         * Endereço e e-mail do lojista alimentam o texto padrão das
         * políticas. O Decreto 7.962/2013 art. 2º, II exige endereço físico e
         * eletrônico do fornecedor no site — diferente do CPF, que continua
         * fora da vitrine por ser dado pessoal sem exigência de publicação.
         */
        sellerStreet: true,
        sellerNumber: true,
        sellerNeighborhood: true,
        sellerZipCode: true,
        sellerEmail: true,
        termsHtml: true,
        privacyHtml: true,
        returnsHtml: true,
        nfeEnabled: true,
        nfeEnvironment: true,
        mpPublicKey: true,
        mpAccessToken: true,
        checkoutMode: true,
        marqueeEnabled: true,
        marqueeImages: true,
        freteModo: true,
        freteValorFixo: true,
        freteGratisAcima: true,
        instagramUrl: true,
        facebookUrl: true,
        tiktokUrl: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    const mode = store.checkoutMode === 'pro' ? 'pro' : 'personalized';
    const hasToken = Boolean(store.mpAccessToken?.trim());
    const hasPk = Boolean(store.mpPublicKey?.trim());
    const paymentsEnabled = mode === 'pro' ? hasToken : hasToken && hasPk;

    const layout = resolveStoreLayout(
      store.storeType,
      store.storeFont,
      store.storeCardRatio,
    );
    const padrao = defaultPolicies(store);

    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logoUrl: store.logoUrl,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
      accentColor: store.accentColor,
      customDomain: store.customDomain,
      status: store.status,
      storeType: store.storeType,
      // Vitrine recebe a aparência já resolvida: nunca precisa saber que
      // existe preset por trás. Mesmos nomes do admin, para os dois lados
      // falarem a mesma língua.
      storeFont: layout.font,
      storeCardRatio: layout.cardRatio,
      /*
       * A vitrine precisa saber se há medição configurada para decidir se
       * pede consentimento. Sem nenhum id, só roda cookie essencial e o
       * aviso não aparece.
       */
      analyticsGaId: store.analyticsGaId,
      analyticsPixelId: store.analyticsPixelId,
      sellerTradeName: store.sellerTradeName,
      sellerLegalName: store.sellerLegalName,
      sellerDocType: store.sellerDocType,
      /*
       * CNPJ é informação obrigatória na vitrine (Decreto 7.962/2013), mas
       * CPF é dado pessoal do lojista: só o documento de empresa sai daqui.
       */
      sellerDocument:
        store.sellerDocType === SellerDocType.CNPJ ? store.sellerDocument : null,
      sellerCity: store.sellerCity,
      sellerState: store.sellerState,
      sellerPhone: store.sellerPhone,
      /*
       * Sanitiza também na saída: linhas gravadas antes da sanitização na
       * entrada continuam cruas no banco.
       *
       * Política em branco cai no texto padrão. Loja não pode ir ao ar sem
       * essas informações — Decreto 7.962/2013 para as condições de venda e
       * trocas, LGPD para a privacidade —, e o lojista não deveria precisar
       * escrever as três antes da primeira venda.
       */
      termsHtml: comPadrao(sanitizeStoreHtml(store.termsHtml), padrao.terms),
      privacyHtml: comPadrao(
        sanitizeStoreHtml(store.privacyHtml),
        padrao.privacy,
      ),
      returnsHtml: comPadrao(
        sanitizeStoreHtml(store.returnsHtml),
        padrao.returns,
      ),
      nfeEnabled: store.nfeEnabled,
      nfeEnvironment: store.nfeEnvironment,
      mpPublicKey: store.mpPublicKey,
      checkoutMode: mode,
      marqueeEnabled: store.marqueeEnabled,
      marqueeImages: store.marqueeImages,
      freteModo: store.freteModo,
      freteValorFixo: store.freteValorFixo,
      freteGratisAcima: store.freteGratisAcima,
      instagramUrl: store.instagramUrl,
      facebookUrl: store.facebookUrl,
      tiktokUrl: store.tiktokUrl,
      paymentsEnabled,
    };
  }

  async updateBranding(storeId: string, dto: UpdateStoreBrandingDto) {
    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.primaryColor !== undefined
          ? { primaryColor: dto.primaryColor }
          : {}),
        ...(dto.secondaryColor !== undefined
          ? { secondaryColor: dto.secondaryColor }
          : {}),
        ...(dto.accentColor !== undefined
          ? { accentColor: dto.accentColor }
          : {}),
        ...(dto.customDomain !== undefined
          ? { customDomain: normalizeCustomDomain(dto.customDomain) }
          : {}),
        ...(dto.storeType !== undefined ? { storeType: dto.storeType } : {}),
        // Vazio limpa a escolha manual e volta a herdar do ramo da loja.
        ...(dto.storeFont !== undefined
          ? { storeFont: dto.storeFont.trim() || null }
          : {}),
        ...(dto.storeCardRatio !== undefined
          ? { storeCardRatio: dto.storeCardRatio.trim() || null }
          : {}),
        ...(dto.analyticsGaId !== undefined
          ? { analyticsGaId: dto.analyticsGaId.trim() || null }
          : {}),
        ...(dto.analyticsPixelId !== undefined
          ? { analyticsPixelId: dto.analyticsPixelId.trim() || null }
          : {}),
        ...(dto.marqueeEnabled !== undefined
          ? { marqueeEnabled: dto.marqueeEnabled }
          : {}),
        ...(dto.marqueeImages !== undefined
          ? { marqueeImages: dto.marqueeImages }
          : {}),
        ...(dto.instagramUrl !== undefined
          ? { instagramUrl: dto.instagramUrl || null }
          : {}),
        ...(dto.facebookUrl !== undefined
          ? { facebookUrl: dto.facebookUrl || null }
          : {}),
        ...(dto.tiktokUrl !== undefined
          ? { tiktokUrl: dto.tiktokUrl || null }
          : {}),
      },
    });
  }

  async updateProfile(storeId: string, dto: UpdateStoreProfileDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const data: Prisma.StoreUpdateInput = {};

    // Ramo da loja é editado em Identidade visual — o formulário de perfil
    // não mexe nele, senão salvar o endereço desfazia a escolha de estilo.

    const seller = this.normalizeSellerFields(
      {
        sellerDocType:
          dto.sellerDocType !== undefined
            ? dto.sellerDocType
            : store.sellerDocType,
        sellerDocument:
          dto.sellerDocument !== undefined
            ? dto.sellerDocument
            : store.sellerDocument,
        sellerLegalName:
          dto.sellerLegalName !== undefined ? dto.sellerLegalName : undefined,
        sellerPhone:
          dto.sellerPhone !== undefined ? dto.sellerPhone : undefined,
      },
      {
        requireDocument:
          dto.sellerDocument !== undefined || dto.sellerDocType !== undefined,
      },
    );

    if (dto.sellerDocType !== undefined) {
      data.sellerDocType = seller.sellerDocType ?? null;
    }
    if (dto.sellerDocument !== undefined) {
      data.sellerDocument = seller.sellerDocument ?? null;
    }
    if (dto.sellerLegalName !== undefined) {
      data.sellerLegalName = dto.sellerLegalName?.trim() || null;
    }
    if (dto.sellerTradeName !== undefined) {
      data.sellerTradeName = dto.sellerTradeName?.trim() || null;
    }
    if (dto.sellerIe !== undefined) {
      data.sellerIe = dto.sellerIe?.trim() || null;
    }
    if (dto.sellerIm !== undefined) {
      data.sellerIm = dto.sellerIm?.trim() || null;
    }
    if (dto.sellerPhone !== undefined) {
      data.sellerPhone = dto.sellerPhone?.trim() || null;
    }
    if (dto.sellerEmail !== undefined) {
      data.sellerEmail = dto.sellerEmail?.trim() || null;
    }
    if (dto.sellerZipCode !== undefined) {
      data.sellerZipCode = dto.sellerZipCode
        ? onlyDigits(dto.sellerZipCode).slice(0, 8)
        : null;
    }
    if (dto.sellerStreet !== undefined) {
      data.sellerStreet = dto.sellerStreet?.trim() || null;
    }
    if (dto.sellerNumber !== undefined) {
      data.sellerNumber = dto.sellerNumber?.trim() || null;
    }
    if (dto.sellerComplement !== undefined) {
      data.sellerComplement = dto.sellerComplement?.trim() || null;
    }
    if (dto.sellerNeighborhood !== undefined) {
      data.sellerNeighborhood = dto.sellerNeighborhood?.trim() || null;
    }
    if (dto.sellerCity !== undefined) {
      data.sellerCity = dto.sellerCity?.trim() || null;
    }
    if (dto.sellerState !== undefined) {
      data.sellerState = dto.sellerState
        ? dto.sellerState.trim().toUpperCase().slice(0, 2)
        : null;
    }

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data,
    });
    return this.toAdminStore(updated);
  }

  async updatePolicies(storeId: string, dto: UpdateStorePoliciesDto) {
    // Vai para a vitrine via dangerouslySetInnerHTML — sanitiza na entrada.
    // Sem isso um lojista injeta script e rouba sessão de cliente das
    // outras lojas (todas dividem a origem app.com/loja/{slug}).
    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...(dto.termsHtml !== undefined
          ? { termsHtml: sanitizeStoreHtml(dto.termsHtml) }
          : {}),
        ...(dto.privacyHtml !== undefined
          ? { privacyHtml: sanitizeStoreHtml(dto.privacyHtml) }
          : {}),
        ...(dto.returnsHtml !== undefined
          ? { returnsHtml: sanitizeStoreHtml(dto.returnsHtml) }
          : {}),
      },
    });
    return this.toAdminStore(updated);
  }

  async updateNfeConfig(storeId: string, dto: UpdateNfeConfigDto) {
    const data: Prisma.StoreUpdateInput = {};
    if (dto.nfeEnabled !== undefined) data.nfeEnabled = dto.nfeEnabled;
    if (dto.nfeProvider !== undefined) {
      data.nfeProvider = dto.nfeProvider?.trim() || null;
    }
    if (dto.nfeApiToken !== undefined) {
      // string vazia = não altera (evita apagar ao salvar sem digitar de novo)
      if (dto.nfeApiToken && dto.nfeApiToken.trim()) {
        data.nfeApiToken = this.secrets.encrypt(dto.nfeApiToken.trim());
      }
    }
    if (dto.nfeEnvironment !== undefined) {
      if (!['homologacao', 'producao'].includes(dto.nfeEnvironment)) {
        throw new BadRequestException(
          'nfeEnvironment inválido (use homologacao ou producao)',
        );
      }
      data.nfeEnvironment = dto.nfeEnvironment;
    }
    if (dto.nfeSeries !== undefined) {
      data.nfeSeries = dto.nfeSeries?.trim() || '1';
    }
    if (dto.nfeNextNumber !== undefined) {
      data.nfeNextNumber = Math.max(1, Math.floor(dto.nfeNextNumber));
    }
    if (dto.nfeCscId !== undefined) {
      data.nfeCscId = dto.nfeCscId?.trim() || null;
    }
    if (dto.nfeCscToken !== undefined) {
      if (dto.nfeCscToken && dto.nfeCscToken.trim()) {
        data.nfeCscToken = this.secrets.encrypt(dto.nfeCscToken.trim());
      }
    }

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data,
    });
    return this.toAdminStore(updated);
  }

  async getStoreTypeConfig(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { storeType: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    return STORE_TYPE_CONFIGS[store.storeType] ?? STORE_TYPE_CONFIGS.GENERAL;
  }

  async updateStatus(storeId: string, dto: UpdateStoreStatusDto) {
    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        status: dto.status,
        planName: dto.planName,
        ...(dto.planDueAt ? { planDueAt: new Date(dto.planDueAt) } : {}),
      },
    });
  }

  async updateMercadoPago(storeId: string, dto: UpdateMercadoPagoDto) {
    const data: Prisma.StoreUpdateInput = {};
    // Guarda cifrado, mas valida o par com o valor em claro
    const nextAccessToken = dto.mpAccessToken?.trim() || null;
    if (nextAccessToken) {
      data.mpAccessToken = this.secrets.encrypt(nextAccessToken);
    }
    if (dto.mpPublicKey?.trim()) {
      data.mpPublicKey = dto.mpPublicKey.trim();
    }
    if (dto.checkoutMode !== undefined) {
      const mode = dto.checkoutMode.trim();
      if (!['pro', 'personalized'].includes(mode)) {
        throw new BadRequestException(
          'checkoutMode inválido (use pro ou personalized)',
        );
      }
      data.checkoutMode = mode;
    }

    const current = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { mpPublicKey: true, mpAccessToken: true },
    });
    if (!current) throw new NotFoundException('Loja não encontrada');

    try {
      assertMercadoPagoKeyPair({
        publicKey:
          typeof data.mpPublicKey === 'string'
            ? data.mpPublicKey
            : current.mpPublicKey,
        accessToken:
          nextAccessToken ?? this.secrets.decryptSafe(current.mpAccessToken),
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error
          ? err.message
          : 'Credenciais Mercado Pago inválidas',
      );
    }

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data,
    });
    return this.toAdminStore(updated);
  }

  /** Valida o Access Token salvo chamando a API do Mercado Pago. */
  async testMercadoPago(storeId: string) {
    const storeRow = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!storeRow) throw new NotFoundException('Loja não encontrada');
    const store = this.secrets.decryptStore(storeRow);
    if (!store.mpAccessToken?.trim()) {
      throw new BadRequestException('Salve o Access Token antes de testar');
    }
    if (!store.mpPublicKey?.trim()) {
      throw new BadRequestException('Salve a Public Key antes de testar');
    }

    try {
      assertMercadoPagoKeyPair({
        publicKey: store.mpPublicKey,
        accessToken: store.mpAccessToken,
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error
          ? err.message
          : 'Credenciais Mercado Pago inválidas',
      );
    }

    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${store.mpAccessToken.trim()}` },
    });
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      body = { raw: raw.slice(0, 200) };
    }

    if (!res.ok) {
      const msg =
        typeof body.message === 'string'
          ? body.message
          : `Mercado Pago respondeu ${res.status}`;
      throw new BadRequestException(
        `Token inválido ou sem permissão: ${msg}. Confira se Access Token e Public Key são do mesmo bloco (teste ou produção) no painel MP.`,
      );
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t))
      : [];
    const isTestUserAccount = tags.includes('test_user');
    const nickname = typeof body.nickname === 'string' ? body.nickname : null;

    // Token de TESTUSER passa em /users/me, mas Brick/Checkout API recusa em /v1/payments.
    if (isTestUserAccount) {
      throw new BadRequestException(
        `Esse Access Token é da conta ${nickname || 'TESTUSER'} (usuário de teste). ` +
          'O Brick/Checkout NÃO aceita chave gerada logando como TESTUSER. ' +
          'Faça login na conta REAL do vendedor → Developers → Suas integrações → seu app → ' +
          '"Credenciais de teste" → copie Public Key + Access Token desse bloco, salve no admin e teste de novo.',
      );
    }

    return {
      ok: true,
      message: 'Credenciais aceitas pelo Mercado Pago',
      mpUserId: body.id ?? null,
      nickname,
      email: body.email ?? null,
      siteId: body.site_id ?? null,
      isTestUserAccount: false,
      mpAccessTokenHint: `${store.mpAccessToken.slice(0, 14)}…${store.mpAccessToken.slice(-4)}`,
      mpPublicKeyHint: `${store.mpPublicKey.slice(0, 18)}…`,
      tip: 'Use sempre o par Public Key + Access Token do mesmo bloco. Para testar Pix/cartão: Credenciais de teste da aplicação do vendedor (conta real, não TESTUSER).',
    };
  }

  /** Faturamento SaaS: MRR teórico com base na mensalidade das lojas. */
  async billingSummary() {
    const stores = await this.prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        planName: true,
        planDueAt: true,
        monthlyFee: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const payingStatuses: StoreStatus[] = [
      StoreStatus.ACTIVE,
      StoreStatus.TRIAL,
      StoreStatus.PAST_DUE,
    ];

    let mrr = 0;
    let overdueAmount = 0;
    let trialAmount = 0;
    const byStatus: Record<string, { count: number; revenue: number }> = {};
    const byPlan: Record<string, { count: number; revenue: number }> = {};

    for (const s of stores) {
      const fee = Number(s.monthlyFee ?? 0);
      const status = s.status;
      if (!byStatus[status]) byStatus[status] = { count: 0, revenue: 0 };
      byStatus[status].count += 1;
      byStatus[status].revenue += fee;

      const plan = s.planName || 'sem-plano';
      if (!byPlan[plan]) byPlan[plan] = { count: 0, revenue: 0 };
      byPlan[plan].count += 1;
      byPlan[plan].revenue += fee;

      if (payingStatuses.includes(status) && status !== StoreStatus.PAST_DUE) {
        mrr += fee;
      }
      if (status === StoreStatus.PAST_DUE) overdueAmount += fee;
      if (status === StoreStatus.TRIAL) trialAmount += fee;
    }

    // série dos últimos 6 meses: lojas criadas acumuladas × fee médio (estimativa)
    const now = new Date();
    const monthlySeries: {
      month: string;
      label: string;
      mrr: number;
      stores: number;
    }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString('pt-BR', {
        month: 'short',
        year: '2-digit',
      });
      const alive = stores.filter(
        (s) =>
          s.createdAt <= end &&
          s.status !== StoreStatus.SUSPENDED &&
          Number(s.monthlyFee ?? 0) > 0,
      );
      monthlySeries.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label,
        stores: alive.length,
        mrr: alive.reduce((sum, s) => sum + Number(s.monthlyFee ?? 0), 0),
      });
    }

    return {
      mrr,
      potentialMrr: stores
        .filter((s) => s.status !== StoreStatus.SUSPENDED)
        .reduce((sum, s) => sum + Number(s.monthlyFee ?? 0), 0),
      overdueAmount,
      trialAmount,
      storeCount: stores.length,
      payingCount: stores.filter(
        (s) =>
          s.status === StoreStatus.ACTIVE || s.status === StoreStatus.TRIAL,
      ).length,
      byStatus,
      byPlan,
      monthlySeries,
      stores: stores.map((s) => ({
        ...s,
        monthlyFee: s.monthlyFee != null ? Number(s.monthlyFee) : null,
      })),
    };
  }

  async updateShipping(storeId: string, dto: UpdateShippingConfigDto) {
    const data: Prisma.StoreUpdateInput = {};
    if (dto.freteModo !== undefined) data.freteModo = dto.freteModo;
    if (dto.freteValorFixo !== undefined) {
      data.freteValorFixo = new Prisma.Decimal(dto.freteValorFixo);
    }
    if (dto.freteGratisAcima !== undefined) {
      data.freteGratisAcima =
        dto.freteGratisAcima === null
          ? null
          : new Prisma.Decimal(dto.freteGratisAcima);
    }
    if (dto.freteEtiquetaAuto !== undefined) {
      data.freteEtiquetaAuto = dto.freteEtiquetaAuto;
    }
    if (dto.freteToken !== undefined) {
      // string vazia = não altera (evita apagar ao salvar sem digitar de novo)
      if (dto.freteToken && dto.freteToken.trim()) {
        data.freteToken = this.secrets.encrypt(dto.freteToken.trim());
      }
    }
    if (dto.freteCepOrigem !== undefined) {
      data.freteCepOrigem = dto.freteCepOrigem
        ? dto.freteCepOrigem.replace(/\D/g, '').slice(0, 8)
        : null;
    }
    if (dto.freteRuaOrigem !== undefined) {
      data.freteRuaOrigem = dto.freteRuaOrigem?.trim() || null;
    }
    if (dto.freteNumeroOrigem !== undefined) {
      data.freteNumeroOrigem = dto.freteNumeroOrigem?.trim() || null;
    }
    if (dto.freteComplementoOrigem !== undefined) {
      data.freteComplementoOrigem = dto.freteComplementoOrigem?.trim() || null;
    }
    if (dto.freteBairroOrigem !== undefined) {
      data.freteBairroOrigem = dto.freteBairroOrigem?.trim() || null;
    }
    if (dto.freteCidadeOrigem !== undefined) {
      data.freteCidadeOrigem = dto.freteCidadeOrigem?.trim() || null;
    }
    if (dto.freteUfOrigem !== undefined) {
      data.freteUfOrigem = dto.freteUfOrigem
        ? dto.freteUfOrigem.trim().toUpperCase().slice(0, 2)
        : null;
    }
    if (dto.freteSandbox !== undefined) data.freteSandbox = dto.freteSandbox;
    if (dto.freteEmailContato !== undefined) {
      data.freteEmailContato = dto.freteEmailContato?.trim() || null;
    }
    if (dto.freteTransportadoras !== undefined) {
      const list = Array.isArray(dto.freteTransportadoras)
        ? dto.freteTransportadoras
            .map((s) =>
              String(s || '')
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean)
        : [];
      data.freteTransportadoras = list.length > 0 ? list : [];
    }

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data,
    });
    return this.toAdminStore(updated);
  }

  async findOne(id: string) {
    let store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }
    store = await this.enforcePlanDue(store);
    const admin = this.toAdminStore(store);
    const due = store.planDueAt ? new Date(store.planDueAt) : null;
    const now = new Date();
    let daysLeft: number | null = null;
    let planState: 'ok' | 'expiring' | 'expired' | 'none' = 'none';
    if (due) {
      daysLeft = Math.ceil(
        (due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysLeft < 0) planState = 'expired';
      else if (daysLeft <= 7) planState = 'expiring';
      else planState = 'ok';
    }
    return {
      ...admin,
      planDueAt: due,
      daysLeft,
      planState,
      accessBlocked:
        store.status === StoreStatus.PAST_DUE ||
        store.status === StoreStatus.SUSPENDED ||
        planState === 'expired',
      monthlyFee: store.monthlyFee != null ? Number(store.monthlyFee) : null,
      // Webhook desta loja (compra + reembolso do cliente via MP). Leva o
      // storeId para o handler resolver a loja em uma chamada só.
      mpWebhookUrl: buildMercadoPagoWebhookUrl(this.config, store.id),
    };
  }

  /**
   * Se o período pago acabou e a loja ainda está ACTIVE/TRIAL → PAST_DUE.
   * (Assinatura cancelada ou renovação que não caiu.)
   */
  private async enforcePlanDue<
    T extends {
      id: string;
      status: StoreStatus;
      planDueAt: Date | null;
    },
  >(store: T): Promise<T> {
    if (
      store.status !== StoreStatus.ACTIVE &&
      store.status !== StoreStatus.TRIAL
    ) {
      return store;
    }
    if (!store.planDueAt || store.planDueAt.getTime() > Date.now()) {
      return store;
    }
    return (await this.prisma.store.update({
      where: { id: store.id },
      data: { status: StoreStatus.PAST_DUE },
    })) as unknown as T;
  }

  /** Não devolve tokens sensíveis em texto claro. */
  private toAdminStore<T extends Record<string, unknown>>(store: T) {
    const { mpAccessToken, freteToken, nfeApiToken, nfeCscToken, ...rest } =
      store as T & {
        mpAccessToken?: string | null;
        freteToken?: string | null;
        nfeApiToken?: string | null;
        nfeCscToken?: string | null;
      };
    const token = (mpAccessToken || '').trim();
    const nfeToken = (nfeApiToken || '').trim();
    const pk =
      typeof (rest as { mpPublicKey?: string | null }).mpPublicKey === 'string'
        ? String((rest as { mpPublicKey?: string | null }).mpPublicKey)
        : '';
    return {
      ...rest,
      mpAccessTokenSet: Boolean(token),
      mpAccessTokenHint: token
        ? `${token.slice(0, 14)}…${token.slice(-4)}`
        : null,
      mpPublicKeyHint: pk ? `${pk.slice(0, 18)}…` : null,
      freteTokenSet: Boolean(freteToken),
      nfeApiTokenSet: Boolean(nfeToken),
      nfeCscTokenSet: Boolean((nfeCscToken || '').trim()),
    };
  }

  /**
   * Normaliza e valida campos do lojista.
   * Documentos são salvos só com dígitos; CPF/CNPJ validados pelo tipo.
   */
  /**
   * Documento, telefone e endereço completos — usado tanto no signup
   * público quanto na criação manual pelo Super Admin, pra não ter duas
   * lojas com regra de completude diferente.
   *
   * O mesmo endereço também vira a origem do frete: é exatamente o que
   * Configurações → Frete pede pra emitir etiqueta, e normalmente é o
   * mesmo local — evita perguntar duas vezes.
   */
  private buildFullSellerProfile(input: {
    sellerDocType: SellerDocType;
    sellerDocument: string;
    phone: string;
    legalName: string;
    contactEmail: string;
    zipCode: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
  }) {
    if (!isValidBrazilianPhone(input.phone)) {
      throw new BadRequestException(
        'Telefone inválido. Use DDD + número, ex.: 11988887777',
      );
    }

    const sellerFields = this.normalizeSellerFields(
      {
        sellerDocType: input.sellerDocType,
        sellerDocument: input.sellerDocument,
        sellerLegalName: input.legalName,
        sellerPhone: input.phone,
      },
      { requireDocument: true },
    );

    const zipDigits = onlyDigits(input.zipCode);
    if (zipDigits.length !== 8) {
      throw new BadRequestException('CEP inválido');
    }
    const state = input.state.trim().toUpperCase();
    if (!BRAZILIAN_STATES.has(state)) {
      throw new BadRequestException('UF inválida');
    }

    const address = {
      zipCode: zipDigits,
      street: input.street.trim(),
      number: input.number.trim(),
      complement: input.complement?.trim() || null,
      neighborhood: input.neighborhood.trim(),
      city: input.city.trim(),
      state,
    };
    const contactEmail = input.contactEmail.toLowerCase().trim();

    return {
      ...sellerFields,
      sellerZipCode: address.zipCode,
      sellerStreet: address.street,
      sellerNumber: address.number,
      sellerComplement: address.complement,
      sellerNeighborhood: address.neighborhood,
      sellerCity: address.city,
      sellerState: address.state,
      sellerEmail: contactEmail,
      freteCepOrigem: address.zipCode,
      freteRuaOrigem: address.street,
      freteNumeroOrigem: address.number,
      freteComplementoOrigem: address.complement,
      freteBairroOrigem: address.neighborhood,
      freteCidadeOrigem: address.city,
      freteUfOrigem: address.state,
      freteEmailContato: contactEmail,
    };
  }

  private normalizeSellerFields(
    input: {
      sellerDocType?: SellerDocType | null;
      sellerDocument?: string | null;
      sellerLegalName?: string | null;
      sellerPhone?: string | null;
    },
    opts?: { requireDocument?: boolean },
  ): {
    sellerDocType?: SellerDocType | null;
    sellerDocument?: string | null;
    sellerLegalName?: string | null;
    sellerPhone?: string | null;
  } {
    const out: {
      sellerDocType?: SellerDocType | null;
      sellerDocument?: string | null;
      sellerLegalName?: string | null;
      sellerPhone?: string | null;
    } = {};

    if (input.sellerLegalName !== undefined) {
      out.sellerLegalName = input.sellerLegalName?.trim() || null;
    }
    if (input.sellerPhone !== undefined) {
      out.sellerPhone = input.sellerPhone?.trim() || null;
    }

    const hasDocInput =
      input.sellerDocument != null &&
      String(input.sellerDocument).trim() !== '';
    const docType = input.sellerDocType ?? null;

    if (!hasDocInput && !opts?.requireDocument) {
      if (input.sellerDocType !== undefined) {
        out.sellerDocType = docType;
      }
      if (input.sellerDocument !== undefined) {
        out.sellerDocument = null;
      }
      return out;
    }

    if (hasDocInput || opts?.requireDocument) {
      if (!docType) {
        throw new BadRequestException(
          'Informe o tipo de documento (CPF ou CNPJ)',
        );
      }
      const digits = onlyDigits(input.sellerDocument);
      if (docType === SellerDocType.CPF) {
        if (!isValidCpf(digits)) {
          throw new BadRequestException('CPF inválido');
        }
      } else if (docType === SellerDocType.CNPJ) {
        if (!isValidCnpj(digits)) {
          throw new BadRequestException('CNPJ inválido');
        }
      }
      out.sellerDocType = docType;
      out.sellerDocument = digits || null;
    }

    return out;
  }

  async updatePrinter(storeId: string, dto: UpdatePrinterConfigDto) {
    // Recusa host interno já no cadastro, para o lojista ver o erro na hora
    // (a impressão revalida antes de conectar — DNS pode mudar depois).
    if (dto.printerHost?.trim()) {
      const allowPrivate =
        (this.config.get<string>('PRINTER_ALLOW_PRIVATE_NETWORK') || '')
          .trim()
          .toLowerCase() === 'true';
      try {
        await resolvePublicAddress(dto.printerHost.trim(), allowPrivate);
      } catch (err) {
        throw new BadRequestException(
          err instanceof Error
            ? err.message
            : 'Endereço de impressora inválido',
        );
      }
    }

    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...(dto.printerType !== undefined
          ? { printerType: dto.printerType }
          : {}),
        ...(dto.printerHost !== undefined
          ? { printerHost: dto.printerHost || null }
          : {}),
        ...(dto.printerPort !== undefined
          ? { printerPort: dto.printerPort }
          : {}),
        ...(dto.printerName !== undefined
          ? { printerName: dto.printerName || null }
          : {}),
        ...(dto.printerAutoPrint !== undefined
          ? { printerAutoPrint: dto.printerAutoPrint }
          : {}),
        ...(dto.printerPaperWidth !== undefined
          ? { printerPaperWidth: dto.printerPaperWidth }
          : {}),
        ...(dto.autoDeliverDays !== undefined
          ? {
              autoDeliverDays: Math.max(
                0,
                Math.min(90, Math.floor(Number(dto.autoDeliverDays) || 0)),
              ),
            }
          : {}),
      },
      select: {
        id: true,
        printerType: true,
        printerHost: true,
        printerPort: true,
        printerName: true,
        printerAutoPrint: true,
        printerPaperWidth: true,
        autoDeliverDays: true,
      },
    });
  }

  private decorateStore(
    store: {
      id: string;
      name: string;
      slug: string;
      status: StoreStatus;
      planName: string;
      planDueAt?: Date | null;
      createdAt?: Date;
      customDomain?: string | null;
    },
    counts: { products: number; orders: number; customers: number },
    admin?: { id: string; name: string; email: string; active: boolean } | null,
  ) {
    const due = store.planDueAt ? new Date(store.planDueAt) : null;
    const now = new Date();
    let daysLeft: number | null = null;
    let planState: 'ok' | 'expiring' | 'expired' | 'none' = 'none';

    if (due) {
      const ms = due.getTime() - now.getTime();
      daysLeft = Math.ceil(ms / (24 * 60 * 60 * 1000));
      if (daysLeft < 0) planState = 'expired';
      else if (daysLeft <= 7) planState = 'expiring';
      else planState = 'ok';
    }

    return {
      ...store,
      planDueAt: due,
      daysLeft,
      planState,
      admin: admin ?? null,
      _count: counts,
    };
  }
}
