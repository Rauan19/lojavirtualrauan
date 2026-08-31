/*
 * Gera os banners da vitrine da Perfumaria SDG a partir das fotos reais do
 * catálogo e grava os três no carrossel da loja.
 *
 *   node scripts/banner-perfumaria.mjs
 *
 * O banner anterior anunciava marcas que não existem mais na loja (vieram do
 * catálogo de exemplo) e trazia um placeholder não preenchido no rodapé.
 *
 * Duas decisões de layout que valem explicar:
 *
 * 1. Painel colorido à esquerda, branco puro à direita. A primeira versão
 *    usava degradê claro no banner inteiro e os quadrados brancos das fotos
 *    apareceram como retângulos. Recortar o fundo resolveria, mas frasco de
 *    vidro claro — Libre, J'adore — sai com franja. Encostar branco no branco
 *    é a emenda que não aparece.
 *
 * 2. No máximo quatro frascos. Com cinco o último saía cortado na borda.
 *
 * Os três compartilham estrutura, tipografia e o fio dourado; só o tom do
 * painel e o conteúdo mudam. Num carrossel o olho não deve ter que reaprender
 * o layout a cada troca.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const prisma = new PrismaClient();

const STORE_ID = 'cms7uhedd0000vkoc8at15jh0';
const DEST = `uploads/${STORE_ID}`;
const LOGO = `${DEST}/0d8920a1-c3c6-47b1-87d1-85c1071f50f2.png`;

const W = 1600;
const H = 640;
const PAINEL = 560;

/** Roxo da loja, o mesmo que o lojista escolheu no painel. */
const ROXO = '#422e56';
const OURO = '#e8c98a';

const mapa = JSON.parse(readFileSync('perfumes-map.json', 'utf8'));
const arquivo = (chave) => path.join(DEST, path.basename(mapa[chave]));

const BANNERS = [
  {
    nome: 'institucional',
    painel: ['#4d3663', '#2b1d3a'],
    linhas: ['Originais, com', 'nota fiscal e'],
    destaque: 'entrega em todo o Brasil',
    apoio: 'Importados e nacionais · parcelamos no cartão',
    cta: 'Ver todos os perfumes',
    frascos: [
      { foto: 'perfume4.jpg', altura: 300 }, // Libre
      { foto: 'perfume1.jpg', altura: 335 }, // 1 Million
      { foto: 'perfume2.jpg', altura: 325 }, // Sauvage
      { foto: 'perfume5.jpg', altura: 305 }, // J'adore
    ],
  },
  {
    nome: 'femininos',
    painel: ['#7a3f66', '#3a1f33'],
    linhas: ['Femininos que', 'ficam na'],
    destaque: 'memória de quem passa',
    apoio: 'Dior, Yves Saint Laurent e O Boticário',
    cta: 'Ver femininos',
    frascos: [
      { foto: 'perfume5.jpg', altura: 330 }, // J'adore
      { foto: 'perfume4.jpg', altura: 310 }, // Libre
      { foto: 'perfume6.jpg', altura: 335 }, // Floratta Red Passion
    ],
  },
  {
    nome: 'masculinos',
    painel: ['#33294a', '#15111f'],
    linhas: ['Os masculinos', 'mais pedidos,'],
    destaque: 'com preço que cabe',
    apoio: '1 Million, Sauvage, Le Male e 212 VIP Black',
    cta: 'Ver masculinos',
    frascos: [
      { foto: 'perfume1.jpg', altura: 320 }, // 1 Million
      { foto: 'perfume8.jpg', altura: 350 }, // Le Male
      { foto: 'perfume2.jpg', altura: 325 }, // Sauvage
      { foto: '212.jpg', altura: 335 }, // 212 VIP Black
    ],
  },
];

function svgFundo(b) {
  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="painel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${b.painel[0]}" />
      <stop offset="100%" stop-color="${b.painel[1]}" />
    </linearGradient>
    <linearGradient id="fio" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c9a75f" stop-opacity="0" />
      <stop offset="50%" stop-color="#c9a75f" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#c9a75f" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="chao" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ROXO}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="${ROXO}" stop-opacity="0" />
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#ffffff" />
  <rect width="${PAINEL}" height="${H}" fill="url(#painel)" />
  <rect x="${PAINEL}" y="0" width="3" height="${H}" fill="url(#fio)" />

  <text x="64" y="318" font-family="Georgia, 'Times New Roman', serif" font-size="38" fill="#ffffff">${b.linhas[0]}</text>
  <text x="64" y="366" font-family="Georgia, 'Times New Roman', serif" font-size="38" fill="#ffffff">${b.linhas[1]}</text>
  <text x="64" y="414" font-family="Georgia, 'Times New Roman', serif" font-size="36" font-weight="bold" fill="${OURO}">${b.destaque}</text>

  <text x="64" y="462" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#d8cee4">${b.apoio}</text>

  <rect x="64" y="492" width="256" height="54" rx="27" fill="#ffffff" />
  <text x="192" y="527" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="${ROXO}" text-anchor="middle">${b.cta}</text>

  <text x="64" y="596" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#b3a6c2">@sdgperfumaria</text>

  <!-- sombra rasa sob os frascos, para não flutuarem no branco -->
  <ellipse cx="1075" cy="560" rx="400" ry="13" fill="url(#chao)" />
</svg>`;
}

/**
 * Distribui os frascos no espaço branco, centralizados no conjunto e
 * alinhados pela base. Centralizar importa porque os banners têm 3 ou 4
 * frascos: com posição fixa, o de 3 ficaria torto.
 */
async function montarFrascos(frascos) {
  /*
   * As fotos são quadradas com o frasco centralizado, então cada uma traz
   * bastante margem branca. Avançar 72% da largura encosta os frascos sem
   * sobrepor o produto em si.
   */
  const AVANCO = 0.72;
  const MARGEM = 24;
  const disponivel = W - PAINEL - MARGEM * 2;

  // como as fotos são quadradas, largura = altura
  const larguraCrua =
    frascos.slice(0, -1).reduce((s, f) => s + f.altura * AVANCO, 0) +
    frascos[frascos.length - 1].altura;

  /*
   * Se o conjunto não couber, encolhe todo mundo na mesma proporção. Sem
   * isso, centralizar um grupo maior que o espaço empurrava o primeiro
   * frasco para dentro do painel roxo, e o quadrado branco da foto recortava
   * um pedaço do painel.
   */
  const escala = larguraCrua > disponivel ? disponivel / larguraCrua : 1;

  const artes = [];
  for (const f of frascos) {
    const altura = Math.round(f.altura * escala);
    const buf = await sharp(arquivo(f.foto)).resize({ height: altura }).toBuffer();
    const meta = await sharp(buf).metadata();
    artes.push({
      buf,
      largura: meta.width ?? altura,
      altura: meta.height ?? altura,
    });
  }

  const larguraTotal =
    artes.slice(0, -1).reduce((s, a) => s + a.largura * AVANCO, 0) +
    artes[artes.length - 1].largura;

  let x = PAINEL + MARGEM + (disponivel - larguraTotal) / 2;
  const BASE_Y = 560;

  return artes.map((a) => {
    const camada = { input: a.buf, left: Math.round(x), top: BASE_Y - a.altura };
    x += a.largura * AVANCO;
    return camada;
  });
}

const logo = await sharp(LOGO).resize({ height: 150 }).toBuffer();
const urls = [];

for (const b of BANNERS) {
  const base = await sharp(Buffer.from(svgFundo(b))).png().toBuffer();
  const camadas = [
    { input: logo, left: 72, top: 72 },
    ...(await montarFrascos(b.frascos)),
  ];
  const jpg = await sharp(base)
    .composite(camadas)
    .jpeg({ quality: 90 })
    .toBuffer();

  const nome = `${randomUUID()}.jpg`;
  writeFileSync(path.join(DEST, nome), jpg);
  const url = `/uploads/${STORE_ID}/${nome}`;
  urls.push(url);
  console.log(
    `${b.nome.padEnd(15)} ${url}  (${(jpg.length / 1024).toFixed(0)} KB)`,
  );
}

await prisma.store.update({
  where: { id: STORE_ID },
  data: { marqueeImages: urls, marqueeEnabled: true },
});
console.log(`\n${urls.length} banners no carrossel da loja.`);

await prisma.$disconnect();
