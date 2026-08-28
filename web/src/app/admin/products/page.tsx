'use client';

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { PaginationBar } from '@/components/PaginationBar';
import { api, mediaUrl, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type ProductVariant = {
  id?: string;
  label: string;
  options: Record<string, string>;
  stock: number;
  sku?: string | null;
  barcode?: string | null;
  price?: number | null;
};

type Product = {
  id: string;
  name: string;
  price: string;
  compareAt?: string | null;
  installments?: number | null;
  stock: number;
  active: boolean;
  brand?: string | null;
  sku?: string | null;
  ncm?: string | null;
  description?: string | null;
  weightKg?: string | number | null;
  widthCm?: string | number | null;
  heightCm?: string | number | null;
  lengthCm?: string | number | null;
  hasVariants?: boolean;
  variants?: ProductVariant[];
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  images: { url: string }[];
  _count?: { orderItems?: number };
};

type EditVariantRow = {
  id: string;
  label: string;
  stock: string;
  price: string;
  options: Record<string, string>;
  sku: string;
  barcode: string;
};

type EditForm = {
  id: string;
  name: string;
  categoryId: string;
  price: string;
  compareAt: string;
  stock: string;
  brand: string;
  sku: string;
  description: string;
  active: boolean;
  weightKg: string;
  widthCm: string;
  heightCm: string;
  lengthCm: string;
  hasVariants: boolean;
  variants: EditVariantRow[];
  orderItemsCount: number;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

type ListResponse = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type FreeAxis = {
  id: string;
  key: string;
  label: string;
  presets: string[];
  selected: string[];
  customInput: string;
};

type DraftVariant = {
  key: string;
  label: string;
  options: Record<string, string>;
  stock: string;
  price: string;
  barcode: string;
  sku: string;
};

const MAX_PHOTOS = 6;
const PAGE_SIZE = 18;

/** Cores comuns → hex para o seletor visual */
const COLOR_HEX: Record<string, string> = {
  preto: '#1a1a1a',
  branco: '#f4f4f4',
  cinza: '#9ca3af',
  azul: '#2563eb',
  vermelho: '#dc2626',
  verde: '#16a34a',
  bege: '#e8d4b8',
  rosa: '#ec4899',
  amarelo: '#eab308',
  marrom: '#78350f',
  prata: '#c0c0c0',
  dourado: '#ca8a04',
  laranja: '#ea580c',
  roxo: '#7c3aed',
  unico: '#e5e7eb',
  'único': '#e5e7eb',
};

function colorHex(name: string) {
  const key = name.trim().toLowerCase();
  return COLOR_HEX[key] || null;
}

function isColorAxis(axis: { key: string; label: string }) {
  const t = `${axis.key} ${axis.label}`.toLowerCase();
  return /cor|color|acabamento|tone|tom/.test(t);
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-[11px] leading-snug text-muted">{children}</p>;
}

const AXIS_TEMPLATES: {
  id: string;
  label: string;
  hint: string;
  axes: Omit<FreeAxis, 'id' | 'selected' | 'customInput'>[];
}[] = [
  {
    id: 'clothing',
    label: 'Roupa',
    hint: 'Tamanho + Cor',
    axes: [
      {
        key: 'size',
        label: 'Tamanho',
        presets: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'],
      },
      {
        key: 'color',
        label: 'Cor',
        presets: [
          'Preto',
          'Branco',
          'Cinza',
          'Azul',
          'Vermelho',
          'Verde',
          'Bege',
          'Rosa',
        ],
      },
    ],
  },
  {
    id: 'shoes',
    label: 'Calçado',
    hint: 'Numeração + Cor',
    axes: [
      {
        key: 'size',
        label: 'Numeração',
        presets: [
          '33',
          '34',
          '35',
          '36',
          '37',
          '38',
          '39',
          '40',
          '41',
          '42',
          '43',
          '44',
          '45',
        ],
      },
      {
        key: 'color',
        label: 'Cor',
        presets: ['Preto', 'Branco', 'Marrom', 'Bege', 'Azul', 'Cinza'],
      },
    ],
  },
  {
    id: 'volume',
    label: 'Volume (ml/L)',
    hint: 'Líquidos',
    axes: [
      {
        key: 'volume',
        label: 'Volume',
        presets: ['100ml', '250ml', '500ml', '1L', '2L'],
      },
    ],
  },
  {
    id: 'weight',
    label: 'Peso (g/kg)',
    hint: 'Gramas / kg',
    axes: [
      {
        key: 'weight',
        label: 'Peso',
        presets: ['100g', '250g', '500g', '1kg', '2kg'],
      },
    ],
  },
];

function slugKey(label: string) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || `eixo_${Date.now()}`;
}

function cartesianProduct(sets: string[][]): string[][] {
  if (sets.length === 0) return [[]];
  return sets.reduce<string[][]>(
    (acc, set) => acc.flatMap((prefix) => set.map((v) => [...prefix, v])),
    [[]],
  );
}

function newAxis(
  partial?: Partial<FreeAxis> & { key: string; label: string },
): FreeAxis {
  return {
    id: `axis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    key: partial?.key || 'opcao',
    label: partial?.label || 'Opção',
    presets: partial?.presets || [],
    selected: partial?.selected || [],
    customInput: '',
  };
}

export default function AdminProductsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [compareAt, setCompareAt] = useState('');
  const [installments, setInstallments] = useState('');
  const [stock, setStock] = useState('10');
  const [weightKg, setWeightKg] = useState('0.5');
  const [widthCm, setWidthCm] = useState('16');
  const [heightCm, setHeightCm] = useState('10');
  const [lengthCm, setLengthCm] = useState('20');
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [ncm, setNcm] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [useVariants, setUseVariants] = useState(false);
  const [axes, setAxes] = useState<FreeAxis[]>([]);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>([]);

  const CREATE_STEPS = [
    { id: 'dados', title: 'Dados', short: 'Produto' },
    { id: 'preco', title: 'Preço', short: 'Preço' },
    { id: 'frete', title: 'Frete', short: 'Pacote' },
    { id: 'opcoes', title: 'Opções', short: 'Variações' },
  ] as const;

  const auth = () => {
    const user = getUser();
    const token = getToken();
    return { token, storeSlug: user?.store?.slug };
  };

  const previews = useMemo(
    () => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  async function load(nextPage = page) {
    const { token, storeSlug } = auth();
    if (!token) return;
    const params = new URLSearchParams();
    params.set('page', String(nextPage));
    params.set('limit', String(PAGE_SIZE));
    if (debouncedQ) params.set('q', debouncedQ);
    if (filterCategoryId) params.set('categoryId', filterCategoryId);
    if (filterActive) params.set('active', filterActive);
    const [data, cats] = await Promise.all([
      api<ListResponse>(`/admin/products?${params}`, { token, storeSlug }),
      api<Category[]>('/admin/categories', { token, storeSlug }),
    ]);
    setItems(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages || 1);
    setCategories(cats.filter((c) => c.active));
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filterCategoryId, filterActive]);

  useEffect(() => {
    load(page).catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQ, filterCategoryId, filterActive]);

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_PHOTOS);
    setFiles(next);
  }

  function applyTemplate(templateId: string) {
    const tpl = AXIS_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setUseVariants(true);
    setAxes(
      tpl.axes.map((a) =>
        newAxis({
          key: a.key,
          label: a.label,
          presets: a.presets,
          selected: [],
        }),
      ),
    );
    setDraftVariants([]);
    setError('');
  }

  function addEmptyAxis() {
    setUseVariants(true);
    setAxes((prev) => [
      ...prev,
      newAxis({ key: `opcao_${prev.length + 1}`, label: 'Nova opção', presets: [] }),
    ]);
  }

  function updateAxis(id: string, patch: Partial<FreeAxis>) {
    setAxes((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const next = { ...a, ...patch };
        if (patch.label !== undefined && !patch.key) {
          next.key = slugKey(patch.label);
        }
        return next;
      }),
    );
  }

  function removeAxis(id: string) {
    setAxes((prev) => prev.filter((a) => a.id !== id));
    setDraftVariants([]);
  }

  function toggleAxisOption(axisId: string, option: string) {
    setAxes((prev) =>
      prev.map((a) => {
        if (a.id !== axisId) return a;
        const on = a.selected.includes(option);
        return {
          ...a,
          selected: on
            ? a.selected.filter((o) => o !== option)
            : [...a.selected, option],
        };
      }),
    );
  }

  function addCustomOption(axisId: string) {
    setAxes((prev) =>
      prev.map((a) => {
        if (a.id !== axisId) return a;
        const raw = a.customInput.trim();
        if (!raw || a.selected.includes(raw)) {
          return { ...a, customInput: '' };
        }
        return {
          ...a,
          selected: [...a.selected, raw],
          customInput: '',
        };
      }),
    );
  }

  function generateCombinations() {
    if (axes.length === 0) {
      setError('Adicione ao menos um eixo (ex.: Tamanho, Volume)');
      return;
    }
    if (axes.some((a) => !a.label.trim())) {
      setError('Dê um nome a cada eixo de variação');
      return;
    }
    if (axes.some((a) => a.selected.length === 0)) {
      setError('Marque ao menos um valor em cada eixo');
      return;
    }
    setError('');
    const combos = cartesianProduct(axes.map((a) => a.selected));
    setDraftVariants(
      combos.map((combo) => {
        const options: Record<string, string> = {};
        axes.forEach((axis, i) => {
          options[axis.key] = combo[i];
        });
        const label = combo.join(' / ');
        return {
          key: `${label}-${Date.now()}`,
          label,
          options,
          stock: '1',
          price: '',
          barcode: '',
          sku: '',
        };
      }),
    );
  }

  function addManualVariantRow() {
    setUseVariants(true);
    const n = draftVariants.length + 1;
    setDraftVariants((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}-${n}`,
        label: `Variação ${n}`,
        options: { opcao: `Variação ${n}` },
        stock: '1',
        price: '',
        barcode: '',
        sku: '',
      },
    ]);
  }

  function resetForm() {
    setCategoryId('');
    setName('');
    setPrice('');
    setCompareAt('');
    setInstallments('');
    setStock('10');
    setWeightKg('0.5');
    setWidthCm('16');
    setHeightCm('10');
    setLengthCm('20');
    setBrand('');
    setSku('');
    setNcm('');
    setDescription('');
    setFiles([]);
    setDraftVariants([]);
    setAxes([]);
    setUseVariants(false);
    setCreateStep(0);
    setError('');
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function closeCreate() {
    if (loading) return;
    setCreateOpen(false);
    resetForm();
  }

  function validateStep(step: number): string | null {
    if (step === 0) {
      if (!name.trim()) return 'Informe o nome do produto';
      if (!categoryId.trim()) return 'Selecione uma categoria';
      return null;
    }
    if (step === 1) {
      const priceNum = Number(price);
      if (!price.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
        return 'Informe o preço de venda';
      }
      if (compareAt) {
        const de = Number(compareAt);
        if (!Number.isFinite(de) || de <= priceNum) {
          return 'O preço “de” precisa ser maior que o preço de venda';
        }
      }
      if (!useVariants) {
        const stockNum = Number(stock);
        if (!Number.isFinite(stockNum) || stockNum < 0) {
          return 'Informe a quantidade em estoque';
        }
      }
      return null;
    }
    if (step === 2) {
      const w = Number(weightKg);
      const wi = Number(widthCm);
      const h = Number(heightCm);
      const l = Number(lengthCm);
      if (!Number.isFinite(w) || w < 0.01) return 'Informe o peso do pacote (kg)';
      if (!Number.isFinite(wi) || wi < 1) return 'Informe a largura (cm)';
      if (!Number.isFinite(h) || h < 1) return 'Informe a altura (cm)';
      if (!Number.isFinite(l) || l < 1) return 'Informe o comprimento (cm)';
      return null;
    }
    if (step === 3) {
      if (useVariants && draftVariants.length === 0) {
        return 'Gere as combinações ou desmarque “tem opções diferentes”';
      }
      return null;
    }
    return null;
  }

  function goNextStep() {
    const err = validateStep(createStep);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setCreateStep((s) => Math.min(s + 1, CREATE_STEPS.length - 1));
  }

  function goPrevStep() {
    setError('');
    setCreateStep((s) => Math.max(s - 1, 0));
  }

  useEffect(() => {
    if (!createOpen) return;
    const el = document.getElementById('create-product-scroll');
    el?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [createStep, createOpen]);

  useEffect(() => {
    if (!createOpen && !editForm) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [createOpen, editForm]);

  async function openEdit(productId: string) {
    const { token, storeSlug } = auth();
    if (!token) return;
    setError('');
    setEditBusy(true);
    try {
      const p = await api<Product>(`/admin/products/${productId}`, {
        token,
        storeSlug,
      });
      const variants = (p.variants || []).map((v) => ({
        id: v.id || '',
        label: v.label,
        stock: String(v.stock ?? 0),
        price: v.price != null ? String(Number(v.price)) : '',
        options: v.options || {},
        sku: v.sku || '',
        barcode: v.barcode || '',
      }));
      setEditForm({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId || p.category?.id || '',
        price: String(Number(p.price)),
        compareAt:
          p.compareAt != null && p.compareAt !== ''
            ? String(Number(p.compareAt))
            : '',
        stock: String(p.stock ?? 0),
        brand: p.brand || '',
        sku: p.sku || '',
        description: p.description || '',
        active: p.active !== false,
        weightKg:
          p.weightKg != null && p.weightKg !== ''
            ? String(Number(p.weightKg))
            : '0.5',
        widthCm:
          p.widthCm != null && p.widthCm !== ''
            ? String(Number(p.widthCm))
            : '16',
        heightCm:
          p.heightCm != null && p.heightCm !== ''
            ? String(Number(p.heightCm))
            : '10',
        lengthCm:
          p.lengthCm != null && p.lengthCm !== ''
            ? String(Number(p.lengthCm))
            : '20',
        hasVariants: Boolean(p.hasVariants || variants.length),
        variants,
        orderItemsCount: p._count?.orderItems ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir produto');
    } finally {
      setEditBusy(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    const { token, storeSlug } = auth();
    if (!token) return;
    if (!editForm.name.trim()) {
      setError('Informe o nome do produto');
      return;
    }
    if (!editForm.categoryId.trim()) {
      setError('Selecione uma categoria');
      return;
    }
    const priceNum = Number(editForm.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Preço inválido');
      return;
    }
    setEditBusy(true);
    setError('');
    try {
      const variantsPayload = editForm.hasVariants
        ? editForm.variants.map((v) => ({
            id: v.id || undefined,
            label: v.label.trim(),
            options: v.options,
            stock: Number(v.stock) || 0,
            price: v.price.trim() ? Number(v.price) : null,
            sku: v.sku.trim() || undefined,
            barcode: v.barcode.trim() || undefined,
          }))
        : [];

      await api(`/admin/products/${editForm.id}`, {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          name: editForm.name.trim(),
          categoryId: editForm.categoryId,
          price: priceNum,
          ...(editForm.compareAt.trim()
            ? { compareAt: Number(editForm.compareAt) }
            : {}),
          ...(editForm.hasVariants
            ? {}
            : { stock: Number(editForm.stock) || 0 }),
          brand: editForm.brand.trim() || undefined,
          sku: editForm.sku.trim() || undefined,
          description: editForm.description.trim() || undefined,
          active: editForm.active,
          weightKg: Number(editForm.weightKg) || undefined,
          widthCm: Number(editForm.widthCm) || undefined,
          heightCm: Number(editForm.heightCm) || undefined,
          lengthCm: Number(editForm.lengthCm) || undefined,
          ...(editForm.hasVariants ? { variants: variantsPayload } : {}),
        },
      });
      setEditForm(null);
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setEditBusy(false);
    }
  }

  function canDeleteProduct(product: Product) {
    return (product._count?.orderItems ?? 0) === 0;
  }

  async function setProductActive(product: Product, active: boolean) {
    const ok = await confirm({
      title: active ? 'Ativar produto?' : 'Desativar produto?',
      message: active
        ? `“${product.name}” volta a aparecer na vitrine.`
        : `“${product.name}” some da vitrine, mas pedidos antigos e o cadastro ficam salvos.`,
      confirmLabel: active ? 'Ativar' : 'Desativar',
      danger: !active,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    if (!token) return;
    setError('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH',
        token,
        storeSlug,
        body: { active },
      });
      if (editForm?.id === product.id) {
        setEditForm({ ...editForm, active });
      }
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  }

  async function removeProduct(product: Product) {
    if (!canDeleteProduct(product)) {
      setError(
        'Este produto já teve pedidos. Desative-o na vitrine em vez de excluir.',
      );
      return;
    }
    const ok = await confirm({
      title: 'Excluir produto?',
      message: `“${product.name}” ainda não teve pedidos e será removido de vez. Essa ação não tem volta.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    if (!token) return;
    setError('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'DELETE',
        token,
        storeSlug,
      });
      if (editForm?.id === product.id) setEditForm(null);
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    for (let s = 0; s < CREATE_STEPS.length; s++) {
      const stepErr = validateStep(s);
      if (stepErr) {
        setCreateStep(s);
        setError(stepErr);
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      const { token, storeSlug } = auth();
      if (!token || !storeSlug) throw new Error('Sessão inválida');

      if (!categoryId.trim()) {
        throw new Error('Selecione uma categoria');
      }

      const priceNum = Number(price);
      const deNum = compareAt ? Number(compareAt) : undefined;
      if (deNum !== undefined && deNum <= priceNum) {
        throw new Error('Preço “de” precisa ser maior que o preço “por”');
      }

      if (useVariants && draftVariants.length === 0) {
        throw new Error(
          'Gere as combinações ou adicione variações manuais, ou desligue “Tem variações”',
        );
      }

      const imageUrls: string[] = [];
      for (const file of files.slice(0, MAX_PHOTOS)) {
        const formData = new FormData();
        formData.append('file', file);
        const uploaded = await api<{ path: string }>('/admin/uploads', {
          method: 'POST',
          token,
          storeSlug,
          formData,
        });
        imageUrls.push(uploaded.path);
      }

      const variantsPayload =
        useVariants && draftVariants.length > 0
          ? draftVariants.map((v) => {
              const variantPrice = v.price.trim()
                ? Number(v.price)
                : undefined;
              if (
                variantPrice !== undefined &&
                (!Number.isFinite(variantPrice) || variantPrice < 0)
              ) {
                throw new Error(`Preço inválido na variação ${v.label}`);
              }
              return {
                label: v.label.trim() || Object.values(v.options).join(' / '),
                options: v.options,
                stock: Number(v.stock) || 0,
                barcode: v.barcode.trim() || undefined,
                sku: v.sku.trim() || undefined,
                price:
                  variantPrice !== undefined && Number.isFinite(variantPrice)
                    ? variantPrice
                    : null,
              };
            })
          : undefined;

      const stockSum = variantsPayload
        ? variantsPayload.reduce((s, v) => s + v.stock, 0)
        : Number(stock);

      await api('/admin/products', {
        method: 'POST',
        token,
        storeSlug,
        body: {
          name,
          categoryId,
          price: priceNum,
          compareAt: deNum,
          installments: installments ? Number(installments) : undefined,
          stock: stockSum,
          brand: brand || undefined,
          sku: sku.trim() || undefined,
          ncm: ncm.replace(/\D/g, '').slice(0, 8) || undefined,
          description: description.trim() || undefined,
          weightKg: weightKg ? Number(weightKg) : undefined,
          widthCm: widthCm ? Number(widthCm) : undefined,
          heightCm: heightCm ? Number(heightCm) : undefined,
          lengthCm: lengthCm ? Number(lengthCm) : undefined,
          imageUrls,
          ...(variantsPayload ? { variants: variantsPayload } : {}),
        },
      });

      resetForm();
      setCreateOpen(false);
      setPage(1);
      await load(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setLoading(false);
    }
  }

  const variantStockSum = draftVariants.reduce(
    (s, v) => s + (Number(v.stock) || 0),
    0,
  );

  const hasProductFilters = Boolean(q || filterCategoryId || filterActive);

  return (
    <div className="admin-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Produtos</h1>
          <p className="text-sm text-muted">
            Loja geral · defina tamanho, cor, ml, gramas etc. em cada produto
            {total > 0 ? ` · ${total} cadastrado${total === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <button type="button" className="btn btn-accent shrink-0" onClick={openCreate}>
          + Criar produto
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="field max-w-xs"
          placeholder="Buscar por nome ou SKU..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field w-auto"
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="field w-auto"
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
        >
          <option value="">Ativos e inativos</option>
          <option value="true">Só ativos</option>
          <option value="false">Só inativos</option>
        </select>
        {hasProductFilters ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQ('');
              setFilterCategoryId('');
              setFilterActive('');
            }}
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {error && !createOpen && !editForm ? (
        <p className="text-sm text-accent">{error}</p>
      ) : null}

      {items.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-sm font-medium">
            {hasProductFilters ? 'Nenhum produto encontrado' : 'Nenhum produto ainda'}
          </p>
          <p className="mt-1 text-xs text-muted">
            {hasProductFilters
              ? 'Tente ajustar a busca ou os filtros.'
              : 'Use Criar produto e escolha se terá variações (P/M/G, 500ml…).'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((p) => {
            const img = mediaUrl(p.images[0]?.url);
            const priceNum = Number(p.price);
            const de = p.compareAt ? Number(p.compareAt) : null;
            const discount =
              de && de > priceNum
                ? Math.round(((de - priceNum) / de) * 100)
                : null;
            const variantCount = p.variants?.length || 0;
            return (
              <article
                key={p.id}
                className={`card overflow-hidden !p-0 ${p.active ? '' : 'opacity-60'}`}
              >
                <div className="relative aspect-square bg-[#eee]">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  {discount ? (
                    <span className="absolute left-1 top-1 bg-accent px-1 py-0.5 text-[9px] font-bold text-white">
                      -{discount}%
                    </span>
                  ) : null}
                  {p.images.length > 1 ? (
                    <span className="absolute bottom-1 right-1 bg-black/65 px-1 py-0.5 text-[9px] font-semibold text-white">
                      {p.images.length} fotos
                    </span>
                  ) : null}
                </div>
                <div className="space-y-0.5 p-1.5">
                  <p className="truncate text-[9px] uppercase tracking-wide text-muted">
                    {p.category?.name || 'Sem categoria'}
                    {p.brand ? ` · ${p.brand}` : ''}
                  </p>
                  <h2 className="line-clamp-2 min-h-[2em] text-[11px] font-medium leading-snug">
                    {p.name}
                  </h2>
                  <div className="flex flex-wrap items-baseline gap-1">
                    {de && de > priceNum ? (
                      <span className="text-[10px] text-muted line-through">
                        {money(de)}
                      </span>
                    ) : null}
                    <p className="text-xs font-semibold">{money(p.price)}</p>
                  </div>
                  {p.installments && p.installments >= 2 ? (
                    <p className="text-[10px] font-semibold text-[var(--ok)]">
                      à vista ou até {p.installments}x s/ juros
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted">à vista · cartão c/ juros</p>
                  )}
                  <p className="text-[10px] text-muted">Estoque: {p.stock}</p>
                  {variantCount > 0 || p.hasVariants ? (
                    <p className="text-[10px] font-semibold text-ink">
                      {variantCount || '—'} variação(ões)
                    </p>
                  ) : null}
                  {p.sku ? (
                    <p className="truncate text-[10px] font-semibold text-ink">
                      Cód: {p.sku}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost flex-1 py-1 text-[10px]"
                      onClick={() => openEdit(p.id)}
                      disabled={editBusy}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={`btn btn-ghost flex-1 py-1 text-[10px] ${
                        p.active ? 'text-accent' : 'text-[var(--ok)]'
                      }`}
                      onClick={() => void setProductActive(p, !p.active)}
                    >
                      {p.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                  {!p.active ? (
                    <p className="mt-1 text-[10px] font-semibold text-muted">
                      Inativo na vitrine
                    </p>
                  ) : null}
                  {canDeleteProduct(p) ? (
                    <button
                      type="button"
                      className="mt-1 w-full text-left text-[10px] text-muted underline"
                      onClick={() => void removeProduct(p)}
                    >
                      Excluir de vez (sem pedidos)
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        label="produtos"
        onPageChange={(next) => {
          setPage(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />


      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-product-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreate();
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden border border-line bg-white shadow-xl sm:max-w-3xl sm:rounded-md">
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="create-product-title" className="text-base font-bold">
                    Novo produto
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Etapa {createStep + 1} de {CREATE_STEPS.length}:{' '}
                    {CREATE_STEPS[createStep].title}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 py-1.5 text-xs"
                  onClick={closeCreate}
                  disabled={loading}
                >
                  Fechar
                </button>
              </div>

              <ol className="mt-3 flex gap-1.5" aria-label="Progresso">
                {CREATE_STEPS.map((step, i) => {
                  const done = i < createStep;
                  const current = i === createStep;
                  return (
                    <li key={step.id} className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="w-full text-left"
                        disabled={loading || i > createStep}
                        onClick={() => {
                          if (i < createStep) {
                            setError('');
                            setCreateStep(i);
                          }
                        }}
                      >
                        <span
                          className={`mb-1 block h-1.5 rounded-full ${
                            done || current ? 'bg-ink' : 'bg-zinc-200'
                          }`}
                        />
                        <span
                          className={`block truncate text-[10px] font-semibold sm:text-[11px] ${
                            current ? 'text-ink' : 'text-muted'
                          }`}
                        >
                          <span className="sm:hidden">{step.short}</span>
                          <span className="hidden sm:inline">{step.title}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (createStep < CREATE_STEPS.length - 1) {
                  goNextStep();
                  return;
                }
                void onCreate(e);
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div
                id="create-product-scroll"
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
              >
                {createStep === 0 ? (
                  <div className="form-grid md:grid-cols-2">
                <div>
                  <label className="label">Nome do produto</label>
                  <input
                    className="field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    placeholder="Ex.: Camiseta básica, Shampoo 500ml…"
                  />
                  <FieldHint>
                    Como o cliente vai ver na loja e no pedido.
                  </FieldHint>
                </div>
                <div>
                  <label className="label">
                    Categoria <span className="text-accent">*</span>
                  </label>
                  <select
                    className="field"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Escolha onde o produto aparece…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <FieldHint>
                    Obrigatório. Organize a vitrine (ex.: Masculino, Promoções).
                  </FieldHint>
                </div>
                <div>
                  <label className="label">Marca (opcional)</label>
                  <input
                    className="field"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex.: Nike, Natura…"
                  />
                  <FieldHint>Aparece junto ao nome na listagem.</FieldHint>
                </div>
                <div>
                  <label className="label">Código do produto / código de barras</label>
                  <input
                    className="field"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Opcional · ex.: 7891234567890"
                    autoComplete="off"
                  />
                  <FieldHint>
                    Para controle interno e impressão do pedido. Não é
                    obrigatório.
                  </FieldHint>
                </div>
                <div>
                  <label className="label">NCM — código fiscal (opcional)</label>
                  <input
                    className="field"
                    value={ncm}
                    onChange={(e) => setNcm(e.target.value)}
                    placeholder="8 números · só se emitir nota"
                    inputMode="numeric"
                    maxLength={10}
                  />
                  <FieldHint>
                    Usado em NFC-e / nota fiscal. Pode deixar em branco.
                  </FieldHint>
                </div>
                <div className="md:col-span-2">
                  <label className="label">Descrição do produto</label>
                  <textarea
                    className="field min-h-[72px] resize-y"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Conte material, uso, cuidados… o cliente lê isso na página do produto."
                  />
                  <FieldHint>
                    Texto livre. Ajuda o cliente a decidir a compra.
                  </FieldHint>
                </div>
                <div className="md:col-span-2">
                  <label className="label">
                    Fotos do produto (até {MAX_PHOTOS})
                  </label>
                  <input
                    className="field"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      onPickFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <FieldHint>
                    A primeira foto é a capa na vitrine. JPG, PNG ou WebP.
                  </FieldHint>
                  {previews.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {previews.map((p, i) => (
                        <div
                          key={`${p.name}-${i}`}
                          className="relative h-16 w-16 overflow-hidden border border-line bg-[#eee]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute right-0 top-0 bg-black/70 px-1 text-[10px] text-white"
                            onClick={() =>
                              setFiles((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                  </div>
                ) : null}

                {createStep === 1 ? (
                  <div className="form-grid md:grid-cols-2">
                <div>
                  <label className="label">Preço antigo / “de” (opcional)</label>
                  <input
                    className="field"
                    type="number"
                    step="0.01"
                    min="0"
                    value={compareAt}
                    onChange={(e) => setCompareAt(e.target.value)}
                    placeholder="Ex.: 99,90"
                    autoFocus
                  />
                  <FieldHint>
                    Valor riscado na vitrine para mostrar desconto. Deixe vazio
                    se não houver promoção.
                  </FieldHint>
                </div>
                <div>
                  <label className="label">Preço de venda (R$)</label>
                  <input
                    className="field"
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Ex.: 79,90"
                  />
                  <FieldHint>
                    Quanto o cliente paga. Nas opções, cada variação pode ter
                    preço próprio.
                  </FieldHint>
                </div>
                <div>
                  <label className="label">Parcelas sem juros (opcional)</label>
                  <select
                    className="field"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                  >
                    <option value="">Só com juros no cartão</option>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>
                        Até {n}x sem juros (depois com juros)
                      </option>
                    ))}
                  </select>
                  <FieldHint>
                    Igual Mercado Livre: até Nx o cliente vê sem juros; acima
                    disso (até 12x) aparece com juros. No checkout o cartão
                    segue a mesma lógica.
                  </FieldHint>
                </div>
                <div>
                  <label className="label">Quantidade em estoque</label>
                  <input
                    className="field"
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    disabled={useVariants && draftVariants.length > 0}
                  />
                  <FieldHint>
                    Se na próxima etapa você criar opções (P/M/G…), o estoque
                    será por opção — este campo fica só como referência.
                  </FieldHint>
                </div>
                  </div>
                ) : null}

                {createStep === 2 ? (
                  <div className="space-y-3">
                <div>
                  <p className="text-sm font-bold">Medidas da embalagem</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Usadas para calcular frete. Informe o pacote fechado.
                  </p>
                </div>
                <div className="form-grid md:grid-cols-2">
                <div>
                  <label className="label">Peso do pacote (kg)</label>
                  <input
                    className="field"
                    type="number"
                    step="0.001"
                    min="0.01"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    autoFocus
                  />
                  <FieldHint>Ex.: 0,3 = 300 gramas.</FieldHint>
                </div>
                <div>
                  <label className="label">Largura do pacote (cm)</label>
                  <input
                    className="field"
                    type="number"
                    step="0.1"
                    min="1"
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Altura do pacote (cm)</label>
                  <input
                    className="field"
                    type="number"
                    step="0.1"
                    min="1"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Comprimento do pacote (cm)</label>
                  <input
                    className="field"
                    type="number"
                    step="0.1"
                    min="1"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(e.target.value)}
                  />
                </div>
                </div>
                  </div>
                ) : null}

                {createStep === 3 ? (
                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={useVariants}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setUseVariants(on);
                          if (!on) {
                            setAxes([]);
                            setDraftVariants([]);
                          }
                        }}
                      />
                      <span>
                        Este produto tem opções diferentes
                        <span className="mt-0.5 block text-xs font-normal text-muted">
                          Ex.: tamanhos P/M/G, cores, 250ml/500ml. Cada opção
                          tem estoque (e pode ter preço) separado. O cliente só
                          escolhe o que ainda tem estoque.
                        </span>
                      </span>
                    </label>

                  {useVariants ? (
                    <>
                      <div className="rounded border border-line bg-[#fafafa] p-3">
                        <p className="text-xs font-bold text-ink">
                          1) Comece por um modelo pronto (opcional)
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          Clique no tipo do produto. Depois marque as opções
                          (ex.: P, M e as cores) e gere as combinações.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {AXIS_TEMPLATES.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className="btn btn-ghost py-1.5 text-xs"
                              onClick={() => applyTemplate(t.id)}
                              title={t.hint}
                            >
                              {t.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="btn btn-ghost py-1.5 text-xs"
                            onClick={addEmptyAxis}
                          >
                            + Criar tipo de opção do zero
                          </button>
                        </div>
                      </div>

                      {axes.map((axis, axisIndex) => {
                        const chips = Array.from(
                          new Set([...axis.presets, ...axis.selected]),
                        );
                        const asColor = isColorAxis(axis);
                        return (
                          <div
                            key={axis.id}
                            className="space-y-2 rounded border border-line p-3"
                          >
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="min-w-[160px] flex-1">
                                <label className="label">
                                  Tipo de opção {axisIndex + 1}
                                </label>
                                <input
                                  className="field"
                                  value={axis.label}
                                  onChange={(e) =>
                                    updateAxis(axis.id, {
                                      label: e.target.value,
                                    })
                                  }
                                  placeholder="Ex.: Tamanho, Cor, Volume"
                                />
                                <FieldHint>
                                  O cliente vê esse nome na página do produto
                                  (ex.: “Escolha a cor”).
                                </FieldHint>
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost text-accent"
                                onClick={() => removeAxis(axis.id)}
                              >
                                Remover
                              </button>
                            </div>
                            <p className="text-xs font-semibold text-ink">
                              {asColor
                                ? '2) Selecione as cores disponíveis (clique para marcar)'
                                : '2) Selecione os valores disponíveis (clique para marcar)'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {chips.map((opt) => {
                                const on = axis.selected.includes(opt);
                                const hex = asColor ? colorHex(opt) : null;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={`inline-flex items-center gap-2 border px-2.5 py-1.5 text-xs font-medium transition ${
                                      on
                                        ? 'border-ink bg-ink text-white ring-2 ring-ink/20'
                                        : 'border-line bg-white text-ink hover:border-ink/40'
                                    }`}
                                    onClick={() =>
                                      toggleAxisOption(axis.id, opt)
                                    }
                                    aria-pressed={on}
                                  >
                                    {asColor ? (
                                      <span
                                        className="h-4 w-4 shrink-0 rounded-full border border-black/15 shadow-inner"
                                        style={{
                                          backgroundColor: hex || '#d4d4d4',
                                        }}
                                        aria-hidden
                                      />
                                    ) : null}
                                    <span>{opt}</span>
                                    {on ? (
                                      <span className="text-[10px] opacity-80">
                                        ✓
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                            {asColor ? (
                              <div className="flex flex-wrap items-end gap-2">
                                <div className="min-w-[120px] flex-1">
                                  <label className="label">
                                    Adicionar outra cor (nome)
                                  </label>
                                  <input
                                    className="field"
                                    value={axis.customInput}
                                    onChange={(e) =>
                                      updateAxis(axis.id, {
                                        customInput: e.target.value,
                                      })
                                    }
                                    placeholder="Ex.: Marsala, Off-white…"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addCustomOption(axis.id);
                                      }
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-ghost shrink-0"
                                  onClick={() => addCustomOption(axis.id)}
                                >
                                  Incluir cor
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-end gap-2">
                                <div className="min-w-[120px] flex-1">
                                  <label className="label">
                                    Adicionar outro valor
                                  </label>
                                  <input
                                    className="field"
                                    value={axis.customInput}
                                    onChange={(e) =>
                                      updateAxis(axis.id, {
                                        customInput: e.target.value,
                                      })
                                    }
                                    placeholder="Ex.: GG, 750ml, 42…"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addCustomOption(axis.id);
                                      }
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-ghost shrink-0"
                                  onClick={() => addCustomOption(axis.id)}
                                >
                                  Incluir
                                </button>
                              </div>
                            )}
                            <FieldHint>
                              Marcado = o cliente poderá escolher. Sem estoque
                              depois, a opção some/bloqueia na loja.
                            </FieldHint>
                          </div>
                        );
                      })}

                      <div className="rounded border border-dashed border-line p-3">
                        <p className="text-xs font-bold text-ink">
                          3) Gerar as combinações e definir estoque / preço
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          Ex.: tamanho M + cor Preto vira uma linha com estoque
                          próprio. Preço vazio = usa o preço de venda acima.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn"
                            onClick={generateCombinations}
                            disabled={axes.length === 0}
                          >
                            Gerar combinações
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={addManualVariantRow}
                          >
                            + Adicionar opção manual
                          </button>
                          {draftVariants.length > 0 ? (
                            <button
                              type="button"
                              className="btn btn-ghost text-accent"
                              onClick={() => setDraftVariants([])}
                            >
                              Limpar lista
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {draftVariants.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted">
                            {draftVariants.length} opção(ões) · estoque total{' '}
                            {variantStockSum}
                          </p>
                          {draftVariants.map((v, idx) => (
                            <div
                              key={v.key}
                              className="grid gap-2 border border-line p-3 sm:grid-cols-2"
                            >
                              <div className="sm:col-span-2">
                                <label className="label">
                                  Nome que o cliente vê
                                </label>
                                <input
                                  className="field"
                                  value={v.label}
                                  onChange={(e) =>
                                    setDraftVariants((prev) =>
                                      prev.map((row, i) =>
                                        i === idx
                                          ? { ...row, label: e.target.value }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                                <FieldHint>
                                  Ex.: “M / Preto” ou “500ml”.
                                </FieldHint>
                              </div>
                              <div>
                                <label className="label">
                                  Estoque desta opção
                                </label>
                                <input
                                  className="field"
                                  type="number"
                                  min="0"
                                  value={v.stock}
                                  onChange={(e) =>
                                    setDraftVariants((prev) =>
                                      prev.map((row, i) =>
                                        i === idx
                                          ? { ...row, stock: e.target.value }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                                <FieldHint>
                                  Quantas unidades desta combinação você tem.
                                </FieldHint>
                              </div>
                              <div>
                                <label className="label">
                                  Preço só desta opção (opcional)
                                </label>
                                <input
                                  className="field"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={v.price}
                                  onChange={(e) =>
                                    setDraftVariants((prev) =>
                                      prev.map((row, i) =>
                                        i === idx
                                          ? { ...row, price: e.target.value }
                                          : row,
                                      ),
                                    )
                                  }
                                  placeholder={
                                    price
                                      ? `Vazio = R$ ${price}`
                                      : 'Vazio = preço padrão'
                                  }
                                />
                                <FieldHint>
                                  Preencha se GG ou 1L custar diferente.
                                </FieldHint>
                              </div>
                              <div>
                                <label className="label">
                                  Código interno (SKU)
                                </label>
                                <input
                                  className="field"
                                  value={v.sku}
                                  onChange={(e) =>
                                    setDraftVariants((prev) =>
                                      prev.map((row, i) =>
                                        i === idx
                                          ? { ...row, sku: e.target.value }
                                          : row,
                                      ),
                                    )
                                  }
                                  placeholder="Opcional"
                                />
                              </div>
                              <div>
                                <label className="label">Código de barras</label>
                                <input
                                  className="field"
                                  value={v.barcode}
                                  onChange={(e) =>
                                    setDraftVariants((prev) =>
                                      prev.map((row, i) =>
                                        i === idx
                                          ? {
                                              ...row,
                                              barcode: e.target.value,
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                  placeholder="Opcional"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <button
                                  type="button"
                                  className="btn btn-ghost text-accent"
                                  onClick={() =>
                                    setDraftVariants((prev) =>
                                      prev.filter((_, i) => i !== idx),
                                    )
                                  }
                                >
                                  Remover esta opção
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="rounded border border-line bg-[#fafafa] p-3 text-xs text-muted">
                      Sem opções extras: o cliente compra o produto único com o
                      estoque da etapa Preço. Ative acima se tiver tamanho, cor,
                      ml etc.
                    </p>
                  )}
                  </div>
                ) : null}

                {error ? (
                  <p className="mt-3 text-sm text-accent">{error}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={createStep === 0 ? closeCreate : goPrevStep}
                  disabled={loading}
                >
                  {createStep === 0 ? 'Cancelar' : 'Voltar'}
                </button>
                <div className="flex flex-wrap gap-2">
                  {createStep < CREATE_STEPS.length - 1 ? (
                    <button type="submit" className="btn" disabled={loading}>
                      Continuar
                    </button>
                  ) : (
                    <button type="submit" className="btn" disabled={loading}>
                      {loading ? 'Salvando...' : 'Adicionar produto'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editForm ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !editBusy) setEditForm(null);
          }}
        >
          <form
            onSubmit={saveEdit}
            className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden border border-line bg-white shadow-xl sm:max-w-2xl sm:rounded-md"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-base font-bold">Editar produto</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Altere dados, estoque e preços das opções
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost shrink-0 py-1.5 text-xs"
                disabled={editBusy}
                onClick={() => setEditForm(null)}
              >
                Fechar
              </button>
            </div>

            <div className="form-grid min-h-0 flex-1 overflow-y-auto px-4 py-4 md:grid-cols-2">
              {error ? (
                <p className="text-sm text-accent md:col-span-2">{error}</p>
              ) : null}
              <div>
                <label className="label">Nome</label>
                <input
                  className="field"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select
                  className="field"
                  value={editForm.categoryId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, categoryId: e.target.value })
                  }
                  required
                >
                  <option value="">Selecione…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Preço de venda (R$)</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price}
                  onChange={(e) =>
                    setEditForm({ ...editForm, price: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="label">Preço antigo “de” (opcional)</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.compareAt}
                  onChange={(e) =>
                    setEditForm({ ...editForm, compareAt: e.target.value })
                  }
                />
              </div>
              {!editForm.hasVariants ? (
                <div>
                  <label className="label">Estoque</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    value={editForm.stock}
                    onChange={(e) =>
                      setEditForm({ ...editForm, stock: e.target.value })
                    }
                  />
                </div>
              ) : null}
              <div>
                <label className="label">Marca</label>
                <input
                  className="field"
                  value={editForm.brand}
                  onChange={(e) =>
                    setEditForm({ ...editForm, brand: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Código / SKU</label>
                <input
                  className="field"
                  value={editForm.sku}
                  onChange={(e) =>
                    setEditForm({ ...editForm, sku: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Descrição</label>
                <textarea
                  className="field min-h-[72px] resize-y"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Peso (kg)</label>
                <input
                  className="field"
                  type="number"
                  step="0.001"
                  min="0.01"
                  value={editForm.weightKg}
                  onChange={(e) =>
                    setEditForm({ ...editForm, weightKg: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Largura (cm)</label>
                <input
                  className="field"
                  type="number"
                  step="0.1"
                  min="1"
                  value={editForm.widthCm}
                  onChange={(e) =>
                    setEditForm({ ...editForm, widthCm: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Altura (cm)</label>
                <input
                  className="field"
                  type="number"
                  step="0.1"
                  min="1"
                  value={editForm.heightCm}
                  onChange={(e) =>
                    setEditForm({ ...editForm, heightCm: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Comprimento (cm)</label>
                <input
                  className="field"
                  type="number"
                  step="0.1"
                  min="1"
                  value={editForm.lengthCm}
                  onChange={(e) =>
                    setEditForm({ ...editForm, lengthCm: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(e) =>
                      setEditForm({ ...editForm, active: e.target.checked })
                    }
                  />
                  Produto ativo na vitrine
                </label>
              </div>

              {editForm.hasVariants ? (
                <div className="md:col-span-2 space-y-2 border-t border-line pt-3">
                  <p className="text-sm font-bold">
                    Opções / estoque por variação
                  </p>
                  <p className="text-xs text-muted">
                    Cada linha é uma combinação (ex.: M / Preto) com estoque e
                    preço próprios.
                  </p>
                  {editForm.variants.map((v, idx) => (
                    <div
                      key={v.id || idx}
                      className="grid gap-2 border border-line p-2 sm:grid-cols-3"
                    >
                      <div className="sm:col-span-3">
                        <label className="label">Opção</label>
                        <input
                          className="field"
                          value={v.label}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              variants: editForm.variants.map((row, i) =>
                                i === idx
                                  ? { ...row, label: e.target.value }
                                  : row,
                              ),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="label">Estoque</label>
                        <input
                          className="field"
                          type="number"
                          min="0"
                          value={v.stock}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              variants: editForm.variants.map((row, i) =>
                                i === idx
                                  ? { ...row, stock: e.target.value }
                                  : row,
                              ),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="label">Preço (opc.)</label>
                        <input
                          className="field"
                          type="number"
                          step="0.01"
                          min="0"
                          value={v.price}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              variants: editForm.variants.map((row, i) =>
                                i === idx
                                  ? { ...row, price: e.target.value }
                                  : row,
                              ),
                            })
                          }
                          placeholder={editForm.price || 'base'}
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          className="btn btn-ghost w-full text-accent"
                          onClick={() =>
                            setEditForm({
                              ...editForm,
                              variants: editForm.variants.filter(
                                (_, i) => i !== idx,
                              ),
                            })
                          }
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn btn-ghost ${
                    editForm.active ? 'text-accent' : 'text-[var(--ok)]'
                  }`}
                  disabled={editBusy}
                  onClick={() => {
                    void setProductActive(
                      {
                        id: editForm.id,
                        name: editForm.name,
                        price: editForm.price,
                        stock: Number(editForm.stock) || 0,
                        active: editForm.active,
                        images: [],
                        _count: { orderItems: editForm.orderItemsCount },
                      },
                      !editForm.active,
                    );
                  }}
                >
                  {editForm.active ? 'Desativar' : 'Ativar'}
                </button>
                {editForm.orderItemsCount === 0 ? (
                  <button
                    type="button"
                    className="btn btn-ghost text-accent"
                    disabled={editBusy}
                    onClick={() => {
                      void removeProduct({
                        id: editForm.id,
                        name: editForm.name,
                        price: editForm.price,
                        stock: Number(editForm.stock) || 0,
                        active: editForm.active,
                        images: [],
                        _count: { orderItems: 0 },
                      });
                    }}
                  >
                    Excluir de vez
                  </button>
                ) : (
                  <span className="self-center text-xs text-muted">
                    Já teve pedidos — só desativar
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={editBusy}
                  onClick={() => setEditForm(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={editBusy}>
                  {editBusy ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
      {confirmDialog}
    </div>
  );
}
