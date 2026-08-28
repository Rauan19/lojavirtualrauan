'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { api, mediaUrl } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  description?: string | null;
  imageUrl?: string | null;
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
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editImageFile, setEditImageFile] = useState<File | null>(null);

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  async function load() {
    const { token, storeSlug } = auth();
    if (!token) return;
    const data = await api<Category[]>('/admin/categories', { token, storeSlug });
    setItems(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
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
        body: { name: name.trim(), imageUrl },
      });
      setName('');
      setImageFile(null);
      setMessage('Categoria criada');
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
        body: { name: trimmed, ...(imageUrl ? { imageUrl } : {}) },
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

  return (
    <div className="admin-page space-y-4">
      <div>
        <h1>Categorias</h1>
        <p className="text-sm text-muted">
          Organize a vitrine. Você escolhe a categoria ao criar o produto.
        </p>
      </div>

      {error && !editing ? (
        <p className="text-sm text-accent">{error}</p>
      ) : null}
      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}

      <form onSubmit={onCreate} className="card flex flex-wrap items-end gap-2 !p-4">
        <div className="min-w-[200px] flex-1">
          <label className="label">Nova categoria</label>
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
          <p className="mt-1 text-[11px] text-muted">
            Quadrada, <strong>600 × 600 px</strong>. Aparece recortada em
            círculo — deixe o produto centralizado. Até 5 MB.
          </p>
        </div>
        <button type="submit" className="btn btn-accent" disabled={busy}>
          {busy ? 'Salvando...' : 'Adicionar'}
        </button>
      </form>
      <p className="text-xs text-muted">
        Categoria com imagem aparece em destaque na vitrine da loja, estilo
        prateleira. Sem imagem, some do destaque mas continua no menu normal.
      </p>

      <ul className="space-y-2">
        {items.map((cat) => (
          <li
            key={cat.id}
            className="flex flex-wrap items-center justify-between gap-2 border border-line bg-white px-3 py-2.5 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="h-10 w-10 shrink-0 overflow-hidden bg-[#f3f3f3]">
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
                <p className="font-medium">{cat.name}</p>
                <p className="text-xs text-muted">/{cat.slug}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-ghost py-1.5 text-xs"
                onClick={() => toggleActive(cat)}
              >
                {cat.active ? 'Ativa' : 'Inativa'}
              </button>
              <button
                type="button"
                className="btn btn-ghost py-1.5 text-xs"
                onClick={() => openEdit(cat)}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn btn-ghost py-1.5 text-xs text-accent"
                onClick={() => removeCategory(cat)}
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(null);
          }}
        >
          <form
            onSubmit={saveEdit}
            className="w-full max-w-md border border-line bg-white p-4 shadow-xl sm:rounded-md"
          >
            <h2 className="text-base font-bold">Editar categoria</h2>
            <p className="mt-0.5 text-xs text-muted">/{editing.slug}</p>
            {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
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
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
