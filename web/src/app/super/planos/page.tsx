'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

type Plan = {
  id: string;
  name: string;
  description: string;
  amount: number;
  periodDays: number;
  badge?: string;
  highlight?: boolean;
  features?: string[];
  maxProducts?: number | null;
  maxUsers?: number | null;
  nfeIncluded?: boolean;
  feeBps?: number;
  customDomainIncluded?: boolean;
  active: boolean;
};

const emptyForm = {
  name: '',
  description: '',
  amount: '',
  periodDays: '30',
  badge: '',
  highlight: false,
  features: '',
  /** Vazio = sem limite. */
  maxProducts: '',
  maxUsers: '',
  nfeIncluded: true,
  /** Em %, como o Super Admin digita (ex.: "2" ou "0,5"). */
  feePercent: '',
  customDomainIncluded: true,
};

const pct = (bps: number) => `${String(bps / 100).replace('.', ',')}%`;

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SuperPlanosPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [trialDays, setTrialDays] = useState('');
  const [trialSaving, setTrialSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [plansData, general] = await Promise.all([
        api<Plan[]>('/billing/platform/plans', { token }),
        api<{ trialDays: number }>('/billing/platform/general', { token }),
      ]);
      setPlans(plansData);
      setTrialDays(String(general.trialDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveTrialDays(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setTrialSaving(true);
    setError('');
    setOk('');
    try {
      await api('/billing/platform/general', {
        method: 'PATCH',
        token,
        body: { trialDays: Number(trialDays) },
      });
      setOk('Duração do teste grátis atualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setTrialSaving(false);
    }
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      description: plan.description || '',
      amount: String(plan.amount),
      periodDays: String(plan.periodDays),
      badge: plan.badge || '',
      highlight: plan.highlight || false,
      features: (plan.features || []).join('\n'),
      maxProducts: plan.maxProducts ? String(plan.maxProducts) : '',
      maxUsers: plan.maxUsers ? String(plan.maxUsers) : '',
      nfeIncluded: plan.nfeIncluded ?? true,
      feePercent: plan.feeBps ? String(plan.feeBps / 100).replace('.', ',') : '',
      customDomainIncluded: plan.customDomainIncluded ?? true,
    });
    setShowForm(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    setOk('');
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        amount: Number(form.amount),
        periodDays: Number(form.periodDays) || 30,
        badge: form.badge.trim() || undefined,
        highlight: form.highlight,
        features: form.features
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean),
        // 0 = sem limite (a API grava null)
        maxProducts: Number(form.maxProducts) || 0,
        maxUsers: Number(form.maxUsers) || 0,
        nfeIncluded: form.nfeIncluded,
        // "2" → 200 pontos-base; vazio = sem taxa
        feeBps: Math.round(
          (Number(form.feePercent.replace(',', '.')) || 0) * 100,
        ),
        customDomainIncluded: form.customDomainIncluded,
      };
      if (editingId) {
        await api(`/billing/platform/plans/${editingId}`, {
          method: 'PATCH',
          token,
          body,
        });
        setOk('Plano atualizado.');
      } else {
        await api('/billing/platform/plans', { method: 'POST', token, body });
        setOk('Plano criado.');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar plano');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan: Plan) {
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await api(`/billing/platform/plans/${plan.id}`, {
        method: 'PATCH',
        token,
        body: { active: !plan.active },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar');
    }
  }

  async function removePlan(plan: Plan) {
    const ok = await confirm({
      title: `Apagar o plano "${plan.name}"?`,
      message:
        'Só dá para apagar plano que nenhuma loja usa. Se tiver loja nele, use "Desativar": ele some da lista para quem for contratar e quem já usa continua.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await api(`/billing/platform/plans/${plan.id}`, { method: 'DELETE', token });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao apagar');
    }
  }

  async function confirmarAtivacao(plan: Plan) {
    if (plan.active) {
      const sim = await confirm({
        title: `Desativar o plano "${plan.name}"?`,
        message:
          'Ele some da tela de planos para quem for contratar. Lojas que já usam continuam no plano normalmente.',
        confirmLabel: 'Desativar',
      });
      if (!sim) return;
    }
    await toggleActive(plan);
  }

  function startCreateLimpo() {
    setError('');
    setOk('');
    startCreate();
  }

  function startEditLimpo(plan: Plan) {
    setError('');
    setOk('');
    startEdit(plan);
  }

  const mensais = plans.filter((p) => p.periodDays < 360);
  const anuais = plans.filter((p) => p.periodDays >= 360);
  const taxaForm = Number(form.feePercent.replace(',', '.')) || 0;

  function cartao(plan: Plan) {
    const anual = plan.periodDays >= 360;
    const itens: { texto: string; ok: boolean }[] = [
      {
        texto: plan.feeBps
          ? `${pct(plan.feeBps)} por venda`
          : 'Sem taxa por venda',
        ok: true,
      },
      {
        texto: plan.maxProducts
          ? `Até ${plan.maxProducts} produtos`
          : 'Produtos ilimitados',
        ok: true,
      },
      {
        texto: !plan.maxUsers
          ? 'Equipe sem limite'
          : plan.maxUsers === 1
            ? 'Só o dono no painel'
            : `Até ${plan.maxUsers} pessoas no painel`,
        ok: true,
      },
      { texto: 'Nota fiscal', ok: plan.nfeIncluded !== false },
      { texto: 'Domínio próprio', ok: plan.customDomainIncluded !== false },
    ];
    return (
      <li
        key={plan.id}
        className={`flex flex-col border bg-white ${
          plan.highlight ? 'border-ink' : 'border-line'
        } ${plan.active ? '' : 'opacity-60'}`}
      >
        <div className="flex-1 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-bold">{plan.name}</h3>
            {plan.highlight ? (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
                Destaque
              </span>
            ) : null}
            {plan.badge ? (
              <span className="rounded-full bg-[#eef0f4] px-2 py-0.5 text-[11px] font-bold text-muted">
                {plan.badge}
              </span>
            ) : null}
            {!plan.active ? (
              <span className="rounded-full bg-[#f3e8e8] px-2 py-0.5 text-[11px] font-bold text-accent">
                Desativado
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight">
            {plan.amount > 0 ? money(plan.amount) : 'Grátis'}
            {plan.amount > 0 ? (
              <span className="text-sm font-normal text-muted">
                {anual ? '/ano' : '/mês'}
              </span>
            ) : null}
          </p>
          {plan.description ? (
            <p className="mt-1 text-xs text-muted">{plan.description}</p>
          ) : null}
          <ul className="mt-3 space-y-1 text-sm">
            {itens.map((i) => (
              <li
                key={i.texto}
                className={`flex items-center gap-2 ${i.ok ? '' : 'text-muted line-through'}`}
              >
                <span
                  aria-hidden
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold ${
                    i.ok ? 'bg-[#e3f4ea] text-[#1b7f45]' : 'bg-[#eef0f4] text-muted'
                  }`}
                >
                  {i.ok ? '✓' : '–'}
                </span>
                {i.texto}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-1.5 border-t border-line px-3 py-2.5">
          <button
            type="button"
            className="btn btn-ghost px-2.5 py-1.5 text-xs"
            onClick={() => startEditLimpo(plan)}
          >
            Editar
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5 py-1.5 text-xs"
            onClick={() => void confirmarAtivacao(plan)}
          >
            {plan.active ? 'Desativar' : 'Ativar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost ml-auto px-2.5 py-1.5 text-xs text-accent"
            onClick={() => void removePlan(plan)}
          >
            Apagar
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {confirmDialog}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Planos</h1>
          <p className="text-sm text-muted">
            O que o lojista escolhe em Configurações → Planos. Preço, taxa e
            limites mudam aqui, sem programação.
          </p>
        </div>
        <button type="button" className="btn btn-accent" onClick={startCreateLimpo}>
          + Novo plano
        </button>
      </div>

      {error && !showForm ? (
        <p className="border border-[#f3b3b3] bg-[#fef2f2] px-3 py-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="border border-[#bfe3c8] bg-[#f0fbf3] px-3 py-2 text-sm text-[#166534]">
          {ok}
        </p>
      ) : null}

      <form
        onSubmit={saveTrialDays}
        className="flex flex-wrap items-end gap-3 border border-line bg-white p-4"
      >
        <div>
          <label className="label" htmlFor="dias-teste">
            Dias de teste grátis
          </label>
          <input
            id="dias-teste"
            className="field w-32"
            type="number"
            min={1}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-ghost" disabled={trialSaving}>
          {trialSaving ? 'Salvando…' : 'Salvar'}
        </button>
        <p className="w-full text-[11px] text-muted">
          Vale para lojas criadas a partir de agora. Não muda o prazo de quem já
          está em teste.
        </p>
      </form>

      {loading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : plans.length === 0 ? (
        <p className="border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-muted">
          Nenhum plano cadastrado. Crie o primeiro em &quot;+ Novo plano&quot;.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              Mensais ({mensais.length})
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {mensais.map(cartao)}
            </ul>
          </section>
          {anuais.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
                Anuais ({anuais.length})
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {anuais.map(cartao)}
              </ul>
            </section>
          ) : null}
          <p className="text-xs text-muted">
            Os limites valem de verdade: a loja não cadastra produto acima do
            limite nem emite nota se o plano não incluir. No teste grátis os
            recursos ficam liberados. Toda mudança de preço ou taxa fica
            registrada com quem mudou.
          </p>
        </>
      )}

      {showForm ? (
        <Modal
          title={editingId ? `Editar plano ${form.name}` : 'Novo plano'}
          hint={
            editingId
              ? 'Mudança de preço ou taxa vale para as próximas cobranças e vendas.'
              : undefined
          }
          erro={error}
          largura="lg"
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={onSubmit} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                Preço
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="label" htmlFor="plano-nome">
                    Nome
                  </label>
                  <input
                    id="plano-nome"
                    className="field"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="plano-preco">
                    Preço (R$)
                  </label>
                  <input
                    id="plano-preco"
                    className="field"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0 = grátis"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="plano-periodo">
                    Cobrança
                  </label>
                  <select
                    id="plano-periodo"
                    className="field"
                    value={form.periodDays}
                    onChange={(e) =>
                      setForm({ ...form, periodDays: e.target.value })
                    }
                  >
                    <option value="30">Mensal (30 dias)</option>
                    <option value="365">Anual (365 dias)</option>
                    {form.periodDays !== '30' && form.periodDays !== '365' ? (
                      <option value={form.periodDays}>
                        {form.periodDays} dias
                      </option>
                    ) : null}
                  </select>
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                Taxa por venda
              </legend>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor="plan-fee">
                    Porcentagem (%)
                  </label>
                  <input
                    id="plan-fee"
                    className="field w-36"
                    inputMode="decimal"
                    placeholder="Ex.: 2 ou 0,5"
                    value={form.feePercent}
                    onChange={(e) =>
                      setForm({ ...form, feePercent: e.target.value })
                    }
                  />
                </div>
                <p className="pb-2 text-sm text-muted">
                  {taxaForm > 0
                    ? `Numa venda de R$ 100 em produtos, a Vendira recebe ${money(taxaForm)}. O frete não entra.`
                    : 'Vazio = sem taxa por venda.'}
                </p>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                Limites
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="plan-max-products">
                    Limite de produtos
                  </label>
                  <input
                    id="plan-max-products"
                    className="field"
                    type="number"
                    min={0}
                    placeholder="Vazio = sem limite"
                    value={form.maxProducts}
                    onChange={(e) =>
                      setForm({ ...form, maxProducts: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="plan-max-users">
                    Pessoas na equipe
                  </label>
                  <input
                    id="plan-max-users"
                    className="field"
                    type="number"
                    min={0}
                    placeholder="Vazio = sem limite"
                    value={form.maxUsers}
                    onChange={(e) =>
                      setForm({ ...form, maxUsers: e.target.value })
                    }
                  />
                  <p className="mt-1 text-[11px] text-muted">Contando o dono</p>
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.nfeIncluded}
                    onChange={(e) =>
                      setForm({ ...form, nfeIncluded: e.target.checked })
                    }
                  />
                  Nota fiscal (NF-e/NFC-e)
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.customDomainIncluded}
                    onChange={(e) =>
                      setForm({ ...form, customDomainIncluded: e.target.checked })
                    }
                  />
                  Domínio próprio
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                Como aparece para o lojista
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="plano-descricao">
                    Descrição curta
                  </label>
                  <input
                    id="plano-descricao"
                    className="field"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="plano-selo">
                    Selo (opcional)
                  </label>
                  <input
                    id="plano-selo"
                    className="field"
                    placeholder="Ex.: Mais escolhido"
                    value={form.badge}
                    onChange={(e) => setForm({ ...form, badge: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="plano-recursos">
                  Recursos (um por linha)
                </label>
                <textarea
                  id="plano-recursos"
                  className="field"
                  rows={4}
                  value={form.features}
                  onChange={(e) =>
                    setForm({ ...form, features: e.target.value })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.highlight}
                  onChange={(e) =>
                    setForm({ ...form, highlight: e.target.checked })
                  }
                />
                Destacar este plano (aparece como recomendado)
              </label>
            </fieldset>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" className="btn btn-ghost" data-modal-cancel>
                Cancelar
              </button>
              <button className="btn btn-accent" disabled={saving}>
                {saving
                  ? 'Salvando…'
                  : editingId
                    ? 'Salvar alterações'
                    : 'Criar plano'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
