/*
 * Cria (ou recria) a loja fictícia "Ateliê Lua" usada como exemplo no site:
 * prints da página inicial e o link "Ver uma loja de exemplo". Marca
 * inventada e roupas sem logo, para a landing nunca divulgar a loja de um
 * cliente nem marca de terceiros.
 *
 *   npx ts-node scripts/criar-loja-exemplo.ts
 *
 * Depois, no .env do site: DEMO_STORE_SLUG=atelie-lua
 * As fotos vêm de web/public/lp; logo e banners são gerados em uploads/.
 */
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const p = new PrismaClient();
const LP = join(__dirname, '../../web/public/lp');
const COR = '#8e3a4f';
const COR_CLARA = '#f6ece8';

async function arte(storeId: string) {
  const dir = join(__dirname, '../uploads', storeId);
  mkdirSync(dir, { recursive: true });

  // Logo: só o nome, em serifa
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200">
    <text x="320" y="118" text-anchor="middle" font-family="Georgia, serif" font-size="92" font-style="italic" fill="${COR}">Ateliê Lua</text>
    <text x="320" y="168" text-anchor="middle" font-family="Georgia, serif" font-size="24" letter-spacing="10" fill="${COR}">MODA</text>
  </svg>`;
  await sharp(Buffer.from(logoSvg)).png().toFile(join(dir, 'logo.png'));

  // Cada peça num cartão de canto arredondado (o fundo da foto vira o cartão)
  const peca = async (f: string, w: number, h: number) => {
    const mascara = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="28" fill="#fff"/></svg>`,
    );
    const semMargem = await sharp(join(LP, f))
      .trim({ background: '#ffffff', threshold: 12 })
      .toBuffer();
    // cor do fundo da foto, pegando um canto: a peça inteira cabe e o resto
    // do cartão fica da mesma cor
    const canto = await sharp(semMargem)
      .extract({ left: 2, top: 2, width: 4, height: 4 })
      .raw()
      .toBuffer();
    const fundo = { r: canto[0], g: canto[1], b: canto[2] };
    return sharp(
      await sharp(semMargem)
        .resize(Math.round(w * 0.86), Math.round(h * 0.86), { fit: 'inside' })
        .toBuffer(),
    )
      .extend({ top: 0, bottom: 0, left: 0, right: 0, background: fundo })
      .resize(w, h, { fit: 'contain', background: fundo })
      .composite([{ input: mascara, blend: 'dest-in' }])
      .png()
      .toBuffer();
  };

  // Banner do computador 1600x640
  const textoPc = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640">
    <rect width="640" height="640" fill="${COR}"/>
    <text x="72" y="250" font-family="Georgia, serif" font-size="58" fill="#fff">Nova coleção</text>
    <text x="72" y="320" font-family="Georgia, serif" font-size="58" font-style="italic" fill="#f3d3c9">de inverno</text>
    <text x="72" y="380" font-family="Arial, sans-serif" font-size="24" fill="#f6e4de">Vestidos, camisas e calçados</text>
    <rect x="72" y="420" width="230" height="58" rx="29" fill="#fff"/>
    <text x="187" y="457" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="${COR}">Ver coleção</text>
  </svg>`;
  await sharp({
    create: { width: 1600, height: 640, channels: 3, background: '#ffffff' },
  })
    .composite([
      { input: Buffer.from(textoPc), left: 0, top: 0 },
      {
        input: await peca('lp-moda-vestido.webp', 270, 360),
        left: 700,
        top: 140,
      },
      {
        input: await peca('lp-moda-camisa.webp', 270, 360),
        left: 995,
        top: 140,
      },
      {
        input: await peca('lp-moda-tenis.webp', 270, 360),
        left: 1290,
        top: 140,
      },
    ])
    .jpeg({ quality: 86 })
    .toFile(join(dir, 'banner-1.jpg'));

  // Segundo banner: frete
  const textoPc2 = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640">
    <rect width="640" height="640" fill="${COR_CLARA}"/>
    <text x="72" y="270" font-family="Georgia, serif" font-size="58" fill="${COR}">Frete grátis</text>
    <text x="72" y="340" font-family="Georgia, serif" font-size="40" font-style="italic" fill="${COR}">acima de R$ 299</text>
    <rect x="72" y="400" width="230" height="58" rx="29" fill="${COR}"/>
    <text x="187" y="437" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#fff">Aproveitar</text>
  </svg>`;
  await sharp({
    create: { width: 1600, height: 640, channels: 3, background: '#ffffff' },
  })
    .composite([
      { input: Buffer.from(textoPc2), left: 0, top: 0 },
      {
        input: await peca('lp-moda-mochila.webp', 380, 480),
        left: 760,
        top: 80,
      },
      {
        input: await peca('lp-moda-tenis.webp', 380, 480),
        left: 1170,
        top: 80,
      },
    ])
    .jpeg({ quality: 86 })
    .toFile(join(dir, 'banner-2.jpg'));

  // Versão do celular do primeiro banner (900x1000)
  const textoCel = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420">
    <rect width="900" height="420" fill="${COR}"/>
    <text x="64" y="150" font-family="Georgia, serif" font-size="78" fill="#fff">Nova coleção</text>
    <text x="64" y="240" font-family="Georgia, serif" font-size="78" font-style="italic" fill="#f3d3c9">de inverno</text>
    <rect x="64" y="290" width="290" height="74" rx="37" fill="#fff"/>
    <text x="209" y="338" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="${COR}">Ver coleção</text>
  </svg>`;
  await sharp({
    create: { width: 900, height: 1000, channels: 3, background: '#ffffff' },
  })
    .composite([
      { input: Buffer.from(textoCel), left: 0, top: 0 },
      {
        input: await peca('lp-moda-vestido.webp', 390, 520),
        left: 40,
        top: 450,
      },
      {
        input: await peca('lp-moda-camisa.webp', 390, 520),
        left: 470,
        top: 450,
      },
    ])
    .jpeg({ quality: 86 })
    .toFile(join(dir, 'banner-1-celular.jpg'));

  return `/uploads/${storeId}`;
}

(async () => {
  const antiga = await p.store.findUnique({ where: { slug: 'atelie-lua' } });
  if (antiga) await p.store.delete({ where: { id: antiga.id } });

  const store = await p.store.create({
    data: {
      name: 'Ateliê Lua',
      slug: 'atelie-lua',
      storeType: 'FASHION',
      primaryColor: '#111111',
      accentColor: COR,
      status: 'ACTIVE',
      freteGratisAcima: 299,
    },
  });
  const base = await arte(store.id);
  await p.store.update({
    where: { id: store.id },
    data: {
      logoUrl: `${base}/logo.png`,
      marqueeEnabled: true,
      marqueeImages: [`${base}/banner-1.jpg`, `${base}/banner-2.jpg`],
      marqueeMobile: {
        [`${base}/banner-1.jpg`]: `${base}/banner-1-celular.jpg`,
      },
    },
  });

  const cats = {
    vestidos: await p.category.create({
      data: {
        storeId: store.id,
        name: 'Vestidos',
        slug: 'vestidos',
        imageUrl: '/lp/lp-moda-vestido.webp',
      },
    }),
    camisas: await p.category.create({
      data: {
        storeId: store.id,
        name: 'Camisas',
        slug: 'camisas',
        imageUrl: '/lp/lp-moda-camisa.webp',
      },
    }),
    calcados: await p.category.create({
      data: {
        storeId: store.id,
        name: 'Calçados',
        slug: 'calcados',
        imageUrl: '/lp/lp-moda-tenis.webp',
      },
    }),
    bolsas: await p.category.create({
      data: {
        storeId: store.id,
        name: 'Mochilas',
        slug: 'mochilas',
        imageUrl: '/lp/lp-moda-mochila.webp',
      },
    }),
  };

  const produtos: [
    keyof typeof cats,
    string,
    string,
    number,
    number | null,
    string,
  ][] = [
    [
      'vestidos',
      'Vestido Floral Alcinha',
      'vestido-floral-alcinha',
      189.9,
      229.9,
      'lp-moda-vestido.webp',
    ],
    [
      'camisas',
      'Camisa Linho Manga Curta',
      'camisa-linho-manga-curta',
      149.9,
      null,
      'lp-moda-camisa.webp',
    ],
    [
      'calcados',
      'Tênis Retrô Sola Caramelo',
      'tenis-retro-sola-caramelo',
      299.9,
      349.9,
      'lp-moda-tenis.webp',
    ],
    [
      'bolsas',
      'Mochila Canvas e Couro',
      'mochila-canvas-e-couro',
      259.9,
      null,
      'lp-moda-mochila.webp',
    ],
  ];
  for (const [cat, name, slug, price, compareAt, img] of produtos) {
    await p.product.create({
      data: {
        storeId: store.id,
        categoryId: cats[cat].id,
        name,
        slug,
        brand: 'Ateliê Lua',
        description: 'Peça da coleção de inverno do Ateliê Lua.',
        price,
        compareAt,
        installments: 6,
        stock: 12,
        featured: true,
        weightKg: 0.5,
        widthCm: 20,
        heightCm: 10,
        lengthCm: 30,
        images: { create: [{ url: `/lp/${img}`, alt: name, position: 0 }] },
      },
    });
  }
  console.log('ok', store.id);
  await p.$disconnect();
})();
