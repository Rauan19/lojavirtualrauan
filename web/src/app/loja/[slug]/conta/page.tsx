'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  useCustomer,
  type CustomerAddress,
} from '@/components/CustomerProvider';
import { api } from '@/lib/api';
import {
  formatCep,
  isCepLengthValid,
  lookupViaCep,
  onlyDigits,
} from '@/lib/cep';

const emptyForm = {
  label: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  isDefault: false,
};

export default function ContaPage() {
  const params = useParams<{ slug: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { customer, token, addresses, loading, refresh, setAddresses, logout } =
    useCustomer();
  const [lgpdBusy, setLgpdBusy] = useState(false);
  const [lgpdErro, setLgpdErro] = useState('');

  async function baixarMeusDados() {
    if (!token) return;
    setLgpdBusy(true);
    setLgpdErro('');
    try {
      const dados = await api<Record<string, unknown>>(
        '/storefront/account/dados-pessoais',
        { token, storeSlug: params.slug },
      );
      const blob = new Blob([JSON.stringify(dados, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meus-dados.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLgpdErro(err instanceof Error ? err.message : 'Erro ao baixar');
    } finally {
      setLgpdBusy(false);
    }
  }

  async function excluirConta() {
    if (!token) return;
    const ok = await confirm({
      title: 'Excluir sua conta?',
      message:
        'Seus dados pessoais são removidos e o acesso é encerrado. Os pedidos já feitos ficam registrados sem identificação, por obrigação fiscal da loja. Não tem como desfazer.',
      confirmLabel: 'Quero excluir',
      danger: true,
    });
    if (!ok) return;

    // a senha é pedida de novo: a ação é irreversível
    const senha = window.prompt('Confirme sua senha para excluir a conta:');
    if (!senha) return;

    setLgpdBusy(true);
    setLgpdErro('');
    try {
      await api('/storefront/account/excluir', {
        method: 'POST',
        token,
        storeSlug: params.slug,
        body: { password: senha },
      });
      logout();
      window.location.href = `/loja/${params.slug}`;
    } catch (err) {
      setLgpdErro(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setLgpdBusy(false);
    }
  }

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [cepError, setCepError] = useState('');
  const [cepOk, setCepOk] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  async function lookupCep(raw: string) {
    const formatted = formatCep(raw);
    setForm((f) => ({ ...f, zipCode: formatted }));
    setCepError('');
    setCepOk(false);

    if (!isCepLengthValid(formatted)) {
      if (onlyDigits(formatted).length > 0) {
        setCepError('CEP deve ter 8 dígitos');
      }
      return false;
    }

    setCepBusy(true);
    try {
      const data = await lookupViaCep(formatted);
      if (!data) {
        setCepError('CEP inválido ou não encontrado');
        setForm((f) => ({
          ...f,
          zipCode: formatted,
          city: '',
          state: '',
        }));
        return false;
      }
      setForm((f) => ({
        ...f,
        zipCode: data.zipCode,
        street: data.street || f.street,
        neighborhood: data.neighborhood || f.neighborhood,
        city: data.city,
        state: data.state,
      }));
      setCepOk(true);
      setCepError('');
      return true;
    } catch {
      setCepError('Não foi possível consultar o CEP. Tente de novo.');
      return false;
    } finally {
      setCepBusy(false);
    }
  }

  function onCepChange(raw: string) {
    const formatted = formatCep(raw);
    setForm((f) => ({ ...f, zipCode: formatted }));
    setCepOk(false);
    setCepError('');
    if (onlyDigits(formatted).length === 8) {
      void lookupCep(formatted);
    }
  }

  function startEdit(addr: CustomerAddress) {
    setEditingId(addr.id);
    setShowForm(true);
    setCepError('');
    setCepOk(isCepLengthValid(addr.zipCode));
    setForm({
      label: addr.label || '',
      zipCode: formatCep(addr.zipCode),
      street: addr.street,
      number: addr.number,
      complement: addr.complement || '',
      neighborhood: addr.neighborhood,
      city: addr.city,
      state: addr.state,
      isDefault: addr.isDefault,
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const valid = await lookupCep(form.zipCode);
      if (!valid) {
        setError('Informe um CEP válido antes de salvar');
        return;
      }
      if (!form.city.trim() || !form.state.trim()) {
        setError('Cidade e estado são obrigatórios (preenchidos pelo CEP)');
        return;
      }
      const body = {
        label: form.label || undefined,
        zipCode: onlyDigits(form.zipCode),
        street: form.street,
        number: form.number,
        complement: form.complement || undefined,
        neighborhood: form.neighborhood,
        city: form.city,
        state: form.state.toUpperCase(),
        isDefault: form.isDefault,
      };
      if (editingId) {
        await api(`/storefront/addresses/${editingId}`, {
          method: 'PUT',
          token,
          storeSlug: params.slug,
          body,
        });
      } else {
        await api('/storefront/addresses', {
          method: 'POST',
          token,
          storeSlug: params.slug,
          body,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setCepOk(false);
      setCepError('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function removeAddr(id: string) {
    if (!token) return;
    const ok = await confirm({
      title: 'Remover endereço?',
      message: 'Esse endereço sai da sua conta. Você pode cadastrar de novo depois.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    await api(`/storefront/addresses/${id}`, {
      method: 'DELETE',
      token,
      storeSlug: params.slug,
    });
    setAddresses(addresses.filter((a) => a.id !== id));
    await refresh();
  }

  async function makeDefault(id: string) {
    if (!token) return;
    await api(`/storefront/addresses/${id}/default`, {
      method: 'PATCH',
      token,
      storeSlug: params.slug,
    });
    await refresh();
  }

  if (loading || !customer) {
    return null;
  }

  return (
    <main className="px-4 py-6 md:px-0 md:py-0">
      <div>
        <h1 className="text-xl font-bold">Minha conta</h1>
        <p className="text-sm text-muted">
          {customer.name} · {customer.email}
        </p>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Endereços</h2>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setCepOk(false);
              setCepError('');
              setError('');
              setShowForm(true);
            }}
          >
            + Novo
          </button>
        </div>

        {error ? <p className="mb-2 text-sm text-accent">{error}</p> : null}

        <ul className="space-y-2">
          {addresses.map((addr) => (
            <li
              key={addr.id}
              className={`border bg-white p-3.5 text-sm ${
                addr.isDefault ? 'border-ink' : 'border-line'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {addr.label ? <p className="font-semibold">{addr.label}</p> : null}
                    {addr.isDefault ? (
                      <span className="border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ok)]">
                        Padrão
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 leading-snug">
                    {addr.street}, {addr.number}
                    {addr.complement ? ` — ${addr.complement}` : ''}
                  </p>
                  <p className="text-muted">
                    {addr.neighborhood} · {addr.city}/{addr.state} · CEP {addr.zipCode}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                <button
                  type="button"
                  className="btn btn-ghost px-2.5 py-1 text-xs"
                  onClick={() => startEdit(addr)}
                >
                  Alterar
                </button>
                {!addr.isDefault ? (
                  <button
                    type="button"
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                    onClick={() => makeDefault(addr.id)}
                  >
                    Usar como padrão
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost px-2.5 py-1 text-xs text-accent"
                  onClick={() => removeAddr(addr.id)}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
          {addresses.length === 0 && !showForm ? (
            <li className="flex flex-col items-center gap-2 border border-dashed border-line px-4 py-10 text-center">
              <AddressIcon />
              <p className="text-sm font-semibold text-ink">Nenhum endereço cadastrado</p>
              <p className="text-xs text-muted">
                Cadastre um endereço pra agilizar sua próxima compra.
              </p>
            </li>
          ) : null}
        </ul>

        {showForm ? (
          <form onSubmit={onSave} className="card mt-3 space-y-2 !p-4">
            <h3 className="text-sm font-bold">
              {editingId ? 'Alterar endereço' : 'Novo endereço'}
            </h3>
            <div>
              <label className="label">Apelido (opcional)</label>
              <input
                className="field"
                placeholder="Casa, Trabalho..."
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div>
              <label className="label">CEP</label>
              <input
                className="field"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                value={form.zipCode}
                onChange={(e) => onCepChange(e.target.value)}
                onBlur={(e) => void lookupCep(e.target.value)}
                required
              />
              {cepBusy ? (
                <p className="mt-1 text-xs text-muted">Consultando CEP…</p>
              ) : null}
              {cepError ? (
                <p className="mt-1 text-xs text-accent">{cepError}</p>
              ) : null}
              {cepOk && !cepError ? (
                <p className="mt-1 text-xs text-[var(--ok)]">
                  CEP válido — cidade e estado preenchidos
                </p>
              ) : null}
            </div>
            <div>
              <label className="label">Rua</label>
              <input
                className="field"
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Número</label>
                <input
                  className="field"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Complemento</label>
                <input
                  className="field"
                  value={form.complement}
                  onChange={(e) => setForm({ ...form, complement: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Bairro</label>
              <input
                className="field"
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Cidade</label>
                <input
                  className="field bg-[#f7f7f7]"
                  value={form.city}
                  readOnly
                  required
                  placeholder="Preenchido pelo CEP"
                />
              </div>
              <div>
                <label className="label">UF</label>
                <input
                  className="field bg-[#f7f7f7]"
                  value={form.state}
                  readOnly
                  maxLength={2}
                  required
                  placeholder="UF"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Definir como endereço padrão
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="btn btn-accent"
                disabled={busy || cepBusy || Boolean(cepError)}
              >
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setCepError('');
                  setCepOk(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {/*
        LGPD art. 18: acesso, portabilidade e exclusão são direitos do titular
        e precisam de um caminho próprio — não dá para depender de o cliente
        escrever para a loja e alguém lembrar de atender.
      */}
      <section className="mt-8 border-t border-line pt-5">
        <h2 className="text-sm font-bold">Meus dados</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Você pode baixar tudo o que a loja guarda sobre você, ou pedir a
          exclusão dos seus dados a qualquer momento.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost text-[13px]"
            disabled={lgpdBusy}
            onClick={() => void baixarMeusDados()}
          >
            Baixar meus dados
          </button>
          <button
            type="button"
            className="btn btn-ghost text-[13px] text-accent"
            disabled={lgpdBusy}
            onClick={() => void excluirConta()}
          >
            Excluir minha conta
          </button>
        </div>
        {lgpdErro ? (
          <p className="mt-2 text-[13px] text-accent">{lgpdErro}</p>
        ) : null}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          A exclusão remove seu nome, e-mail, telefone, CPF e endereços, e
          encerra seu acesso. Os pedidos já feitos continuam registrados sem
          identificação, porque a loja é obrigada a guardá-los pela legislação
          fiscal.
        </p>
      </section>
      {confirmDialog}
    </main>
  );
}

function AddressIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden className="text-muted">
      <path
        d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
