/*
 * Reorganiza as categorias da Perfumaria SDG.
 *
 *   node scripts/categorias-perfumaria.mjs
 *
 * Duas coisas ao mesmo tempo:
 *
 * 1. Dá profundidade ao que já existe, com departamento > subcategoria. Com 9
 *    produtos não dá para ter 8 prateleiras cheias, mas dá para organizá-los
 *    em dois níveis — que é como uma perfumaria de verdade se apresenta.
 *
 * 2. Deixa prontas, INATIVAS, as categorias que a loja vai usar quando tiver
 *    estoque. Categoria ativa e vazia é pior que categoria faltando: o
 *    cliente clica e encontra prateleira vazia. Inativa não chega na vitrine
 *    (o catálogo público filtra por active), mas já aparece no admin para o
 *    lojista ligar no dia que chegar o produto.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STORE_ID = 'cms7uhedd0000vkoc8at15jh0';

/*
 * O slug é único por loja, então "Importados" de masculino e de feminino
 * precisam de slugs distintos. O nome exibido continua curto: no menu, a
 * subcategoria já aparece embaixo do departamento.
 */
const ARVORE = [
  {
    name: 'Masculinos',
    slug: 'masculinos',
    capaDe: 'perfume1.jpg',
    filhas: [
      { name: 'Importados', slug: 'masculinos-importados' },
      { name: 'Nacionais', slug: 'masculinos-nacionais' },
    ],
  },
  {
    name: 'Femininos',
    slug: 'femininos',
    capaDe: 'perfume5.jpg',
    filhas: [
      { name: 'Importados', slug: 'femininos-importados' },
      { name: 'Nacionais', slug: 'femininos-nacionais' },
    ],
  },
  {
    name: 'Contratipos',
    slug: 'contratipos',
    capaDe: 'perfume7.avif',
    filhas: [],
  },
];

/** Onde cada produto passa a morar, pelo slug. */
const DESTINO = {
  '1-million-eau-de-toilette-100ml': 'masculinos-importados',
  'sauvage-eau-de-parfum-100ml': 'masculinos-importados',
  'le-male-le-parfum-125ml': 'masculinos-importados',
  '212-vip-black-eau-de-parfum-100ml': 'masculinos-importados',
  'o-u-i-iconique-001-eau-de-parfum-75ml': 'masculinos-nacionais',
  'libre-eau-de-parfum-50ml': 'femininos-importados',
  'j-adore-eau-de-parfum-100ml': 'femininos-importados',
  'floratta-red-passion-eau-de-parfum-75ml': 'femininos-nacionais',
  'contratipo-amadeirado-intenso-100ml': 'contratipos',
};

/** Prateleiras que a perfumaria vai querer — entram desligadas, sem estoque. */
const PRONTAS = [
  { name: 'Árabes', slug: 'arabes' },
  { name: 'Kits e presentes', slug: 'kits-e-presentes' },
  { name: 'Body splash e corporais', slug: 'body-splash-e-corporais' },
  { name: 'Miniaturas e decants', slug: 'miniaturas-e-decants' },
  { name: 'Infantis', slug: 'infantis' },
  { name: 'Lançamentos', slug: 'lancamentos' },
];

const atuais = await prisma.category.findMany({
  where: { storeId: STORE_ID },
  select: { id: true, slug: true, imageUrl: true },
});
const capa = Object.fromEntries(atuais.map((c) => [c.slug, c.imageUrl]));
const ids = {};

// ---------- departamentos ----------
for (const dep of ARVORE) {
  const cat = await prisma.category.upsert({
    where: { storeId_slug: { storeId: STORE_ID, slug: dep.slug } },
    update: { name: dep.name, parentId: null, active: true },
    create: {
      storeId: STORE_ID,
      name: dep.name,
      slug: dep.slug,
      imageUrl: capa[dep.slug] ?? null,
      active: true,
    },
  });
  ids[dep.slug] = cat.id;
  console.log(`departamento   ${dep.name}`);
}

// ---------- subcategorias ----------
for (const dep of ARVORE) {
  for (const filha of dep.filhas) {
    const cat = await prisma.category.upsert({
      where: { storeId_slug: { storeId: STORE_ID, slug: filha.slug } },
      update: { name: filha.name, parentId: ids[dep.slug], active: true },
      create: {
        storeId: STORE_ID,
        name: filha.name,
        slug: filha.slug,
        parentId: ids[dep.slug],
        active: true,
      },
    });
    ids[filha.slug] = cat.id;
    console.log(`  subcategoria ${dep.name} › ${filha.name}`);
  }
}

// ---------- realoca os produtos ----------
for (const [slugProduto, slugCategoria] of Object.entries(DESTINO)) {
  const r = await prisma.product.updateMany({
    where: { storeId: STORE_ID, slug: slugProduto },
    data: { categoryId: ids[slugCategoria] },
  });
  if (r.count === 0) console.log(`  ! produto não encontrado: ${slugProduto}`);
}

// ---------- prateleiras prontas, desligadas ----------
for (const p of PRONTAS) {
  await prisma.category.upsert({
    where: { storeId_slug: { storeId: STORE_ID, slug: p.slug } },
    update: {},
    create: {
      storeId: STORE_ID,
      name: p.name,
      slug: p.slug,
      // desligada: só vai para a vitrine quando tiver produto
      active: false,
    },
  });
  console.log(`aguardando     ${p.name} (inativa)`);
}

// ---------- conferência ----------
const todas = await prisma.category.findMany({
  where: { storeId: STORE_ID },
  select: {
    name: true,
    slug: true,
    active: true,
    parentId: true,
    _count: { select: { products: true } },
  },
  orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
});

const ativasVazias = todas.filter((c) => c.active && c._count.products === 0);
const semFilhas = ativasVazias.filter(
  (c) => !todas.some((f) => f.parentId && f.slug.startsWith(`${c.slug}-`)),
);

console.log('\nEstrutura final:');
for (const dep of todas.filter((c) => !c.parentId)) {
  const filhas = todas.filter((c) => c.slug.startsWith(`${dep.slug}-`));
  const soma =
    dep._count.products + filhas.reduce((s, f) => s + f._count.products, 0);
  console.log(
    `  ${dep.active ? '●' : '○'} ${dep.name} — ${soma} produto(s)${
      dep.active ? '' : ' (inativa)'
    }`,
  );
  for (const f of filhas) {
    console.log(`      └ ${f.name} — ${f._count.products}`);
  }
}

if (semFilhas.length) {
  console.log(
    `\nATENÇÃO: ativas e sem produto: ${semFilhas.map((c) => c.name).join(', ')}`,
  );
}

await prisma.$disconnect();
