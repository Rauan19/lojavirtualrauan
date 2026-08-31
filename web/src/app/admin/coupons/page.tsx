'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Coupon = {
  id: string;
  code: string;
  description?: string | null;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  value: string;
  minSubtotal?: string | null;
  maxUses?: number | null;
  maxPerCustomer?: number | null;
  usedCount: number;
  endsAt?: string | null;
  active: boolean;
  showOnStorefront: boolean;
};

const empty = {
  code: '',
  description: '',
  type: 'PERCENT' as 'PERCENT' | 'FIXED' | 'FREE_SHIPPING',
  value: '',
  minSubtotal: '',
  maxUses: '',
  maxPerCustomer: '',
  endsAt: '',
  showOnStorefront: false,
};

export default function AdminCouponsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<Coupon[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  async function load() {
    const { token, storeSlug } = auth();
    if (!token) return;
    const list = await api<Coupon[]>('/admin/coupons', { token, storeSlug });
    setItems(list);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      await api('/admin/coupons', {
        method: 'POST',
        token,
        storeSlug,
        body: {
          code: form.code,
          description: form.description || undefined,
          type: form.type,
          value: form.type === 'FREE_SHIPPING' ? 0 : Number(form.value),
          minSubtotal: form.minSubtotal ? Number(form.minSubtotal) : undefined,
          maxUses: form.maxUses ? Number(form.maxUses) : undefined,
          maxPerCustomer: form.maxPerCustomer
            ? Number(form.maxPerCustomer)
            : undefined,
          endsAt: form.endsAt || undefined,
          showOnStorefront: form.showOnStorefront,
        },
      });
      setForm(empty);
      setMessage('Cupom criado');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(coupon: Coupon) {
    const { token, storeSlug } = auth();
    await api(`/admin/coupons/${coupon.id}`, {
      method: 'PATCH',
      token,
      storeSlug,
      body: { active: !coupon.active },
    });
    await load();
  }

  async function toggleBanner(coupon: Coupon) {
    const { token, storeSlug } = auth();
    await api(`/admin/coupons/${coupon.id}`, {
      method: 'PATCH',
      token,
      storeSlug,
      body: { showOnStorefront: !coupon.showOnStorefront },
    });
    await load();
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: 'Excluir cupom?',
      message: 'O cupom deixa de valer na loja. Essa ação não tem volta.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    await api(`/admin/coupons/${id}`, { method: 'DELETE', token, storeSlug });
    await load();
  }

  function label(c: Coupon) {
    if (c.type === 'FREE_SHIPPING') return 'Frete grátis';
    if (c.type === 'PERCENT') return `${Number(c.value)}% off`;
    return `${money(c.value)} off`;
  }

  return (
    <div className="admin-page">
      <div>
        <h1>Cupons</h1>
        <p className="text-sm text-muted">
          Códigos de desconto pro cliente no checkout.
        </p>
      </div>

      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}

      <form onSubmit={onCreate} className="card form-grid md:grid-cols-2">
        <h2 className="text-sm font-bold md:col-span-2">Novo cupom</h2>
        <div>
          <label className="label">Código</label>
          <input
            className="field uppercase"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="EX: BEMVINDO10"
            required
          />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select
            className="field"
            value={form.type}
            onChange={(e) =>
              setForm({
                ...form,
                type: e.target.value as 'PERCENT' | 'FIXED' | 'FREE_SHIPPING',
                value: e.target.value === 'FREE_SHIPPING' ? '0' : form.value,
              })
            }
          >
            <option value="PERCENT">Percentual (%)</option>
            <option value="FIXED">Valor fixo (R$)</option>
            <option value="FREE_SHIPPING">Frete grátis</option>
          </select>
        </div>
        {form.type !== 'FREE_SHIPPING' ? (
          <div>
            <label className="label">
              {form.type === 'PERCENT' ? 'Percentual' : 'Valor em R$'}
            </label>
            <input
              className="field"
              type="number"
              step="0.01"
              min="0.01"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              required
            />
          </div>
        ) : (
          <div>
            <label className="label">Benefício</label>
            <p className="field flex items-center text-sm font-semibold text-[var(--ok)]">
              Zera o frete no checkout
            </p>
          </div>
        )}
        <div>
          <label className="label">Pedido mínimo (opcional)</label>
          <input
            className="field"
            type="number"
            step="0.01"
            min="0"
            value={form.minSubtotal}
            onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Limite de usos (opcional)</label>
          <input
            className="field"
            type="number"
            min="1"
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-muted">
            Total somando todos os clientes.
          </p>
        </div>
        <div>
          <label className="label">Limite por cliente (opcional)</label>
          <input
            className="field"
            type="number"
            min="1"
            value={form.maxPerCustomer}
            onChange={(e) =>
              setForm({ ...form, maxPerCustomer: e.target.value })
            }
          />
          <p className="mt-1 text-[11px] text-muted">
            Sem isso, a mesma pessoa usa o cupom quantas vezes quiser.
          </p>
        </div>
        <div>
          <label className="label">Validade (opcional)</label>
          <input
            className="field"
            type="date"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Descrição (opcional)</label>
          <input
            className="field"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Ex: Primeira compra"
          />
          <p className="mt-1 text-[11px] text-muted">
            Se marcar &quot;mostrar na vitrine&quot;, esse texto aparece junto com o
            desconto no banner da loja. Prefira algo curto.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.showOnStorefront}
            onChange={(e) => setForm({ ...form, showOnStorefront: e.target.checked })}
          />
          Mostrar num banner na vitrine da loja
        </label>
        <button className="btn btn-accent md:col-span-2" disabled={busy}>
          {busy ? 'Criando...' : 'Criar cupom'}
        </button>
      </form>

      <div className="card overflow-hidden !p-0">
        <div className="border-b border-line px-3 py-2">
          <h2 className="text-sm font-semibold">Cupons da loja</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted">Nenhum cupom ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono text-base">{c.code}</strong>
                    <span className="text-sm font-semibold text-accent">{label(c)}</span>
                    <span
                      className={`px-1.5 py-0.5 text-[11px] font-bold ${
                        c.active
                          ? 'bg-[#e8f6ee] text-[#1b8f4a]'
                          : 'bg-[#f0f1f3] text-[#5c6570]'
                      }`}
                    >
                      {c.active ? 'Ativo' : 'Inativo'}
                    </span>
                    {c.showOnStorefront ? (
                      <span className="bg-[#eef2ff] px-1.5 py-0.5 text-[11px] font-bold text-[#3730a3]">
                        Na vitrine
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {c.description || 'Sem descrição'} · usado {c.usedCount}
                    {c.maxUses != null ? `/${c.maxUses}` : ''} vezes
                    {c.maxPerCustomer != null
                      ? ` · máx. ${c.maxPerCustomer} por cliente`
                      : ''}
                    {c.endsAt
                      ? ` · vale até ${new Date(c.endsAt).toLocaleDateString('pt-BR')}`
                      : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost py-2"
                    onClick={() =>
                      toggleActive(c).catch((err) =>
                        setError(err instanceof Error ? err.message : 'Erro'),
                      )
                    }
                  >
                    {c.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost py-2"
                    onClick={() =>
                      toggleBanner(c).catch((err) =>
                        setError(err instanceof Error ? err.message : 'Erro'),
                      )
                    }
                  >
                    {c.showOnStorefront ? 'Tirar da vitrine' : 'Mostrar na vitrine'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost py-2 text-accent"
                    onClick={() =>
                      remove(c.id).catch((err) =>
                        setError(err instanceof Error ? err.message : 'Erro'),
                      )
                    }
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
