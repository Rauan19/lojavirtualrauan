import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, Prisma, Role, StoreStatus } from '@prisma/client';
import { assertMercadoPagoKeyPair } from '../common/utils/mercadopago-keys';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsService } from '../common/secrets/secrets.service';
import { buildPlatformBillingWebhookUrl } from './billing-webhook-url';
import { buildMercadoPagoWebhookUrl } from '../common/utils/mercadopago-webhook-url';
import { analisarPublicUrl } from '../common/utils/public-url-check';
import {
  BILLING_METHOD,
  documentoDoPagador,
  validadeDaCobranca,
} from './pix-billing-rules';
import { UpdatePlatformMercadoPagoDto } from './dto/platform-mp.dto';
import { BillingMailService } from '../mail/billing-mail.service';
import { PlatformPlansService } from './platform-plans.service';
import { type PlatformPlan } from './platform-plans';

type MpPreapproval = {
  id: string;
  status?: string;
  init_point?: string;
  sandbox_init_point?: string;
  external_reference?: string;
  next_payment_date?: string;
  auto_recurring?: {
    transaction_amount?: number | string;
    frequency?: number;
    frequency_type?: string;
  };
};

type MpPreapprovalPlan = {
  id: string;
  status?: string;
  init_point?: string;
  sandbox_init_point?: string;
  reason?: string;
};

type MpAuthorizedPayment = {
  id: number | string;
  status?: string;
  payment?: { id?: number | string; status?: string };
  preapproval_id?: string;
  external_reference?: string;
  transaction_amount?: number;
  debit_date?: string;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
    private readonly platformPlans: PlatformPlansService,
    private readonly billingMail: BillingMailService,
  ) {}

  /** Planos ativos, do banco (editáveis pelo Super Admin em /super/planos). */
  async listPlans(): Promise<PlatformPlan[]> {
    return this.platformPlans.listActive();
  }

  /** Dias de teste grátis usados no signup público. */
  async getTrialDays(): Promise<number> {
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
      select: { trialDays: true },
    });
    if (row?.trialDays) return row.trialDays;
    return Number(this.config.get<string>('TRIAL_DAYS')) || 14;
  }

  async updateTrialDays(days: number) {
    await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', trialDays: days },
      update: { trialDays: days },
    });
    return { trialDays: days };
  }

  async getPlan(planId: string): Promise<PlatformPlan> {
    const plan = (await this.listPlans()).find((p) => p.id === planId);
    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }
    return plan;
  }

  private frontendBase(): string {
    return (
      this.config
        .get<string>('FRONTEND_PUBLIC_URL')
        ?.trim()
        .replace(/\/$/, '') ||
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/$/, '') ||
      'http://localhost:3000'
    );
  }

  private platformBrandName(): string {
    return this.config.get<string>('PLATFORM_BRAND_NAME')?.trim() || 'Vendira';
  }

  /** back_url da assinatura MP: precisa ser URL pública (não aceita localhost). */
  private subscriptionBackUrl(invoiceId: string): string {
    const publicApi = (this.config.get<string>('PUBLIC_URL') || '')
      .trim()
      .replace(/\/$/, '');
    if (publicApi && !this.isLocalHost(publicApi)) {
      // API pública redireciona para o front (localhost ok no destino)
      return `${publicApi}/api/billing/return?invoice=${encodeURIComponent(invoiceId)}&status=success`;
    }

    const front =
      this.config
        .get<string>('FRONTEND_PUBLIC_URL')
        ?.trim()
        .replace(/\/$/, '') ||
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/$/, '') ||
      '';

    if (!front || this.isLocalHost(front)) {
      throw new BadRequestException(
        'Mercado Pago não aceita localhost no retorno da assinatura. Defina PUBLIC_URL com ngrok/HTTPS da API (ou FRONTEND_PUBLIC_URL com túnel do Next).',
      );
    }

    return `${front}/admin/settings/planos?status=success&invoice=${encodeURIComponent(invoiceId)}`;
  }

  private isLocalHost(url: string): boolean {
    try {
      const u = new URL(url);
      return (
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname === '0.0.0.0' ||
        u.hostname.endsWith('.local')
      );
    } catch {
      return true;
    }
  }

  /** Credenciais MP da plataforma: painel Super Admin (DB) > .env fallback. */
  private async resolvePlatformMpCredentials(): Promise<{
    accessToken: string;
    publicKey: string;
    source: 'database' | 'env' | 'none';
  }> {
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    const dbToken = this.secrets.decryptSafe(row?.mpAccessToken)?.trim() || '';
    const dbPk = row?.mpPublicKey?.trim() || '';
    if (dbToken) {
      return {
        accessToken: dbToken,
        publicKey: dbPk,
        source: 'database',
      };
    }

    const envToken =
      this.config.get<string>('PLATFORM_MP_ACCESS_TOKEN')?.trim() || '';
    const envPk =
      this.config.get<string>('PLATFORM_MP_PUBLIC_KEY')?.trim() || '';
    if (envToken) {
      return {
        accessToken: envToken,
        publicKey: envPk,
        source: 'env',
      };
    }

    return { accessToken: '', publicKey: '', source: 'none' };
  }

  private async platformAccessToken(): Promise<string> {
    const { accessToken } = await this.resolvePlatformMpCredentials();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'Pagamento da mensalidade indisponível: configure o Mercado Pago no Super Admin (ou PLATFORM_MP_ACCESS_TOKEN no .env)',
      );
    }
    return accessToken;
  }

  private async isLiveMode(): Promise<boolean> {
    const { publicKey, accessToken } =
      await this.resolvePlatformMpCredentials();
    const probe = `${publicKey || ''} ${accessToken || ''}`.toUpperCase();
    // Chave TEST- nunca é produção — ignora checkbox se estiver inconsistente
    if (probe.includes('TEST-')) return false;

    const row = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    // Flag explícita no Super Admin (APP_USR- de teste NÃO começa com TEST-)
    if (row && typeof row.mpUseSandbox === 'boolean') {
      return !row.mpUseSandbox;
    }

    return true;
  }

  /** Headers padrão da API MP (Access Token). Sem X-scope — ele faz o MP devolver corpo vazio. */
  private mpApiHeaders(
    accessToken: string,
    opts?: { idempotencyKey?: string },
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    if (opts?.idempotencyKey) {
      headers['X-Idempotency-Key'] = opts.idempotencyKey;
    }
    return headers;
  }

  /**
   * Collector (dono do Access Token) é conta de teste (@testuser.com / TESTUSER)?
   * TEST- da conta real ainda é collector REAL — não misturar com payer teste.
   */
  private async collectorIsTestUser(accessToken: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return false;
      const me = (await res.json()) as {
        email?: string;
        nickname?: string;
        site_id?: string;
      };
      const email = (me.email || '').toLowerCase();
      const nick = (me.nickname || '').toLowerCase();
      return (
        email.includes('@testuser.com') ||
        nick.startsWith('testuser') ||
        nick.startsWith('ttestuser')
      );
    } catch {
      return false;
    }
  }

  /**
   * payer_email do preapproval:
   * - Collector teste → Comprador de teste (@testuser.com)
   * - Collector real (mesmo com chave TEST-) → e-mail real do lojista
   * Misturar = "Both payer and collector must be real or test users"
   */
  private async resolveCheckoutPayerEmail(
    accessToken: string,
    fallbackEmail: string,
  ): Promise<{ email: string; collectorIsTest: boolean }> {
    const collectorIsTest = await this.collectorIsTestUser(accessToken);
    if (!collectorIsTest) {
      if (!fallbackEmail) {
        throw new BadRequestException(
          'E-mail obrigatório para assinar. Atualize o perfil da loja ou use o login com e-mail.',
        );
      }
      return { email: fallbackEmail, collectorIsTest: false };
    }

    const row = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    const configured = row?.mpTestPayerEmail?.trim() || '';
    const fromEnv =
      this.config.get<string>('PLATFORM_MP_TEST_PAYER_EMAIL')?.trim() || '';
    const raw = (configured || fromEnv).trim();
    if (!raw) {
      throw new BadRequestException(
        'As credenciais são de um Vendedor de teste. Informe o Comprador de teste no Super Admin ' +
          '(User TESTUSER… ou e-mail @testuser.com).',
      );
    }

    const normalized = this.normalizeTestPayerEmail(raw);
    if (!normalized) {
      throw new BadRequestException(
        'Comprador de teste inválido. Use TESTUSER123456 ou test_user_123456@testuser.com',
      );
    }
    return { email: normalized, collectorIsTest: true };
  }

  /** TESTUSER686959562 → test_user_686959562@testuser.com */
  private normalizeTestPayerEmail(raw: string): string | null {
    const v = raw.trim().toLowerCase();
    if (!v) return null;

    if (v.includes('@')) {
      return v;
    }

    const testUser = v.match(/^testuser[_-]?(\d+)$/i);
    if (testUser?.[1]) {
      return `test_user_${testUser[1]}@testuser.com`;
    }

    const testUserEmail = v.match(/^test_user[_+]?(\d+)$/i);
    if (testUserEmail?.[1]) {
      return `test_user_${testUserEmail[1]}@testuser.com`;
    }

    // Só números → assume ID do comprador de teste
    if (/^\d{6,}$/.test(v)) {
      return `test_user_${v}@testuser.com`;
    }

    return null;
  }

  /** Super Admin: status das credenciais MP (sem devolver token completo). */
  async getPlatformMpSettings() {
    const creds = await this.resolvePlatformMpCredentials();
    const token = creds.accessToken;
    const pk = creds.publicKey;
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    const useSandbox =
      typeof row?.mpUseSandbox === 'boolean'
        ? row.mpUseSandbox
        : `${pk} ${token}`.toUpperCase().includes('TEST-');
    const liveMode = token
      ? !useSandbox && !`${pk} ${token}`.toUpperCase().includes('TEST-')
      : null;
    let collectorIsTest: boolean | null = null;
    const subscriptionsReady = Boolean(token);
    let subscriptionsHint: string | null = null;
    if (token) {
      collectorIsTest = await this.collectorIsTestUser(token);
      const isTestKey = `${pk} ${token}`.toUpperCase().includes('TEST-');
      if (isTestKey && !collectorIsTest) {
        subscriptionsHint =
          'Credenciais de teste da conta real: no checkout da Assinatura entre com a MESMA conta real (e-mail do lojista) e use cartão de teste do MP. Não entre com TESTUSER comprador — isso causa “uma das partes é de teste”.';
      } else if (!collectorIsTest && useSandbox && row?.mpTestPayerEmail) {
        subscriptionsHint =
          'Comprador de teste só vale se o Access Token for de usuário teste. Com token da conta real o payer será o e-mail do lojista.';
      }
    }
    return {
      mpAccessTokenSet: Boolean(token),
      mpAccessTokenHint: token
        ? `${token.slice(0, 14)}…${token.slice(-4)}`
        : null,
      mpPublicKeySet: Boolean(pk),
      mpPublicKeyHint: pk ? `${pk.slice(0, 18)}…` : null,
      mpUseSandbox:
        useSandbox ||
        Boolean(token && `${token}`.toUpperCase().includes('TEST-')),
      mpTestPayerEmail: row?.mpTestPayerEmail || null,
      source: creds.source,
      paymentsEnabled: Boolean(token),
      billingWebhookUrl: buildPlatformBillingWebhookUrl(this.config),
      liveMode,
      collectorIsTest,
      subscriptionsReady,
      subscriptionsHint,
    };
  }

  async updatePlatformMp(dto: UpdatePlatformMercadoPagoDto) {
    const current = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    const envToken =
      this.config.get<string>('PLATFORM_MP_ACCESS_TOKEN')?.trim() || '';
    const envPk =
      this.config.get<string>('PLATFORM_MP_PUBLIC_KEY')?.trim() || '';
    const nextToken =
      dto.mpAccessToken?.trim() ||
      this.secrets.decryptSafe(current.mpAccessToken) ||
      envToken ||
      null;
    const nextPk =
      dto.mpPublicKey?.trim() || current.mpPublicKey || envPk || null;

    // Só valida o par quando está salvando/alterando credenciais
    if (dto.mpAccessToken?.trim() || dto.mpPublicKey?.trim()) {
      try {
        assertMercadoPagoKeyPair({
          publicKey: nextPk,
          accessToken: nextToken,
        });
      } catch (err) {
        throw new BadRequestException(
          err instanceof Error
            ? err.message
            : 'Credenciais Mercado Pago inválidas',
        );
      }
    }

    const data: Prisma.PlatformSettingsUpdateInput = {};
    if (dto.mpAccessToken?.trim()) {
      data.mpAccessToken = this.secrets.encrypt(dto.mpAccessToken.trim());
    }
    if (dto.mpPublicKey?.trim()) {
      data.mpPublicKey = dto.mpPublicKey.trim();
    }
    if (typeof dto.mpUseSandbox === 'boolean') {
      data.mpUseSandbox = dto.mpUseSandbox;
    } else if (dto.mpAccessToken?.trim() || dto.mpPublicKey?.trim()) {
      // Auto: se colar chave TEST-, marca sandbox
      const probe =
        `${dto.mpPublicKey || nextPk || ''} ${dto.mpAccessToken || nextToken || ''}`.toUpperCase();
      if (probe.includes('TEST-')) {
        data.mpUseSandbox = true;
      }
    }
    if (dto.mpTestPayerEmail !== undefined) {
      const raw = dto.mpTestPayerEmail?.trim() || '';
      if (!raw) {
        data.mpTestPayerEmail = null;
      } else {
        const normalized = this.normalizeTestPayerEmail(raw);
        if (!normalized) {
          throw new BadRequestException(
            'Comprador de teste inválido. Use TESTUSER123456 ou test_user_123456@testuser.com',
          );
        }
        data.mpTestPayerEmail = normalized;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Informe Access Token, Public Key, ambiente ou e-mail do comprador teste',
      );
    }

    // Troca de credenciais invalida planos cacheados no MP
    if (dto.mpAccessToken?.trim()) {
      data.mpPreapprovalPlans = Prisma.DbNull;
    }

    await this.prisma.platformSettings.update({
      where: { id: 'default' },
      data,
    });

    return this.getPlatformMpSettings();
  }

  /** back_url pública para criar preapproval_plan (sem invoice). */
  private platformPlanBackUrl(): string {
    const publicApi = (this.config.get<string>('PUBLIC_URL') || '')
      .trim()
      .replace(/\/$/, '');
    if (publicApi && !this.isLocalHost(publicApi)) {
      return `${publicApi}/api/billing/return?status=success`;
    }

    const front =
      this.config
        .get<string>('FRONTEND_PUBLIC_URL')
        ?.trim()
        .replace(/\/$/, '') ||
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/$/, '') ||
      '';

    if (!front || this.isLocalHost(front)) {
      throw new BadRequestException(
        'Mercado Pago não aceita localhost no back_url do plano. Defina PUBLIC_URL (ngrok/HTTPS da API).',
      );
    }

    return `${front}/admin/settings/planos?status=success`;
  }

  private planCacheKey(plan: PlatformPlan): string {
    return `${plan.id}:${plan.amount}`;
  }

  private readPlanCache(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  }

  /**
   * Etapa 1 — cria (ou reutiliza) preapproval_plan no MP.
   * O `id` retornado é o `preapproval_plan_id` obrigatório na assinatura.
   */
  private async ensurePreapprovalPlan(
    plan: PlatformPlan,
    accessToken: string,
  ): Promise<string> {
    const settings = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
    const cache = this.readPlanCache(settings.mpPreapprovalPlans);
    const key = this.planCacheKey(plan);
    const cachedId = cache[key];

    if (cachedId) {
      const check = await fetch(
        `https://api.mercadopago.com/preapproval_plan/${cachedId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (check.ok) return cachedId;
      // Plano sumiu / token trocou → limpa cache e recria
      delete cache[key];
      await this.prisma.platformSettings.update({
        where: { id: 'default' },
        data: { mpPreapprovalPlans: cache },
      });
    }

    const body = {
      reason: `Mensalidade ${this.platformBrandName()} · Plano ${plan.name}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.amount,
        currency_id: 'BRL',
      },
      back_url: this.platformPlanBackUrl(),
    };

    const response = await fetch(
      'https://api.mercadopago.com/preapproval_plan',
      {
        method: 'POST',
        headers: this.mpApiHeaders(accessToken),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Erro Mercado Pago (criar plano de assinatura): ${err}`,
      );
    }

    const created = (await response.json()) as MpPreapprovalPlan;
    if (!created.id) {
      throw new BadRequestException(
        'Mercado Pago não retornou id do plano de assinatura',
      );
    }

    const nextCache = { ...cache, [key]: created.id };
    await this.prisma.platformSettings.update({
      where: { id: 'default' },
      data: { mpPreapprovalPlans: nextCache },
    });

    return created.id;
  }

  /**
   * Diagnóstico da URL pública: confere o formato e, se estiver plausível,
   * tenta alcançá-la de fato.
   *
   * O teste ativo existe porque o modo de falha mais comum não é PUBLIC_URL
   * vazia — é a que aponta para um túnel de desenvolvimento que já caiu.
   * Ela passa em qualquer validação de formato e não entrega nada.
   */
  async testarWebhookPublico() {
    const diag = analisarPublicUrl(this.config.get<string>('PUBLIC_URL'));

    if (!diag.ok) {
      return {
        ok: false,
        motivo: diag.motivo,
        detalhe: diag.detalhe,
        webhookPedidos: null,
        webhookMensalidade: null,
      };
    }

    const webhookPedidos = buildMercadoPagoWebhookUrl(this.config);
    const webhookMensalidade = buildPlatformBillingWebhookUrl(this.config);

    let alcancavel = false;
    let erro: string | null = null;
    try {
      const controller = new AbortController();
      const prazo = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${diag.url}/api/public/health`, {
        signal: controller.signal,
      });
      clearTimeout(prazo);
      alcancavel = res.ok;
      if (!res.ok) erro = `A URL respondeu HTTP ${res.status}.`;
    } catch (e) {
      erro =
        e instanceof Error && e.name === 'AbortError'
          ? 'A URL não respondeu em 8 segundos.'
          : 'Não foi possível alcançar a URL pela internet.';
    }

    return {
      ok: alcancavel,
      motivo: alcancavel ? null : 'inalcancavel',
      detalhe: alcancavel
        ? diag.tunel
          ? 'A URL responde, mas é um túnel de desenvolvimento: quando ele cair, os pagamentos param de ser confirmados sozinhos e nada avisa. Use um domínio fixo em produção.'
          : 'A URL responde. Os webhooks conseguem chegar.'
        : `${erro} Enquanto isso, o cliente paga e o pedido fica parado em "aguardando pagamento".`,
      url: diag.url,
      tunel: diag.tunel,
      webhookPedidos,
      webhookMensalidade,
    };
  }

  async testPlatformMp() {
    const { accessToken, publicKey } =
      await this.resolvePlatformMpCredentials();
    if (!accessToken) {
      throw new BadRequestException(
        'Salve o Access Token no Super Admin antes de testar',
      );
    }
    if (!publicKey) {
      throw new BadRequestException(
        'Salve a Public Key no Super Admin antes de testar',
      );
    }

    try {
      assertMercadoPagoKeyPair({ publicKey, accessToken });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Credenciais inválidas',
      );
    }

    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      body = { raw: raw.slice(0, 200) };
    }

    if (!res.ok) {
      throw new BadRequestException(
        `Mercado Pago recusou o token (${res.status}): ${JSON.stringify(body).slice(0, 300)}`,
      );
    }

    return {
      ok: true,
      id: body.id,
      nickname: body.nickname,
      email: body.email,
      site_id: body.site_id,
    };
  }

  async mySubscription(storeId: string) {
    let store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        planName: true,
        planDueAt: true,
        monthlyFee: true,
        mpPreapprovalId: true,
        mpSubscriptionStatus: true,
        billingMethod: true,
      },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    if (
      (store.status === StoreStatus.ACTIVE ||
        store.status === StoreStatus.TRIAL) &&
      store.planDueAt &&
      store.planDueAt.getTime() <= Date.now()
    ) {
      store = await this.prisma.store.update({
        where: { id: storeId },
        data: { status: StoreStatus.PAST_DUE },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          planName: true,
          planDueAt: true,
          monthlyFee: true,
          mpPreapprovalId: true,
          mpSubscriptionStatus: true,
          billingMethod: true,
        },
      });
    }

    const due = store.planDueAt ? new Date(store.planDueAt) : null;
    let daysLeft: number | null = null;
    let planState: 'ok' | 'expiring' | 'expired' | 'none' = 'none';
    if (due) {
      daysLeft = Math.ceil(
        (due.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      );
      if (daysLeft < 0) planState = 'expired';
      else if (daysLeft <= 7) planState = 'expiring';
      else planState = 'ok';
    }

    const recent = await this.prisma.platformInvoice.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const lastPaid = recent.find(
      (inv) => inv.status === PaymentStatus.APPROVED && inv.paidAt,
    );

    const subStatus = store.mpSubscriptionStatus || null;
    // Só "assinatura ativa" (renovação no MP) quando authorized.
    // Cancelada / pending: mostra planos de novo; acesso até planDueAt é outro conceito.
    const recurringActive = subStatus === 'authorized';

    const creds = await this.resolvePlatformMpCredentials();

    return {
      store: {
        ...store,
        monthlyFee: store.monthlyFee != null ? Number(store.monthlyFee) : null,
        planDueAt: due,
        daysLeft,
        planState,
        subscriptionStatus: subStatus,
        recurringActive,
        accessBlocked:
          store.status === StoreStatus.PAST_DUE ||
          store.status === StoreStatus.SUSPENDED ||
          planState === 'expired',
        lastPaidAt: lastPaid?.paidAt || null,
        lastPaidAmount: lastPaid ? Number(lastPaid.amount) : null,
        lastPaidPlanName: lastPaid?.planName || null,
      },
      plans: await this.listPlans(),
      paymentsEnabled: Boolean(creds.accessToken),
      publicKey: creds.publicKey || null,
      billingMode: 'subscription' as const,
      recentInvoices: recent.map((inv) => ({
        id: inv.id,
        planId: inv.planId,
        planName: inv.planName,
        amount: Number(inv.amount),
        periodDays: inv.periodDays,
        status: inv.status,
        paidAt: inv.paidAt,
        createdAt: inv.createdAt,
        mpPreapprovalId: inv.mpPreapprovalId,
      })),
    };
  }

  /**
   * Retorno pós-checkout da assinatura MP.
   * PUBLIC_URL (ngrok) → redireciona para o front local/produção.
   */
  buildReturnRedirect(invoiceId?: string, status?: string): string {
    const front = this.frontendBase();
    const st = status?.trim() || 'success';
    const inv = invoiceId?.trim();
    const q = new URLSearchParams({ status: st });
    if (inv) q.set('invoice', inv);
    return `${front}/admin/settings/planos?${q.toString()}`;
  }

  /**
   * Assinatura com plano associado (MP):
   * 1) preapproval_plan  2) preapproval com preapproval_plan_id + card_token_id + status authorized
   */
  async createAuthorizedSubscription(
    storeId: string,
    planId: string,
    cardTokenId: string,
    payerEmail?: string,
  ) {
    const tokenId = cardTokenId?.trim();
    if (!tokenId) {
      throw new BadRequestException('Token do cartão ausente');
    }

    const plan = await this.getPlan(planId);
    const token = await this.platformAccessToken();
    const preapprovalPlanId = await this.ensurePreapprovalPlan(plan, token);

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        sellerEmail: true,
        mpPreapprovalId: true,
        mpSubscriptionStatus: true,
        planName: true,
      },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const storeEmail = (payerEmail || store.sellerEmail || '')
      .trim()
      .toLowerCase();
    const { email } = await this.resolveCheckoutPayerEmail(token, storeEmail);
    if (!email) {
      throw new BadRequestException(
        'E-mail obrigatório para assinar. Use o login com e-mail.',
      );
    }

    if (
      store.mpSubscriptionStatus === 'authorized' &&
      store.mpPreapprovalId &&
      store.planName === plan.id
    ) {
      throw new BadRequestException(
        'Esta loja já tem assinatura recorrente ativa neste plano.',
      );
    }

    if (
      store.mpPreapprovalId &&
      store.mpSubscriptionStatus &&
      store.mpSubscriptionStatus !== 'cancelled' &&
      store.mpSubscriptionStatus !== 'authorized'
    ) {
      await this.cancelPreapproval(store.mpPreapprovalId, token).catch(
        () => undefined,
      );
    } else if (
      store.mpPreapprovalId &&
      store.mpSubscriptionStatus === 'authorized' &&
      store.planName !== plan.id
    ) {
      await this.cancelPreapproval(store.mpPreapprovalId, token).catch(
        () => undefined,
      );
    }

    const invoice = await this.prisma.platformInvoice.create({
      data: {
        storeId,
        planId: plan.id,
        planName: plan.name,
        amount: new Prisma.Decimal(plan.amount),
        periodDays: plan.periodDays,
        status: PaymentStatus.PENDING,
      },
    });

    const backUrl = this.subscriptionBackUrl(invoice.id);
    const notificationUrl = buildPlatformBillingWebhookUrl(this.config);

    const body: Record<string, unknown> = {
      preapproval_plan_id: preapprovalPlanId,
      reason: `Mensalidade ${this.platformBrandName()} · Plano ${plan.name}`,
      external_reference: invoice.id,
      payer_email: email,
      card_token_id: tokenId,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.amount,
        currency_id: 'BRL',
      },
      back_url: backUrl,
      status: 'authorized',
    };
    if (notificationUrl) {
      body.notification_url = notificationUrl;
    }

    const response = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      await this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: { status: PaymentStatus.CANCELLED },
      });
      if (
        err.toLowerCase().includes('template') &&
        err.toLowerCase().includes('does not exist')
      ) {
        await this.prisma.platformSettings
          .update({
            where: { id: 'default' },
            data: { mpPreapprovalPlans: Prisma.DbNull },
          })
          .catch(() => undefined);
      }
      throw new BadRequestException(this.formatMpSubscriptionError(err));
    }

    const preapproval = (await response.json()) as MpPreapproval;
    const status = (preapproval.status || 'authorized').toLowerCase();

    await this.prisma.$transaction([
      this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          mpPreapprovalId: preapproval.id,
          ...(status === 'authorized'
            ? { status: PaymentStatus.APPROVED, paidAt: new Date() }
            : {}),
        },
      }),
      this.prisma.store.update({
        where: { id: storeId },
        data: {
          mpPreapprovalId: preapproval.id,
          mpSubscriptionStatus: status,
        },
      }),
    ]);

    if (status === 'authorized') {
      await this.activateStoreFromInvoice(invoice.id, {
        markPaid: true,
        paymentId: null,
      });
    }

    return {
      mode: 'plan_associated' as const,
      invoiceId: invoice.id,
      preapprovalPlanId,
      preapprovalId: preapproval.id,
      status,
      authorized: status === 'authorized',
      amount: plan.amount,
      plan,
      recurring: true,
      subscription: await this.mySubscription(storeId),
    };
  }

  /** Mensagens legíveis para erros conhecidos do MP em assinaturas. */
  private formatMpSubscriptionError(raw: string, httpStatus?: number): string {
    const text = (raw || '').trim();
    const lower = text.toLowerCase();
    if (lower.includes('card token service not found')) {
      return (
        'Mercado Pago recusou o token do cartão na assinatura (Card token service not found). ' +
        'Em TESTe isso é comum: use o checkout de Assinaturas (redirect), não o Card Brick. ' +
        'O fluxo embutido com card_token + authorized costuma exigir produção / cartão real.'
      );
    }
    if (lower.includes('template') && lower.includes('does not exist')) {
      return (
        'Plano de assinatura inválido no Mercado Pago (template não existe). ' +
        'O cache foi limpo na próxima tentativa; confira se Access Token e Public Key são do mesmo app.'
      );
    }
    if (lower.includes('card_token_id is required')) {
      return 'Mercado Pago exige card_token nesta modalidade. Use o checkout de Assinaturas (redirect) sem plano associado.';
    }
    if (lower.includes('both payer and collector')) {
      return (
        'Mercado Pago: pagador e vendedor precisam ser ambos reais OU ambos de teste. ' +
        'Com Access Token TEST- da sua conta real, o payer deve ser o e-mail real do lojista ' +
        '(não o Comprador de teste). Para testar só com @testuser.com, crie uma Conta de teste ' +
        'Vendedor no painel MP e use as credenciais dela no Super Admin.'
      );
    }
    if (!text) {
      return (
        `Erro Mercado Pago (assinatura): resposta vazia` +
        (httpStatus ? ` HTTP ${httpStatus}` : '') +
        '. Confira payer_email, back_url (PUBLIC_URL) e se o Access Token ainda é válido.'
      );
    }
    return `Erro Mercado Pago (assinatura): ${text}`;
  }

  /**
   * Checkout via redirect (assinatura SEM plano associado).
   * status pending → init_point — o cliente informa o cartão no checkout do MP.
   * (Plano associado exige card_token + authorized e falha em TEST.)
   */
  async createCheckout(storeId: string, planId: string, payerEmail?: string) {
    const plan = await this.getPlan(planId);
    const token = await this.platformAccessToken();

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        sellerEmail: true,
        mpPreapprovalId: true,
        mpSubscriptionStatus: true,
        planName: true,
      },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const storeEmail = (payerEmail || store.sellerEmail || '')
      .trim()
      .toLowerCase();
    // Com TEST-/APP_USR da conta real, /users/me = collector REAL.
    // payer_email teste → 400 "Both payer and collector must be real or test users".
    // payer real + login TESTUSER no checkout → erro 145.
    // Fluxo válido com credenciais de teste da conta real: payer = e-mail real +
    // no checkout MP entrar na conta real e usar cartão de teste.
    const { email, collectorIsTest } = await this.resolveCheckoutPayerEmail(
      token,
      storeEmail,
    );
    if (!email) {
      throw new BadRequestException(
        'E-mail obrigatório para assinar. Atualize o perfil da loja ou use o login com e-mail.',
      );
    }

    const liveMode = await this.isLiveMode();

    // Assinatura ativa → não cria outra (troca de plano: cancelar antes)
    if (store.mpSubscriptionStatus === 'authorized' && store.mpPreapprovalId) {
      throw new BadRequestException(
        'Esta loja já tem assinatura ativa. Cancele a atual antes de assinar outro plano.',
      );
    }

    // Cancela pré-aprovação pendente/pausada antes de criar nova
    if (
      store.mpPreapprovalId &&
      store.mpSubscriptionStatus &&
      store.mpSubscriptionStatus !== 'cancelled'
    ) {
      await this.cancelPreapproval(store.mpPreapprovalId, token).catch(
        () => undefined,
      );
    }

    const invoice = await this.prisma.platformInvoice.create({
      data: {
        storeId,
        planId: plan.id,
        planName: plan.name,
        amount: new Prisma.Decimal(plan.amount),
        periodDays: plan.periodDays,
        status: PaymentStatus.PENDING,
      },
    });

    const backUrl = this.subscriptionBackUrl(invoice.id);
    const notificationUrl = buildPlatformBillingWebhookUrl(this.config);

    const body: Record<string, unknown> = {
      reason: `Mensalidade ${this.platformBrandName()} · Plano ${plan.name}`,
      external_reference: invoice.id,
      payer_email: email,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.amount,
        currency_id: 'BRL',
      },
      back_url: backUrl,
      status: 'pending',
    };
    if (notificationUrl) {
      body.notification_url = notificationUrl;
    }

    const postPreapproval = async (
      payload: Record<string, unknown>,
      idempotencyKey: string,
    ) => {
      const response = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: this.mpApiHeaders(token, { idempotencyKey }),
        body: JSON.stringify(payload),
      });
      const errText = response.ok ? '' : await response.text();
      return { response, errText };
    };

    let { response, errText } = await postPreapproval(body, invoice.id);
    let sentBody = body;

    // Retry sem notification_url (ngrok free / URL inválida às vezes devolve corpo vazio)
    if (
      !response.ok &&
      body.notification_url &&
      (!errText.trim() || response.status >= 500)
    ) {
      const retryBody = { ...body };
      delete retryBody.notification_url;
      this.logger.warn(
        `MP preapproval retry sem notification_url (HTTP ${response.status})`,
      );
      ({ response, errText } = await postPreapproval(
        retryBody,
        `${invoice.id}-nurl`,
      ));
      sentBody = retryBody;
    }

    if (!response.ok) {
      this.logger.warn(
        `MP preapproval falhou HTTP ${response.status} live=${liveMode} ` +
          `collectorTest=${collectorIsTest} payer=${email} ` +
          `back_url=${backUrl} body=${JSON.stringify(sentBody).slice(0, 500)} ` +
          `resp=${errText.slice(0, 500) || '(vazio)'}`,
      );
      await this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: { status: PaymentStatus.CANCELLED },
      });
      throw new BadRequestException(
        this.formatMpSubscriptionError(errText, response.status),
      );
    }

    const preapproval = (await response.json()) as MpPreapproval;

    this.logger.log(
      `MP preapproval criado id=${preapproval.id} live=${liveMode} ` +
        `collectorTest=${collectorIsTest} payer=${email} init=${preapproval.init_point || '-'} ` +
        `sandbox=${preapproval.sandbox_init_point || '-'}`,
    );

    await this.prisma.$transaction([
      this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: { mpPreapprovalId: preapproval.id },
      }),
      this.prisma.store.update({
        where: { id: storeId },
        data: {
          mpPreapprovalId: preapproval.id,
          mpSubscriptionStatus: preapproval.status || 'pending',
        },
      }),
    ]);

    const initPoint =
      preapproval.init_point ||
      (preapproval.id
        ? `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${preapproval.id}`
        : '');
    const sandboxInitPoint = preapproval.sandbox_init_point || initPoint;

    // Em teste SEMPRE preferir sandbox — init_point de produção + comprador teste = erro 145
    const checkoutUrl = liveMode
      ? initPoint || sandboxInitPoint
      : sandboxInitPoint || initPoint;

    return {
      mode: 'subscription' as const,
      invoiceId: invoice.id,
      preapprovalId: preapproval.id,
      initPoint: checkoutUrl,
      sandboxInitPoint,
      liveMode,
      payerEmail: email,
      amount: plan.amount,
      plan,
      recurring: true,
    };
  }

  private async cancelPreapproval(preapprovalId: string, token: string) {
    await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  }

  /**
   * Lojista cancela a recorrência no MP.
   * Acesso à loja continua até planDueAt (período já pago).
   */
  /*
   * ---------------------------------------------------------------------
   * Mensalidade por Pix
   *
   * Pix recorrente não existe na API do Mercado Pago — preapproval só faz
   * débito no cartão. Aqui o ciclo é nosso: a cada mês criamos uma
   * PlatformInvoice e uma cobrança Pix avulsa apontando para ela em
   * external_reference. Quando o lojista paga, o webhook de pagamento cai no
   * applyPayment, que já sabe achar a fatura e empurrar o vencimento — o
   * mesmo caminho do cartão.
   * ---------------------------------------------------------------------
   */

  private async emailDoLojista(storeId: string, sellerEmail?: string | null) {
    const fiscal = (sellerEmail || '').trim().toLowerCase();
    if (fiscal) return fiscal;

    const admin = await this.prisma.user.findFirst({
      where: { storeId, role: Role.STORE_ADMIN },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    });
    return admin?.email?.trim().toLowerCase() || null;
  }

  /** Plano do lojista, com queda para o primeiro ativo se o dele sumiu. */
  private async planoParaCobranca(planId?: string | null) {
    const planos = await this.listPlans();
    if (planos.length === 0) {
      throw new NotFoundException('Nenhum plano ativo configurado');
    }
    const escolhido = planId
      ? planos.find((p) => p.id === planId)
      : undefined;
    if (escolhido) return escolhido;

    const padrao = planos.find((p) => p.id === 'mensal') || planos[0];
    if (planId) {
      this.logger.warn(
        `Plano "${planId}" não existe mais; cobrando pelo plano ${padrao.id}`,
      );
    }
    return padrao;
  }

  /** Lojista escolhe pagar por Pix e recebe a primeira cobrança. */
  async subscribeWithPix(storeId: string, planId: string) {
    const plan = await this.getPlan(planId);
    await this.prisma.store.update({
      where: { id: storeId },
      data: { billingMethod: BILLING_METHOD.PIX },
    });
    return this.emitirCobrancaPix(storeId, plan.id);
  }

  /** Cobrança Pix em aberto da loja, para o painel mostrar o QR. */
  async cobrancaPixAberta(storeId: string) {
    const invoice = await this.prisma.platformInvoice.findFirst({
      where: {
        storeId,
        method: BILLING_METHOD.PIX,
        status: PaymentStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invoice) return null;

    const expirada =
      invoice.pixExpiresAt != null &&
      invoice.pixExpiresAt.getTime() <= Date.now();

    return {
      id: invoice.id,
      amount: invoice.amount,
      planName: invoice.planName,
      dueAt: invoice.dueAt,
      copiaECola: invoice.pixCopiaECola,
      qrCodeBase64: invoice.pixQrCodeBase64,
      expiresAt: invoice.pixExpiresAt,
      expirada,
      // outra requisição pode estar emitindo agora; o painel reconsulta
      gerando: !invoice.pixCopiaECola,
    };
  }

  /**
   * Cria a fatura do ciclo e a cobrança Pix no Mercado Pago.
   *
   * Reaproveita uma fatura Pix pendente e ainda válida em vez de criar outra:
   * duas cobranças abertas para o mesmo mês é o caminho para o lojista pagar
   * duas vezes.
   */
  async emitirCobrancaPix(storeId: string, planId?: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        planName: true,
        planDueAt: true,
        sellerEmail: true,
        sellerLegalName: true,
        sellerDocType: true,
        sellerDocument: true,
      },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    /*
     * O plano da loja pode não existir mais na tabela (nome legado, plano
     * desativado). Cair no primeiro plano ativo é melhor que estourar: sem
     * isso a cobrança do mês simplesmente não sai, em silêncio, e a loja usa
     * a plataforma de graça até alguém reparar.
     */
    const plan = await this.planoParaCobranca(planId || store.planName);

    const pagador = documentoDoPagador(
      store.sellerDocType,
      store.sellerDocument,
    );
    if (!pagador) {
      throw new BadRequestException(
        'Informe o CPF ou CNPJ da loja em Configurações antes de gerar a cobrança Pix — o Mercado Pago exige o documento do pagador.',
      );
    }

    /*
     * E-mail do pagador: o fiscal da loja, com queda para o do admin. Bloquear
     * a cobrança por falta de um campo opcional deixaria a loja sem como
     * pagar — e o admin sempre tem e-mail, é com ele que faz login.
     */
    const email = await this.emailDoLojista(storeId, store.sellerEmail);
    if (!email) {
      throw new BadRequestException(
        'Informe o e-mail da loja em Configurações antes de gerar a cobrança Pix.',
      );
    }

    const token = await this.platformAccessToken();
    const expiraEm = validadeDaCobranca();

    /*
     * Checar-e-criar precisa ser atômico. Sem o lock, dois cliques no botão
     * (ou o painel e a varredura ao mesmo tempo) passavam os dois pela
     * verificação de "já existe cobrança aberta" e geravam dois QR do mesmo
     * mês — e o lojista podia pagar os dois. O SELECT ... FOR UPDATE na linha
     * da loja serializa por loja; o segundo espera e encontra a cobrança do
     * primeiro.
     */
    const { invoice, jaExistia } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;

      const aberta = await tx.platformInvoice.findFirst({
        where: {
          storeId,
          method: BILLING_METHOD.PIX,
          status: PaymentStatus.PENDING,
        },
        orderBy: { createdAt: 'desc' },
      });
      // vale mesmo sem QR ainda: outra requisição pode estar emitindo agora
      if (
        aberta &&
        (!aberta.pixExpiresAt || aberta.pixExpiresAt.getTime() > Date.now())
      ) {
        return { invoice: aberta, jaExistia: true };
      }

      const criada = await tx.platformInvoice.create({
        data: {
          storeId,
          planId: plan.id,
          planName: plan.name,
          amount: new Prisma.Decimal(plan.amount),
          periodDays: plan.periodDays,
          status: PaymentStatus.PENDING,
          method: BILLING_METHOD.PIX,
          dueAt: store.planDueAt,
          pixExpiresAt: expiraEm,
        },
      });
      return { invoice: criada, jaExistia: false };
    });

    if (jaExistia) {
      return this.cobrancaPixAberta(storeId);
    }

    const body = {
      transaction_amount: Number(plan.amount),
      description: `Mensalidade ${this.platformBrandName()} · Plano ${plan.name}`,
      payment_method_id: 'pix',
      // é por aqui que o webhook reencontra a fatura
      external_reference: invoice.id,
      date_of_expiration: expiraEm.toISOString(),
      payer: {
        email,
        first_name: (store.sellerLegalName || store.name).slice(0, 60),
        identification: pagador,
      },
      ...(buildPlatformBillingWebhookUrl(this.config)
        ? { notification_url: buildPlatformBillingWebhookUrl(this.config) }
        : {}),
    };

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: this.mpApiHeaders(token, { idempotencyKey: invoice.id }),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      /*
       * O corpo do erro do Mercado Pago devolve o payer de volta — e-mail e
       * documento do lojista. Log de erro não é lugar para dado pessoal, então
       * só o que ajuda a depurar sai daqui.
       */
      const motivo = await res
        .json()
        .then((j: { message?: string; error?: string }) =>
          String(j?.message || j?.error || '').slice(0, 160),
        )
        .catch(() => '');
      // fatura sem cobrança é lixo que bloquearia a próxima tentativa
      await this.prisma.platformInvoice.delete({ where: { id: invoice.id } });
      this.logger.error(
        `Falha ao gerar Pix da mensalidade (store=${storeId}) HTTP ${res.status}${motivo ? `: ${motivo}` : ''}`,
      );
      throw new BadRequestException(
        'Não foi possível gerar a cobrança Pix agora. Tente de novo em instantes.',
      );
    }

    const pagamento = (await res.json()) as {
      id?: number | string;
      point_of_interaction?: {
        transaction_data?: { qr_code?: string; qr_code_base64?: string };
      };
    };
    const dados = pagamento.point_of_interaction?.transaction_data;

    await this.prisma.platformInvoice.update({
      where: { id: invoice.id },
      data: {
        mpPaymentId: pagamento.id ? String(pagamento.id) : undefined,
        pixCopiaECola: dados?.qr_code ?? null,
        pixQrCodeBase64: dados?.qr_code_base64 ?? null,
      },
    });

    this.logger.log(
      `Cobrança Pix da mensalidade criada (store=${storeId}, invoice=${invoice.id}, plano=${plan.id})`,
    );

    /*
     * Sem esse aviso o lojista só descobre a cobrança se abrir o painel — e a
     * loja seria suspensa por uma conta que ele nunca viu. Sem await: e-mail
     * que falha não pode derrubar a cobrança já emitida.
     */
    void this.billingMail.notificar(invoice.id, 'pix_nova');

    return this.cobrancaPixAberta(storeId);
  }

  async cancelSubscription(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        mpPreapprovalId: true,
        mpSubscriptionStatus: true,
        planDueAt: true,
        planName: true,
      },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    if (!store.mpPreapprovalId || store.mpSubscriptionStatus === 'cancelled') {
      throw new BadRequestException(
        'Não há assinatura recorrente ativa para cancelar.',
      );
    }

    const token = await this.platformAccessToken();
    const res = await fetch(
      `https://api.mercadopago.com/preapproval/${store.mpPreapprovalId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      this.logger.warn(
        `MP cancel preapproval falhou id=${store.mpPreapprovalId} resp=${err.slice(0, 300)}`,
      );
      throw new BadRequestException(
        this.formatMpSubscriptionError(err, res.status),
      );
    }

    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        mpSubscriptionStatus: 'cancelled',
        // Mantém ACTIVE até o vencimento já pago; depois o gate de plano trata
      },
    });

    this.logger.log(
      `Assinatura cancelada store=${storeId} preapproval=${store.mpPreapprovalId}`,
    );

    return this.mySubscription(storeId);
  }

  async handleWebhook(payload: {
    type?: string;
    topic?: string;
    action?: string;
    data?: { id?: string };
    id?: string;
  }) {
    const type = (payload?.type || payload?.topic || '').toLowerCase();
    const id =
      payload?.data?.id ||
      (type.includes('payment') ||
      type.includes('preapproval') ||
      type.includes('subscription')
        ? payload.id
        : undefined);

    if (!id) {
      return { ok: true };
    }

    // Assinatura criada/autorizada/pausada
    if (
      type.includes('subscription_preapproval') ||
      type === 'preapproval' ||
      type.includes('subscription.preapproval')
    ) {
      return this.applyPreapproval(String(id));
    }

    // Cobrança recorrente mensal
    if (
      type.includes('subscription_authorized_payment') ||
      type.includes('subscription.authorized_payment') ||
      type === 'authorized_payment'
    ) {
      return this.applyAuthorizedPayment(String(id));
    }

    // Pagamento avulso / fatura da assinatura
    if (type === 'payment' || type.includes('payment')) {
      return this.applyPayment(String(id));
    }

    // Fallback: tenta preapproval e depois payment
    const asPre = await this.applyPreapproval(String(id));
    if (asPre && !('ignored' in asPre && asPre.ignored)) return asPre;
    return this.applyPayment(String(id));
  }

  async syncInvoice(invoiceId: string, storeId: string) {
    const invoice = await this.prisma.platformInvoice.findFirst({
      where: { id: invoiceId, storeId },
    });
    if (!invoice) throw new NotFoundException('Cobrança não encontrada');

    if (invoice.status === PaymentStatus.APPROVED) {
      // Garante loja ACTIVE + authorized mesmo se um sync antigo falhou a meio
      if (invoice.mpPreapprovalId) {
        await this.applyPreapproval(invoice.mpPreapprovalId);
      }
      return this.mySubscription(storeId);
    }

    if (invoice.mpPreapprovalId) {
      await this.applyPreapproval(invoice.mpPreapprovalId);
    }

    if (invoice.mpPaymentId) {
      await this.applyPayment(invoice.mpPaymentId);
    }

    // Ainda pending no MP? tenta de novo o preapproval (latência pós-checkout)
    const refreshed = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (
      refreshed &&
      refreshed.status !== PaymentStatus.APPROVED &&
      refreshed.mpPreapprovalId
    ) {
      await this.applyPreapproval(refreshed.mpPreapprovalId);
    }

    return this.mySubscription(storeId);
  }

  private async applyPreapproval(preapprovalId: string) {
    const { accessToken: token } = await this.resolvePlatformMpCredentials();
    if (!token) return { ok: false, reason: 'no_platform_token' };

    const res = await fetch(
      `https://api.mercadopago.com/preapproval/${preapprovalId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { ok: false, reason: 'preapproval_fetch_failed' };

    const pre = (await res.json()) as MpPreapproval;
    const invoiceId = pre.external_reference;
    if (!invoiceId) return { ok: true, ignored: true };

    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return { ok: true, ignored: true };

    const status = (pre.status || '').toLowerCase();

    const store = await this.prisma.store.findUnique({
      where: { id: invoice.storeId },
      select: {
        mpPreapprovalId: true,
        mpSubscriptionStatus: true,
        status: true,
        planDueAt: true,
      },
    });
    if (!store) return { ok: true, ignored: true };

    const isCurrent =
      !store.mpPreapprovalId || store.mpPreapprovalId === pre.id;
    const alreadyAuthorized = store.mpSubscriptionStatus === 'authorized';

    // Preapproval antigo/cancelado NÃO pode sobrescrever assinatura ativa atual
    if (!isCurrent && status !== 'authorized') {
      this.logger.warn(
        `MP preapproval ignorado id=${pre.id} status=${status} ` +
          `(loja usa ${store.mpPreapprovalId})`,
      );
      return { ok: true, ignored: true, status, reason: 'stale_preapproval' };
    }

    if (status === 'cancelled' || status === 'paused') {
      if (isCurrent && store.mpPreapprovalId === pre.id) {
        const dueOk =
          store.planDueAt != null && store.planDueAt.getTime() > Date.now();
        await this.prisma.store.update({
          where: { id: invoice.storeId },
          data: {
            mpSubscriptionStatus: status,
            // Só marca atraso se o período pago já acabou
            ...(status === 'cancelled' && !dueOk
              ? { status: StoreStatus.PAST_DUE }
              : {}),
          },
        });
      }
      return { ok: true, invoiceId: invoice.id, status };
    }

    if (status === 'pending' && alreadyAuthorized && isCurrent) {
      // Não rebaixa authorized → pending (latência / sync prematuro)
      return { ok: true, invoiceId: invoice.id, status, kept: 'authorized' };
    }

    await this.prisma.store.update({
      where: { id: invoice.storeId },
      data: {
        mpPreapprovalId: pre.id,
        mpSubscriptionStatus: status || null,
      },
    });

    if (status === 'authorized') {
      await this.activateStoreFromInvoice(invoice.id, {
        markPaid: invoice.status !== PaymentStatus.APPROVED,
        paymentId: null,
      });
      return { ok: true, invoiceId: invoice.id, authorized: true };
    }

    return { ok: true, invoiceId: invoice.id, status };
  }

  private async applyAuthorizedPayment(authorizedPaymentId: string) {
    const { accessToken: token } = await this.resolvePlatformMpCredentials();
    if (!token) return { ok: false, reason: 'no_platform_token' };

    const res = await fetch(
      `https://api.mercadopago.com/authorized_payments/${authorizedPaymentId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok)
      return { ok: false, reason: 'authorized_payment_fetch_failed' };

    const ap = (await res.json()) as MpAuthorizedPayment;
    const paymentStatus = (ap.payment?.status || ap.status || '').toLowerCase();

    if (paymentStatus !== 'approved' && paymentStatus !== 'processed') {
      return { ok: true, authorizedPaymentId, status: paymentStatus };
    }

    let invoice =
      (ap.external_reference
        ? await this.prisma.platformInvoice.findUnique({
            where: { id: ap.external_reference },
          })
        : null) ||
      (ap.preapproval_id
        ? await this.prisma.platformInvoice.findFirst({
            where: { mpPreapprovalId: ap.preapproval_id },
            orderBy: { createdAt: 'desc' },
          })
        : null);

    if (!invoice && ap.preapproval_id) {
      const store = await this.prisma.store.findFirst({
        where: { mpPreapprovalId: ap.preapproval_id },
      });
      if (store) {
        const plan = (await this.listPlans()).find(
          (p) => p.id === store.planName,
        );
        invoice = await this.prisma.platformInvoice.create({
          data: {
            storeId: store.id,
            planId: store.planName || 'mensal',
            planName: plan?.name || store.planName || 'Mensal',
            amount: new Prisma.Decimal(
              plan?.amount ?? Number(store.monthlyFee ?? 0),
            ),
            periodDays: plan?.periodDays ?? 30,
            status: PaymentStatus.PENDING,
            mpPreapprovalId: ap.preapproval_id,
          },
        });
      }
    }

    if (!invoice) return { ok: true, ignored: true };

    const mpPaymentId = ap.payment?.id
      ? String(ap.payment.id)
      : `ap-${authorizedPaymentId}`;

    const existing = await this.prisma.platformInvoice.findFirst({
      where: { mpPaymentId },
    });
    if (existing?.status === PaymentStatus.APPROVED) {
      return { ok: true, already: true, invoiceId: existing.id };
    }

    // Cobrança de ciclo novo: se a invoice atual já estava paga, cria outra
    if (invoice.status === PaymentStatus.APPROVED && invoice.mpPaymentId) {
      invoice = await this.prisma.platformInvoice.create({
        data: {
          storeId: invoice.storeId,
          planId: invoice.planId,
          planName: invoice.planName,
          amount: invoice.amount,
          periodDays: invoice.periodDays,
          status: PaymentStatus.PENDING,
          mpPreapprovalId: invoice.mpPreapprovalId,
        },
      });
    }

    await this.activateStoreFromInvoice(invoice.id, {
      markPaid: true,
      paymentId: mpPaymentId,
    });

    return { ok: true, invoiceId: invoice.id, approved: true };
  }

  private async applyPayment(paymentId: string) {
    const { accessToken: token } = await this.resolvePlatformMpCredentials();
    if (!token) {
      return { ok: false, reason: 'no_platform_token' };
    }

    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      return { ok: false, reason: 'payment_fetch_failed' };
    }

    const payment = (await res.json()) as {
      id: number;
      status: string;
      external_reference?: string;
      metadata?: { invoice_id?: string; type?: string };
      point_of_interaction?: {
        transaction_data?: { subscription_id?: string };
      };
    };

    const invoiceId =
      payment.external_reference || payment.metadata?.invoice_id || undefined;

    if (!invoiceId) {
      return { ok: true, ignored: true };
    }

    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return { ok: true, ignored: true };
    }

    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          mpPaymentId: String(payment.id),
          status: PaymentStatus.REJECTED,
        },
      });
      return { ok: true, invoiceId: invoice.id, approved: false };
    }

    if (payment.status === 'pending' || payment.status === 'in_process') {
      await this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          mpPaymentId: String(payment.id),
          status: PaymentStatus.PENDING,
        },
      });
      return { ok: true, invoiceId: invoice.id, approved: false };
    }

    if (payment.status !== 'approved') {
      return { ok: true, invoiceId: invoice.id, approved: false };
    }

    if (
      invoice.status === PaymentStatus.APPROVED &&
      invoice.mpPaymentId === String(payment.id)
    ) {
      return { ok: true, invoiceId: invoice.id, approved: true, already: true };
    }

    await this.activateStoreFromInvoice(invoice.id, {
      markPaid: true,
      paymentId: String(payment.id),
    });

    return { ok: true, invoiceId: invoice.id, approved: true };
  }

  private async activateStoreFromInvoice(
    invoiceId: string,
    opts: { markPaid: boolean; paymentId: string | null },
  ) {
    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return;

    await this.prisma.$transaction(async (tx) => {
      if (opts.markPaid && invoice.status !== PaymentStatus.APPROVED) {
        await tx.platformInvoice.update({
          where: { id: invoice.id },
          data: {
            ...(opts.paymentId ? { mpPaymentId: opts.paymentId } : {}),
            status: PaymentStatus.APPROVED,
            paidAt: new Date(),
          },
        });
      } else if (opts.paymentId) {
        await tx.platformInvoice.update({
          where: { id: invoice.id },
          data: { mpPaymentId: opts.paymentId },
        });
      }

      const store = await tx.store.findUnique({
        where: { id: invoice.storeId },
        select: { planDueAt: true, mpSubscriptionStatus: true },
      });

      const base =
        store?.planDueAt && store.planDueAt.getTime() > Date.now()
          ? store.planDueAt
          : new Date();
      const nextDue = new Date(
        base.getTime() + invoice.periodDays * 24 * 60 * 60 * 1000,
      );

      const months = Math.max(1, Math.round(invoice.periodDays / 30));
      const monthlyEquiv = Number(invoice.amount) / months;

      await tx.store.update({
        where: { id: invoice.storeId },
        data: {
          status: StoreStatus.ACTIVE,
          planName: invoice.planId,
          monthlyFee: new Prisma.Decimal(Number(monthlyEquiv.toFixed(2))),
          planDueAt: nextDue,
          // Sempre autorizada ao ativar — pending residual quebrava recurringActive
          mpSubscriptionStatus: 'authorized',
        },
      });
    });

    // confirma para o lojista, com o novo vencimento já calculado
    if (opts.markPaid) {
      void this.billingMail.notificar(invoice.id, 'paga');
    }
  }

  /**
   * Pós-pagamento (back_url do MP): consulta preapproval e ativa a loja.
   * Não depende de webhook (em teste o MP quase não notifica Assinaturas).
   */
  async syncAfterMpReturn(invoiceId?: string) {
    const id = invoiceId?.trim();
    if (!id) return { ok: false as const, reason: 'no_invoice' };

    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id },
    });
    if (!invoice) return { ok: false as const, reason: 'invoice_not_found' };

    if (invoice.mpPreapprovalId) {
      const result = await this.applyPreapproval(invoice.mpPreapprovalId);
      this.logger.log(
        `MP return sync invoice=${id} preapproval=${invoice.mpPreapprovalId} ` +
          `result=${JSON.stringify(result)}`,
      );
      return { ok: true as const, result };
    }

    return { ok: true as const, ignored: true as const };
  }
}
