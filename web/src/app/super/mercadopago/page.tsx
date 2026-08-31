'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { PlatformMpSettings, SuperSection } from '../_lib';

type WebhookCheck = {
  ok: boolean;
  motivo: string | null;
  detalhe: string;
  url?: string;
  tunel?: boolean;
  webhookPedidos: string | null;
  webhookMensalidade: string | null;
};

export default function SuperMercadoPagoPage() {
  const [settings, setSettings] = useState<PlatformMpSettings | null>(null);
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpUseSandbox, setMpUseSandbox] = useState(true);
  const [mpTestPayerEmail, setMpTestPayerEmail] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [webhook, setWebhook] = useState<WebhookCheck | null>(null);
  const [checando, setChecando] = useState(false);

  async function load() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const data = await api<PlatformMpSettings>(
        '/billing/platform/mercadopago',
        { token },
      );
      setSettings(data);
      setMpUseSandbox(data.mpUseSandbox !== false);
      setMpTestPayerEmail(data.mpTestPayerEmail || '');
      setError('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar Mercado Pago',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    setOk('');
    try {
      const body: Record<string, unknown> = {
        mpUseSandbox,
        mpTestPayerEmail: mpTestPayerEmail.trim() || null,
      };
      if (mpAccessToken.trim()) body.mpAccessToken = mpAccessToken.trim();
      if (mpPublicKey.trim()) body.mpPublicKey = mpPublicKey.trim();

      const updated = await api<PlatformMpSettings>(
        '/billing/platform/mercadopago',
        { method: 'PATCH', token, body },
      );
      setSettings(updated);
      setMpAccessToken('');
      setMpPublicKey('');
      setMpUseSandbox(updated.mpUseSandbox !== false);
      setMpTestPayerEmail(updated.mpTestPayerEmail || '');
      setOk(
        updated.mpAccessTokenHint
          ? `Salvo. Token: ${updated.mpAccessTokenHint}`
          : 'Configuração salva.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  /*
   * PUBLIC_URL errada não gera erro em lugar nenhum: o cliente paga e o
   * pedido fica parado. Por isso o teste é ativo — a API tenta alcançar a
   * própria URL pública de fora.
   */
  async function checarWebhook() {
    const token = getToken();
    if (!token) return;
    setChecando(true);
    try {
      const r = await api<WebhookCheck>('/billing/platform/webhook-check', {
        token,
      });
      setWebhook(r);
    } catch (e) {
      setWebhook({
        ok: false,
        motivo: 'erro',
        detalhe: e instanceof Error ? e.message : 'Falha ao verificar',
        webhookPedidos: null,
        webhookMensalidade: null,
      });
    } finally {
      setChecando(false);
    }
  }

  async function onTest() {
    const token = getToken();
    if (!token) return;
    setTesting(true);
    setError('');
    setOk('');
    try {
      const result = await api<{
        ok: boolean;
        email?: string;
        nickname?: string;
        siteId?: string;
      }>('/billing/platform/mercadopago/test', { method: 'POST', token });
      setOk(
        `Conexão OK${result.email ? ` · ${result.email}` : ''}${
          result.nickname ? ` (${result.nickname})` : ''
        }${result.siteId ? ` · site ${result.siteId}` : ''}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no teste');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Carregando Mercado Pago…</p>;
  }

  return (
    <SuperSection
      title="Mercado Pago"
      summary="Credenciais da plataforma — recebe a mensalidade de todas as lojas"
    >
      {error ? (
        <p className="border border-[#f5c2c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="border border-[#b7e4c7] bg-[#f0faf4] px-4 py-3 text-sm text-[#1b8f4a]">
          {ok}
        </p>
      ) : null}

      {settings ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="border border-[#d9dde3] bg-white px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Status
            </p>
            <p className="mt-1 text-sm font-bold">
              {settings.paymentsEnabled ? 'Habilitado' : 'Sem token'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Fonte: {settings.source}
            </p>
          </div>
          <div className="border border-[#d9dde3] bg-white px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Ambiente
            </p>
            <p className="mt-1 text-sm font-bold">
              {settings.mpUseSandbox ? 'Sandbox / teste' : 'Produção'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {settings.liveMode === true
                ? 'Live'
                : settings.liveMode === false
                  ? 'Não live'
                  : '—'}
            </p>
          </div>
          <div className="border border-[#d9dde3] bg-white px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Access Token
            </p>
            <p className="mt-1 break-all text-xs font-semibold">
              {settings.mpAccessTokenHint || 'Não configurado'}
            </p>
          </div>
          <div className="border border-[#d9dde3] bg-white px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Public Key
            </p>
            <p className="mt-1 break-all text-xs font-semibold">
              {settings.mpPublicKeyHint || 'Não configurada'}
            </p>
          </div>
        </div>
      ) : null}

      {settings?.subscriptionsHint ? (
        <p className="border border-[#ffe8b3] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5a00]">
          {settings.subscriptionsHint}
        </p>
      ) : null}

      {/*
        Diagnóstico da URL pública. Fica antes das credenciais de propósito:
        token certo com PUBLIC_URL errada é o cenário em que tudo parece
        configurado e nenhum pagamento é confirmado.
      */}
      <div className="border border-[#d9dde3] bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              URL pública e webhooks
            </p>
            <p className="mt-0.5 text-sm">
              Sem uma URL que o Mercado Pago alcance, o cliente paga e o pedido
              fica parado em “aguardando pagamento”.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            disabled={checando}
            onClick={() => void checarWebhook()}
          >
            {checando ? 'Verificando…' : 'Testar URL pública'}
          </button>
        </div>

        {webhook ? (
          <div
            className={`mt-3 border-l-2 px-3 py-2 text-sm ${
              webhook.ok && !webhook.tunel
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
                : webhook.ok
                  ? 'border-amber-400 bg-amber-50 text-amber-950'
                  : 'border-rose-500 bg-rose-50 text-rose-950'
            }`}
          >
            <p className="font-semibold">
              {webhook.ok && !webhook.tunel
                ? 'Webhooks conseguem chegar'
                : webhook.ok
                  ? 'Funciona, mas é túnel de desenvolvimento'
                  : 'Webhooks não estão chegando'}
            </p>
            <p className="mt-0.5 leading-snug">{webhook.detalhe}</p>
          </div>
        ) : null}

        {webhook?.webhookPedidos ? (
          <div className="mt-3 space-y-2 text-xs">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Pedidos das lojas
              </p>
              <code className="mt-0.5 block break-all">
                {webhook.webhookPedidos}
              </code>
              <p className="mt-0.5 text-[11px] text-muted">
                Enviada em cada cobrança — o lojista não precisa cadastrar nada
                na conta dele.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Mensalidade da plataforma
              </p>
              <code className="mt-0.5 block break-all">
                {webhook.webhookMensalidade}
              </code>
              <p className="mt-0.5 text-[11px] text-muted">
                Esta você cadastra uma vez, na sua conta do Mercado Pago.
              </p>
            </div>
          </div>
        ) : settings?.billingWebhookUrl ? (
          <div className="mt-3 text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Webhook de billing
            </p>
            <code className="mt-0.5 block break-all">
              {settings.billingWebhookUrl}
            </code>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={onSave}
        className="space-y-3 border border-[#d9dde3] bg-white p-4"
      >
        <div>
          <label className="label">Access Token</label>
          <input
            className="field font-mono text-sm"
            type="password"
            autoComplete="off"
            value={mpAccessToken}
            onChange={(e) => setMpAccessToken(e.target.value)}
            placeholder={
              settings?.mpAccessTokenSet
                ? 'Deixe em branco para manter o atual'
                : 'APP_USR-… ou TEST-…'
            }
            required={!settings?.mpAccessTokenSet}
          />
        </div>
        <div>
          <label className="label">Public Key</label>
          <input
            className="field font-mono text-sm"
            autoComplete="off"
            value={mpPublicKey}
            onChange={(e) => setMpPublicKey(e.target.value)}
            placeholder={
              settings?.mpPublicKeySet
                ? 'Deixe em branco para manter a atual'
                : 'APP_USR-… ou TEST-…'
            }
            required={!settings?.mpPublicKeySet}
          />
        </div>
        <div>
          <label className="label">Ambiente</label>
          <select
            className="field"
            value={mpUseSandbox ? 'sandbox' : 'prod'}
            onChange={(e) => setMpUseSandbox(e.target.value === 'sandbox')}
          >
            <option value="sandbox">Sandbox (teste)</option>
            <option value="prod">Produção</option>
          </select>
        </div>
        <div>
          <label className="label">Comprador de teste (e-mail)</label>
          <input
            className="field"
            value={mpTestPayerEmail}
            onChange={(e) => setMpTestPayerEmail(e.target.value)}
            placeholder="test_user_…@testuser.com ou TESTUSER…"
          />
          <p className="mt-1 text-[11px] text-muted">
            Usado no checkout de assinaturas em sandbox. Aceita username
            TESTUSER.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" className="btn btn-accent" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={testing || !settings?.mpAccessTokenSet}
            onClick={() => void onTest()}
          >
            {testing ? 'Testando…' : 'Testar conexão'}
          </button>
        </div>
      </form>
    </SuperSection>
  );
}
