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
  const [editing, setEditing] = useState<Category | null>(null);
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
      <div className="flex flex-wrap items-center justify-between gap-2 border border-line bg-white px-3 py-2.5 text-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`shrink-0 overflow-hidden rounded-full bg-[#f3f3f3] ${
              isChild ? 'h-8 w-8' : 'h-10 w-10'
            }`}
            style={
              cat.imageUrl
                ? {
                    borderStyle: 'solid',
                    borderWidth: 1.5,
                    borderColor: cat.borderColor || 'var(--accent)',
                  }
                : undefined
            }
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
            <p className={isChild ? 'font-normal' : 'font-medium'}>{cat.name}</p>
            <p className="text-xs text-muted">/{cat.slug}</p>
          </div>
          {!isChild && childrenOf(cat.id).length > 0 ? (
            <span className="rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[11px] text-muted">
              {childrenOf(cat.id).length} sub
            </span>
          ) : null}
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
      </div>
    );
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
        <div className="min-w-[190px]">
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
          <label className="label">Cor do anel</label>
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
        <button type="submit" className="btn btn-accent" disabled={busy}>
          {busy ? 'Salvando...' : 'Adicionar'}
        </button>
      </form>
      <p className="text-xs text-muted">
        Categoria com imagem aparece em destaque na vitrine da loja, estilo
        prateleira. Sem imagem, some do destaque mas continua no menu normal.
        Subcategorias aparecem no menu suspenso do departamento, quando o
        cliente passa o mouse por cima.
      </p>

      <ul className="space-y-2">
        {departments.map((dep) => (
          <li key={dep.id}>
            {row(dep, false)}
            {childrenOf(dep.id).length > 0 ? (
              <ul className="mt-1 space-y-1 border-l-2 border-line pl-3 sm:pl-5">
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
                É o círculo em volta da imagem na vitrine. Importa quando a
                arte tem fundo transparente — sem ele, a categoria fica sem
                contorno.
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
