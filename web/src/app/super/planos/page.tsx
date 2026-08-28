'use client';

import { FormEvent, useEffect, useState } from 'react';
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
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SuperPlanosPage() {
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
    if (!confirm(`Apagar o plano "${plan.name}"? Não afeta lojas que já usam ele.`)) {
      return;
    }
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

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-bold">Planos</h1>
        <p className="text-sm text-muted">
          O que aparece para o lojista escolher em Configurações → Planos e
          quanto tempo dura o teste grátis no cadastro.
        </p>
      </div>

      {error ? (
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
          <label className="label">Dias de teste grátis</label>
          <input
            className="field w-32"
            type="number"
            min={1}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-accent" disabled={trialSaving}>
          {trialSaving ? 'Salvando...' : 'Salvar'}
        </button>
        <p className="w-full text-[11px] text-muted">
          Vale só para lojas criadas a partir de agora. Não muda o prazo de
          quem já está em teste.
        </p>
      </form>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
          Planos cadastrados
        </h2>
        <button type="button" className="btn btn-ghost" onClick={startCreate}>
          + Novo plano
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={`border bg-white p-3 ${plan.active ? 'border-line' : 'border-line opacity-60'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{plan.name}</span>
                    {plan.highlight ? (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">
                        Destaque
                      </span>
                    ) : null}
                    {!plan.active ? (
                      <span className="rounded-full bg-[#eee] px-2 py-0.5 text-[10px] font-bold text-muted">
                        Desativado
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {money(plan.amount)} / {plan.periodDays} dias
                  </p>
                  {plan.description ? (
                    <p className="mt-1 text-xs text-muted">{plan.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost py-1.5 text-xs"
                    onClick={() => startEdit(plan)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost py-1.5 text-xs"
                    onClick={() => toggleActive(plan)}
                  >
                    {plan.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost py-1.5 text-xs text-accent"
                    onClick={() => removePlan(plan)}
                  >
                    Apagar
                  </button>
                </div>
              </div>
            </li>
          ))}
          {plans.length === 0 ? (
            <p className="text-sm text-muted">Nenhum plano cadastrado.</p>
          ) : null}
        </ul>
      )}

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="space-y-3 border border-line bg-white p-4"
        >
          <h3 className="text-sm font-bold">
            {editingId ? 'Editar plano' : 'Novo plano'}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Nome</label>
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Preço (R$/mês)</label>
              <input
                className="field"
                type="number"
                step="0.01"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Período (dias)</label>
              <input
                className="field"
                type="number"
                min={1}
                value={form.periodDays}
                onChange={(e) => setForm({ ...form, periodDays: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Selo (opcional)</label>
              <input
                className="field"
                placeholder="Ex.: Mais escolhido"
                value={form.badge}
                onChange={(e) => setForm({ ...form, badge: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input
              className="field"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Recursos (um por linha)</label>
            <textarea
              className="field"
              rows={4}
              value={form.features}
              onChange={(e) => setForm({ ...form, features: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.highlight}
              onChange={(e) => setForm({ ...form, highlight: e.target.checked })}
            />
            Destacar este plano (aparece marcado como recomendado)
          </label>
          <div className="flex gap-2">
            <button className="btn btn-accent" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar plano'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
