/*
 * Catálogo de produtos da Perfumaria SDG.
 *
 *   node scripts/categorias-perfumaria.mjs   (a árvore de categorias)
 *   node scripts/catalogo-perfumaria.mjs     (os produtos)
 *
 * Este arquivo é a fonte da verdade dos produtos: o que está na lista existe
 * na loja, o que não está é removido. As categorias são referenciadas por
 * slug e vêm do outro script — rode-o antes se mexer na árvore.
 *
 * Apagar produto é seguro porque OrderItem.productId é SetNull e o item
 * guarda o nome do produto no momento da compra: o histórico de pedidos e a
 * contabilidade continuam de pé.
 */

import { readFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const STORE_ID = 'cms7uhedd0000vkoc8at15jh0';

const img = JSON.parse(readFileSync('perfumes-map.json', 'utf8'));

/*
 * Preço e estoque são de exemplo — o lojista ajusta no painel. O que precisa
 * estar certo aqui é a estrutura: nome, marca, categoria e foto.
 */
const PRODUTOS = [
  // ---------- masculinos importados ----------
  {
    name: '1 Million Eau de Toilette 100ml',
    brand: 'Paco Rabanne',
    price: 549.9,
    compareAt: 699.9,
    stock: 12,
    categoria: 'masculinos-importados',
    foto: 'perfume1.jpg',
    description:
      'Fragrância masculina amadeirada e especiada, com notas de canela, couro e âmbar. Frasco de 100ml.',
  },
  {
    name: 'Sauvage Eau de Parfum 100ml',
    brand: 'Dior',
    price: 749.9,
    compareAt: 899.9,
    stock: 8,
    categoria: 'masculinos-importados',
    foto: 'perfume2.jpg',
    description:
      'Fragrância masculina fresca e intensa, com bergamota da Calábria e baunilha. Frasco de 100ml.',
  },
  {
    name: 'Le Male Le Parfum 125ml',
    brand: 'Jean Paul Gaultier',
    price: 689.9,
    stock: 6,
    categoria: 'masculinos-importados',
    foto: 'perfume8.jpg',
    description:
      'Fragrância masculina oriental amadeirada, com lavanda, cardamomo e baunilha. Frasco de 125ml.',
  },
  {
    name: '212 VIP Black Eau de Parfum 100ml',
    brand: 'Carolina Herrera',
    price: 629.9,
    compareAt: 749.9,
    stock: 9,
    categoria: 'masculinos-importados',
    foto: '212.jpg',
    description:
      'Fragrância masculina intensa, com absinto, lavanda e baunilha negra. Frasco de 100ml.',
  },

  // ---------- masculinos nacionais ----------
  {
    name: 'O.U.i Iconique 001 Eau de Parfum 75ml',
    brand: 'O.U.i',
    price: 229.9,
    stock: 15,
    categoria: 'masculinos-nacionais',
    foto: 'perfume3.jpg',
    description:
      'Fragrância masculina amadeirada com notas cítricas e especiadas. Frasco de 75ml.',
  },

  // ---------- femininos importados ----------
  {
    name: 'Libre Eau de Parfum 50ml',
    brand: 'Yves Saint Laurent',
    price: 699.9,
    compareAt: 829.9,
    stock: 7,
    categoria: 'femininos-importados',
    foto: 'perfume4.jpg',
    description:
      'Fragrância feminina floral com lavanda, flor de laranjeira e baunilha. Frasco de 50ml.',
  },
  {
    name: "J'adore Eau de Parfum 100ml",
    brand: 'Dior',
    price: 899.9,
    stock: 5,
    categoria: 'femininos-importados',
    foto: 'perfume5.jpg',
    description:
      'Fragrância feminina floral com ylang-ylang, rosa de damasco e jasmim. Frasco de 100ml.',
  },
  {
    name: 'Fame Parfum 80ml',
    brand: 'Paco Rabanne',
    price: 799.9,
    compareAt: 949.9,
    stock: 6,
    categoria: 'femininos-importados',
    foto: 'perfume9.jpg',
    description:
      'Fragrância feminina floral amadeirada, com manga, jasmim e sândalo. Frasco recarregável de 80ml.',
  },
  {
    name: 'La Vie Est Belle Eau de Parfum 50ml',
    brand: 'Lancôme',
    price: 649.9,
    compareAt: 779.9,
    stock: 7,
    categoria: 'femininos-importados',
    foto: 'perfume10.jpg',
    description:
      'Fragrância feminina doce e floral, com íris, patchouli e baunilha. Frasco de 50ml.',
  },

  // ---------- femininos nacionais ----------
  {
    name: 'Floratta Red Passion Eau de Parfum 75ml',
    brand: 'O Boticário',
    price: 169.9,
    compareAt: 199.9,
    stock: 20,
    categoria: 'femininos-nacionais',
    foto: 'perfume6.jpg',
    description:
      'Fragrância feminina floral frutada, com frutas vermelhas e baunilha. Frasco de 75ml.',
  },

  // ---------- árabes ----------
  {
    name: 'Fakhar Gold Extrait de Parfum 100ml',
    brand: 'Lattafa',
    price: 219.9,
    compareAt: 279.9,
    stock: 18,
    categoria: 'arabes',
    foto: 'perfume11arabe.jpg',
    description:
      'Fragrância árabe unissex, doce e amadeirada, com alta fixação. Frasco de 100ml.',
  },
  {
    name: 'Attar Al Wesal Eau de Parfum 100ml',
    /*
     * A embalagem não mostra o fabricante e não dá para ler a marca na foto.
     * Fica em branco de propósito — o lojista preenche no painel. Melhor
     * campo vazio que marca inventada na ficha do produto.
     */
    brand: null,
    price: 189.9,
    stock: 14,
    categoria: 'arabes',
    foto: 'perfume12.jpg',
    description:
      'Fragrância árabe amadeirada e especiada, de longa duração. Frasco de 100ml.',
  },
  {
    name: 'Royal Amber Eau de Parfum 80ml',
    brand: 'Orientica',
    price: 329.9,
    compareAt: 399.9,
    stock: 10,
    categoria: 'arabes',
    foto: 'perfume13.jpg',
    description:
      'Fragrância árabe da Luxury Collection, com âmbar, baunilha e madeiras nobres. Frasco de 80ml.',
  },

  // ---------- contratipos ----------
  {
    name: 'Contratipo Amadeirado Intenso 100ml',
    brand: 'Perfumaria SDG',
    price: 89.9,
    compareAt: 119.9,
    stock: 30,
    categoria: 'contratipos',
    foto: 'perfume7.avif',
    description:
      'Fragrância amadeirada de alta fixação, inspirada nos importados. Frasco de 100ml.',
  },
];

function slugify(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const loja = await prisma.store.findUniqueOrThrow({
  where: { id: STORE_ID },
  select: { name: true, slug: true },
});
console.log(`Loja: ${loja.name} (/${loja.slug})\n`);

const categorias = await prisma.category.findMany({
  where: { storeId: STORE_ID },
  select: { id: true, slug: true, active: true },
});
const catId = Object.fromEntries(categorias.map((c) => [c.slug, c.id]));

const faltando = [
  ...new Set(PRODUTOS.map((p) => p.categoria).filter((s) => !catId[s])),
];
if (faltando.length) {
  console.error(
    `Categorias inexistentes: ${faltando.join(', ')}\n` +
      'Rode scripts/categorias-perfumaria.mjs antes.',
  );
  process.exit(1);
}

// ---------- produtos ----------
for (const p of PRODUTOS) {
  const slug = slugify(p.name);
  const existente = await prisma.product.findFirst({
    where: { storeId: STORE_ID, slug },
    select: { id: true },
  });
  if (existente) {
    await prisma.productImage.deleteMany({ where: { productId: existente.id } });
    await prisma.product.delete({ where: { id: existente.id } });
  }

  await prisma.product.create({
    data: {
      storeId: STORE_ID,
      categoryId: catId[p.categoria],
      name: p.name,
      slug,
      description: p.description,
      brand: p.brand ?? null,
      price: new Prisma.Decimal(p.price),
      compareAt: p.compareAt ? new Prisma.Decimal(p.compareAt) : null,
      stock: p.stock,
      active: true,
      images: { create: [{ url: img[p.foto], alt: p.name, position: 0 }] },
    },
  });
  console.log(`produto    ${p.name}`);
}

// ---------- remove o que saiu da lista ----------
const novosSlugs = PRODUTOS.map((p) => slugify(p.name));
const antigos = await prisma.product.findMany({
  where: { storeId: STORE_ID, slug: { notIn: novosSlugs } },
  select: { id: true },
});
if (antigos.length) {
  const ids = antigos.map((a) => a.id);
  const vinculos = await prisma.orderItem.count({
    where: { productId: { in: ids } },
  });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  console.log(
    `\nremovidos  ${antigos.length} produtos fora da lista (${vinculos} itens de pedido preservados sem vínculo)`,
  );
}

/*
 * Categoria só vai para a vitrine quando tem produto. Ativar aqui evita o
 * passo manual que ninguém lembra de fazer depois de cadastrar o estoque —
 * e desativar de volta evita prateleira vazia se um produto sair da lista.
 */
const usadas = new Set(PRODUTOS.map((p) => p.categoria));
for (const c of categorias) {
  const temProduto = usadas.has(c.slug);
  // departamento conta os filhos; resolvido depois, na conferência
  if (temProduto && !c.active) {
    await prisma.category.update({
      where: { id: c.id },
      data: { active: true },
    });
    console.log(`ativada    categoria ${c.slug}`);
  }
}

const resumo = await prisma.category.findMany({
  where: { storeId: STORE_ID },
  select: {
    name: true,
    slug: true,
    active: true,
    parentId: true,
    _count: { select: { products: true } },
  },
  orderBy: { name: 'asc' },
});

console.log('\nCatálogo final:');
for (const dep of resumo.filter((c) => !c.parentId)) {
  const filhas = resumo.filter((c) => c.parentId && c.slug.startsWith(`${dep.slug}-`));
  const soma =
    dep._count.products + filhas.reduce((s, f) => s + f._count.products, 0);
  console.log(
    `  ${dep.active ? '●' : '○'} ${dep.name} — ${soma}${dep.active ? '' : ' (inativa)'}`,
  );
  for (const f of filhas) console.log(`      ${f.name} — ${f._count.products}`);
}

const total = await prisma.product.count({ where: { storeId: STORE_ID } });
console.log(`\n${total} produtos.`);

await prisma.$disconnect();
