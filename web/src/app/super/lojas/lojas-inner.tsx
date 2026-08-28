'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PaginationBar } from '@/components/PaginationBar';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatPhoneBr } from '@/lib/contact';
import { formatCep, isCepLengthValid, lookupViaCep } from '@/lib/cep';
import {
  emptyCreateStore,
  feeNumber,
  formatDate,
  moneyBr,
  planBadge,
  statusLabel,
  StoreRow,
  SuperSection,
  toInputDate,
} from '../_lib';

const PAGE_SIZE = 10;

type EditForm = {
  name: string;
  slug: string;
  status: string;
  planName: string;
  planDueAt: string;
  monthlyFee: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  sellerPhone: string;
};

const emptyEdit: EditForm = {
  name: '',
  slug: '',
  status: 'TRIAL',
  planName: 'mensal',
  planDueAt: '',
  monthlyFee: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  sellerPhone: '',
};

export function SuperLojasInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const planFilter = searchParams.get('plan') || '';
  const qParam = searchParams.get('q') || '';

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(qParam);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateStore);
  const [creating, setCreating] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  async function onCreateCepBlur(raw: string) {
    if (!isCepLengthValid(raw)) return;
    setCepLoading(true);
    try {
      const found = await lookupViaCep(raw);
      if (!found) return;
      setCreateForm((f) => ({
        ...f,
        sellerZipCode: found.zipCode,
        sellerStreet: found.street,
        sellerNeighborhood: found.neighborhood,
        sellerCity: found.city,
        sellerState: found.state,
      }));
    } finally {
      setCepLoading(false);
    }
  }

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit);
  const [saving, setSaving] = useState(false);

  async function load() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const list = await api<StoreRow[]>('/stores', { token });
      setStores(list);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar lojas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, planFilter, qParam]);

  function patchQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `/super/lojas?${qs}` : '/super/lojas');
  }

  const filtered = useMemo(() => {
    const needle = qParam.trim().toLowerCase();
    return stores.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (planFilter && s.planState !== planFilter) return false;
      if (!needle) return true;
      const hay = [
        s.name,
        s.slug,
        s.planName,
        s.admin?.email || '',
        s.admin?.name || '',
        s.sellerPhone || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [stores, statusFilter, planFilter, qParam]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError('');
    try {
      await api('/stores', {
        method: 'POST',
        token,
        body: {
          name: createForm.name.trim(),
          slug: createForm.slug.trim() || undefined,
          adminName: createForm.adminName.trim(),
          adminEmail: createForm.adminEmail.trim().toLowerCase(),
          adminPassword: createForm.adminPassword,
          storeType: 'GENERAL',
          sellerDocType: createForm.sellerDocType || undefined,
          sellerDocument: createForm.sellerDocument.replace(/\D/g, ''),
          sellerPhone: createForm.sellerPhone.replace(/\D/g, ''),
          sellerZipCode: createForm.sellerZipCode.replace(/\D/g, ''),
          sellerStreet: createForm.sellerStreet.trim(),
          sellerNumber: createForm.sellerNumber.trim(),
          sellerComplement: createForm.sellerComplement.trim() || undefined,
          sellerNeighborhood: createForm.sellerNeighborhood.trim(),
          sellerCity: createForm.sellerCity.trim(),
          sellerState: createForm.sellerState.trim().toUpperCase(),
          planName: createForm.planName.trim() || 'mensal',
          planDueAt: createForm.planDueAt || undefined,
          monthlyFee: Number(createForm.monthlyFee) || 0,
          status: createForm.status,
        },
      });
      setCreateForm(emptyCreateStore);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar loja');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(store: StoreRow) {
    setEditId(store.id);
    setEditForm({
      name: store.name,
      slug: store.slug,
      status: store.status,
      planName: store.planName || 'mensal',
      planDueAt: toInputDate(store.planDueAt),
      monthlyFee:
        store.monthlyFee != null && store.monthlyFee !== ''
          ? String(store.monthlyFee)
          : '',
      adminName: store.admin?.name || '',
      adminEmail: store.admin?.email || '',
      adminPassword: '',
      sellerPhone: store.sellerPhone
        ? formatPhoneBr(store.sellerPhone)
        : '',
    });
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await api(`/stores/${editId}`, {
        method: 'PATCH',
        token,
        body: {
          name: editForm.name.trim(),
          slug: editForm.slug.trim(),
          status: editForm.status,
          planName: editForm.planName.trim() || 'mensal',
          planDueAt: editForm.planDueAt || null,
          monthlyFee:
            editForm.monthlyFee.trim() === ''
              ? null
              : Number(editForm.monthlyFee),
          adminName: editForm.adminName.trim() || undefined,
          adminEmail: editForm.adminEmail.trim().toLowerCase() || undefined,
          ...(editForm.adminPassword.trim()
            ? { adminPassword: editForm.adminPassword }
            : {}),
          sellerPhone: editForm.sellerPhone.trim() || null,
        },
      });
      setEditId(null);
      setEditForm(emptyEdit);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar loja');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SuperSection
      title="Lojas"
      summary="Cadastro, planos e acesso dos lojistas"
    >
      {error ? (
        <p className="border border-[#f5c2c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 border border-[#d9dde3] bg-white p-3">
        <div className="min-w-[180px] flex-1">
          <label className="label">Buscar</label>
          <input
            className="field"
            value={q}
            placeholder="Nome, slug, e-mail…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') patchQuery({ q: q.trim() || null });
            }}
          />
        </div>
        <div>
          <label className="label">Status</label>
          <select
            className="field"
            value={statusFilter}
            onChange={(e) => patchQuery({ status: e.target.value || null })}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Ativa</option>
            <option value="TRIAL">Trial</option>
            <option value="PAST_DUE">Em atraso</option>
            <option value="SUSPENDED">Suspensa</option>
          </select>
        </div>
        <div>
          <label className="label">Plano</label>
          <select
            className="field"
            value={planFilter}
            onChange={(e) => patchQuery({ plan: e.target.value || null })}
          >
            <option value="">Todos</option>
            <option value="ok">Em dia</option>
            <option value="expiring">Vencendo</option>
            <option value="expired">Vencido</option>
            <option value="none">Sem vencimento</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => patchQuery({ q: q.trim() || null })}
        >
          Filtrar
        </button>
        {(statusFilter || planFilter || qParam) && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQ('');
              router.replace('/super/lojas');
            }}
          >
            Limpar
          </button>
        )}
        <button
          type="button"
          className="btn btn-accent ml-auto"
          onClick={() => setCreateOpen(true)}
        >
          + Nova loja
        </button>
      </div>

      <p className="text-xs text-muted">
        {loading
          ? 'Carregando…'
          : `${filtered.length} loja${filtered.length === 1 ? '' : 's'} encontrada${filtered.length === 1 ? '' : 's'}`}
      </p>

      <ul className="space-y-2">
        {pageItems.map((s) => {
          const badge = planBadge(s);
          return (
            <li
              key={s.id}
              className="border border-[#d9dde3] bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{s.name}</p>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}
                    >
                      {badge.text}
                    </span>
                    <span className="rounded bg-[#f0f1f3] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#5c6570]">
                      {statusLabel[s.status] || s.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    /loja/{s.slug} · plano {s.planName} ·{' '}
                    {feeNumber(s.monthlyFee) > 0
                      ? moneyBr(feeNumber(s.monthlyFee))
                      : 'sem mensalidade'}{' '}
                    · vence {formatDate(s.planDueAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Admin: {s.admin?.name || '—'} ({s.admin?.email || '—'}) ·{' '}
                    {s._count.products} produtos · {s._count.orders} pedidos ·{' '}
                    {s._count.customers} clientes
                    {s.sellerPhone ? ` · WhatsApp ${s.sellerPhone}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/loja/${s.slug}`}
                    target="_blank"
                    className="btn btn-ghost text-xs"
                  >
                    Vitrine
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => openEdit(s)}
                  >
                    Gerenciar
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {!loading && pageItems.length === 0 ? (
          <li className="border border-dashed border-[#d9dde3] bg-white px-4 py-8 text-center text-sm text-muted">
            Nenhuma loja neste filtro.
          </li>
        ) : null}
      </ul>

      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        label="lojas"
        onPageChange={(next) => {
          setPage(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {createOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-[#d9dde3] bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Nova loja</h2>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setCreateOpen(false)}
              >
                Fechar
              </button>
            </div>
            <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Nome da loja</label>
                <input
                  className="field"
                  required
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Slug (opcional)</label>
                <input
                  className="field"
                  value={createForm.slug}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, slug: e.target.value })
                  }
                  placeholder="minha-loja"
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="field"
                  value={createForm.status}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, status: e.target.value })
                  }
                >
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Ativa</option>
                  <option value="PAST_DUE">Em atraso</option>
                  <option value="SUSPENDED">Suspensa</option>
                </select>
              </div>
              <div>
                <label className="label">Plano</label>
                <input
                  className="field"
                  value={createForm.planName}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, planName: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Mensalidade (R$)</label>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step="0.01"
                  value={createForm.monthlyFee}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, monthlyFee: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Vencimento</label>
                <input
                  className="field"
                  type="date"
                  value={createForm.planDueAt}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, planDueAt: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">WhatsApp vendedor</label>
                <input
                  className="field"
                  value={createForm.sellerPhone}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      sellerPhone: formatPhoneBr(e.target.value),
                    })
                  }
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>
              <div>
                <label className="label">Doc. (CPF/CNPJ)</label>
                <div className="flex gap-2">
                  <select
                    className="field w-24"
                    value={createForm.sellerDocType}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        sellerDocType: e.target.value as 'CPF' | 'CNPJ' | '',
                        sellerDocument: '',
                      })
                    }
                    required
                  >
                    <option value="">—</option>
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                  </select>
                  <input
                    className="field"
                    value={createForm.sellerDocument}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        sellerDocument: e.target.value,
                      })
                    }
                    placeholder={
                      createForm.sellerDocType === 'CNPJ'
                        ? '00.000.000/0000-00'
                        : '000.000.000-00'
                    }
                    required
                  />
                </div>
              </div>
              <div className="sm:col-span-2 border-t border-[#ebebeb] pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  Endereço do lojista
                </p>
                <p className="mb-2 text-[11px] text-muted">
                  Vira também a origem do frete — não precisa preencher de
                  novo depois.
                </p>
              </div>
              <div>
                <label className="label">CEP</label>
                <input
                  className="field"
                  value={createForm.sellerZipCode}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      sellerZipCode: formatCep(e.target.value),
                    })
                  }
                  onBlur={(e) => onCreateCepBlur(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                  required
                />
                {cepLoading ? (
                  <p className="mt-0.5 text-[11px] text-muted">Buscando...</p>
                ) : null}
              </div>
              <div>
                <label className="label">Número</label>
                <input
                  className="field"
                  value={createForm.sellerNumber}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, sellerNumber: e.target.value })
                  }
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Rua</label>
                <input
                  className="field"
                  value={createForm.sellerStreet}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, sellerStreet: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="label">Complemento (opcional)</label>
                <input
                  className="field"
                  value={createForm.sellerComplement}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      sellerComplement: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="label">Bairro</label>
                <input
                  className="field"
                  value={createForm.sellerNeighborhood}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      sellerNeighborhood: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input
                  className="field"
                  value={createForm.sellerCity}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, sellerCity: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="label">UF</label>
                <input
                  className="field"
                  value={createForm.sellerState}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      sellerState: e.target.value.toUpperCase().slice(0, 2),
                    })
                  }
                  maxLength={2}
                  required
                />
              </div>
              <div className="sm:col-span-2 border-t border-[#ebebeb] pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  Admin da loja
                </p>
              </div>
              <div>
                <label className="label">Nome</label>
                <input
                  className="field"
                  required
                  value={createForm.adminName}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, adminName: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input
                  className="field"
                  type="email"
                  required
                  value={createForm.adminEmail}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, adminEmail: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Senha</label>
                <input
                  className="field"
                  type="password"
                  required
                  minLength={6}
                  value={createForm.adminPassword}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      adminPassword: e.target.value,
                    })
                  }
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={creating}
                >
                  {creating ? 'Criando…' : 'Criar loja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editId ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-[#d9dde3] bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Gerenciar loja</h2>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setEditId(null)}
              >
                Fechar
              </button>
            </div>
            <form onSubmit={onSaveEdit} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Nome</label>
                <input
                  className="field"
                  required
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Slug</label>
                <input
                  className="field"
                  required
                  value={editForm.slug}
                  onChange={(e) =>
                    setEditForm({ ...editForm, slug: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="field"
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value })
                  }
                >
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Ativa</option>
                  <option value="PAST_DUE">Em atraso</option>
                  <option value="SUSPENDED">Suspensa</option>
                </select>
              </div>
              <div>
                <label className="label">Plano</label>
                <input
                  className="field"
                  value={editForm.planName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, planName: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Mensalidade (R$)</label>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.monthlyFee}
                  onChange={(e) =>
                    setEditForm({ ...editForm, monthlyFee: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Vencimento</label>
                <input
                  className="field"
                  type="date"
                  value={editForm.planDueAt}
                  onChange={(e) =>
                    setEditForm({ ...editForm, planDueAt: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">WhatsApp vendedor</label>
                <input
                  className="field"
                  value={editForm.sellerPhone}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      sellerPhone: formatPhoneBr(e.target.value),
                    })
                  }
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="sm:col-span-2 border-t border-[#ebebeb] pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  Admin
                </p>
              </div>
              <div>
                <label className="label">Nome</label>
                <input
                  className="field"
                  value={editForm.adminName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, adminName: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input
                  className="field"
                  type="email"
                  value={editForm.adminEmail}
                  onChange={(e) =>
                    setEditForm({ ...editForm, adminEmail: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Nova senha (opcional)</label>
                <input
                  className="field"
                  type="password"
                  minLength={6}
                  value={editForm.adminPassword}
                  onChange={(e) =>
                    setEditForm({ ...editForm, adminPassword: e.target.value })
                  }
                  placeholder="Deixe em branco para manter"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditId(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={saving}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </SuperSection>
  );
}
