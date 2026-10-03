'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { useEscapeKey } from '@/lib/modal-guards';
import { api, mediaUrl } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { Modal } from '@/components/Modal';
import { CabecalhoPagina, EstadoVazio, Selo } from '@/components/admin/Pagina';

type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  description?: string | null;
  imageUrl?: string | null;
  borderColor?: string | null;
  parentId?: string | null;
};

async function uploadImage(
  file: File,
  token: string | null,
  storeSlug?: string,
) {
  const formData = new FormData();
  formData.append('file', file);
  const uploaded = await api<{ path: string }>('/admin/uploads', {
    method: 'POST',
    token,
    storeSlug,
    formData,
  });
  return uploaded.path;
}

export default function AdminCategoriesPage() {
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [parentId, setParentId] = useState('');
  const [borderColor, setBorderColor] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [criando, setCriando] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  useEscapeKey(editing !== null, () => {
    if (!busy) setEditing(null);
  });
  const [editName, setEditName] = useState('');
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editParentId, setEditParentId] = useState('');
  const [editBorderColor, setEditBorderColor] = useState('');

  const departments = items.filter((c) => !c.parentId);
  const childrenOf = (id: string) => items.filter((c) => c.parentId === id);
  const orphans = items.filter(
    (c) => c.parentId && !items.some((p) => p.id === c.parentId),
  );

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  async function load() {
    const { token, storeSlug } = auth();
    if (!token) return;
    const data = await api<Category[]>('/admin/categories', {
      token,
      storeSlug,
    });
    setItems(data);
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Erro'),
    );
    // Carrega uma vez, ao abrir a página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [editing]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const { token, storeSlug } = auth();
    if (!token) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const imageUrl = imageFile
        ? await uploadImage(imageFile, token, storeSlug)
        : undefined;
      await api('/admin/categories', {
        method: 'POST',
        token,
        storeSlug,
        body: {
          name: name.trim(),
          imageUrl,
          parentId: parentId || undefined,
          borderColor: borderColor || undefined,
        },
      });
      setName('');
      setImageFile(null);
      setParentId('');
      setBorderColor('');
      setMessage('Categoria criada');
      setCriando(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(cat: Category) {
    setError('');
    setMessage('');
    setEditing(cat);
    setEditName(cat.name);
    setEditImageFile(null);
    setEditParentId(cat.parentId || '');
    setEditBorderColor(cat.borderColor || '');
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { token, storeSlug } = auth();
    if (!token) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Informe o nome da categoria');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const imageUrl = editImageFile
        ? await uploadImage(editImageFile, token, storeSlug)
        : undefined;
      await api(`/admin/categories/${editing.id}`, {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          name: trimmed,
          parentId: editParentId,
          borderColor: editBorderColor,
          ...(imageUrl ? { imageUrl } : {}),
        },
      });
      setEditing(null);
      setMessage('Categoria atualizada');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(cat: Category) {
    const { token, storeSlug } = auth();
    if (!token) return;
    setError('');
    try {
      await api(`/admin/categories/${cat.id}`, {
        method: 'PATCH',
        token,
        storeSlug,
        body: { active: !cat.active },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  }

  async function removeCategory(cat: Category) {
    const ok = await confirm({
      title: 'Excluir categoria?',
      message: `A categoria “${cat.name}” será removida. Produtos nela ficam sem categoria.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    if (!token) return;
    setError('');
    setMessage('');
    try {
      await api(`/admin/categories/${cat.id}`, {
        method: 'DELETE',
        token,
        storeSlug,
      });
      if (editing?.id === cat.id) setEditing(null);
      setMessage('Categoria excluída');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  }

  function row(cat: Category, isChild: boolean) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm ${isChild ? 'pl-12 sm:pl-16' : ''}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`shrink-0 overflow-hidden rounded-xl bg-[#f1f1f3] ${
              isChild ? 'h-9 w-9' : 'h-12 w-12'
            }`}
          >
            {cat.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(cat.imageUrl) || undefined}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p
              className={isChild ? 'font-medium' : 'text-[15px] font-semibold'}
            >
              {cat.name}
            </p>
            <p className="text-xs text-muted">/{cat.slug}</p>
          </div>
          {!isChild && childrenOf(cat.id).length > 0 ? (
            <Selo>
              {childrenOf(cat.id).length} subcategoria
              {childrenOf(cat.id).length === 1 ? '' : 's'}
            </Selo>
          ) : null}
          {cat.active ? null : <Selo tom="alerta">Oculta</Selo>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn btn-ghost h-9 px-3 text-[13px]"
            onClick={() => toggleActive(cat)}
          >
            {cat.active ? 'Ocultar' : 'Mostrar na loja'}
          </button>
          <button
            type="button"
            className="btn btn-ghost h-9 px-3 text-[13px]"
            onClick={() => openEdit(cat)}
          >
            Editar
          </button>
          <button
            type="button"
            className="btn btn-ghost h-9 px-3 text-[13px] text-[#b42318] hover:!bg-[#fef3f2]"
            onClick={() => removeCategory(cat)}
          >
            Excluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <CabecalhoPagina
        icone="/admin/categories"
        titulo="Categorias"
        descricao="Organize a vitrine em departamentos e subcategorias. Categoria com foto aparece em Compre por categoria na loja."
        acoes={
          <button
            type="button"
            className="btn btn-accent h-10 px-4"
            onClick={() => {
              setError('');
              setCriando(true);
            }}
          >
            Criar categoria
          </button>
        }
      />

      {error && !editing ? (
        <p className="text-sm text-accent">{error}</p>
      ) : null}
      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}

      {criando ? (
        <Modal
          title="Nova categoria"
          hint="Com foto, ela aparece em destaque na vitrine (Compre por categoria). Sem foto, fica só no menu."
          erro={error}
          onClose={() => setCriando(false)}
        >
          <form onSubmit={onCreate} className="form-grid">
            <div>
              <label className="label">Nome</label>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Esportes"
                required
              />
            </div>
            <div>
              <label className="label">Imagem (opcional)</label>
              <input
                className="field"
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              <p className="mt-1 text-[12px] text-muted">
                Quadrada, <strong>600 × 600 px</strong>, até 5 MB. Aparece num
                bloco quadrado com cantos arredondados; deixe o produto
                centralizado.
              </p>
            </div>
            <div>
              <label className="label">Dentro de</label>
              <select
                className="field"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Departamento principal</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                Cor do contorno quando selecionada
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  className="field w-14 shrink-0 !px-1"
                  type="color"
                  value={borderColor || '#000000'}
                  onChange={(e) => setBorderColor(e.target.value)}
                />
                {borderColor ? (
                  <button
                    type="button"
                    className="btn btn-ghost py-1.5 text-[11px]"
                    onClick={() => setBorderColor('')}
                  >
                    Usar a da loja
                  </button>
                ) : (
                  <span className="text-[11px] text-muted">Cor da loja</span>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" className="btn btn-ghost" data-modal-cancel>
                Cancelar
              </button>
              <button type="submit" className="btn btn-accent" disabled={busy}>
                {busy ? 'Salvando…' : 'Criar categoria'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {departments.length + orphans.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white">
          <EstadoVazio
            icone="/admin/categories"
            titulo="Nenhuma categoria ainda"
            texto="Crie departamentos como Masculino ou Promoções para o cliente achar os produtos mais rápido."
            acao={
              <button
                type="button"
                className="btn btn-ghost h-10 px-4"
                onClick={() => setCriando(true)}
              >
                Criar a primeira categoria
              </button>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {departments.map((dep) => (
            <li key={dep.id}>
              {row(dep, false)}
              {childrenOf(dep.id).length > 0 ? (
                <ul className="divide-y divide-line border-t border-line bg-[#fbfcfd]">
                  {childrenOf(dep.id).map((sub) => (
                    <li key={sub.id}>{row(sub, true)}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
          {orphans.map((cat) => (
            <li key={cat.id}>{row(cat, false)}</li>
          ))}
        </ul>
      )}

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={saveEdit}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <h2 className="text-base font-bold">Editar categoria</h2>
            <p className="mt-0.5 text-xs text-muted">/{editing.slug}</p>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-accent">
                {error}
              </p>
            ) : null}
            <div className="mt-3">
              <label className="label">Nome</label>
              <input
                className="field"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="mt-3">
              <label className="label">Dentro de</label>
              {childrenOf(editing.id).length > 0 ? (
                <p className="text-xs text-muted">
                  Este é um departamento com {childrenOf(editing.id).length}{' '}
                  subcategoria(s). Mova-as antes de aninhá-lo em outro.
                </p>
              ) : (
                <select
                  className="field"
                  value={editParentId}
                  onChange={(e) => setEditParentId(e.target.value)}
                >
                  <option value="">Departamento principal</option>
                  {departments
                    .filter((d) => d.id !== editing.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
            <div className="mt-3">
              <label className="label">Cor do anel na vitrine</label>
              <div className="flex items-center gap-2">
                <input
                  className="field w-16 shrink-0 !px-1"
                  type="color"
                  value={editBorderColor || '#000000'}
                  onChange={(e) => setEditBorderColor(e.target.value)}
                />
                {editBorderColor ? (
                  <button
                    type="button"
                    className="btn btn-ghost py-1.5 text-xs"
                    onClick={() => setEditBorderColor('')}
                  >
                    Voltar para a cor da loja
                  </button>
                ) : (
                  <span className="text-xs text-muted">
                    Usando a cor de destaque da loja
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                É o círculo em volta da imagem na vitrine. Importa quando a arte
                tem fundo transparente — sem ele, a categoria fica sem contorno.
              </p>
            </div>
            <div className="mt-3">
              <label className="label">Imagem</label>
              {editing.imageUrl && !editImageFile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl(editing.imageUrl) || undefined}
                  alt=""
                  className="mb-1.5 h-16 w-16 object-cover"
                />
              ) : null}
              <input
                className="field"
                type="file"
                accept="image/*"
                onChange={(e) => setEditImageFile(e.target.files?.[0] || null)}
              />
              <p className="mt-1 text-[11px] text-muted">
                Quadrada, <strong>600 × 600 px</strong>. Aparece recortada em
                círculo — deixe o produto centralizado. Até 5 MB.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
