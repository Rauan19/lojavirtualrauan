/*
 * Gera public/og-image.png — a imagem que aparece quando alguém compartilha
 * vendira.com.br no WhatsApp, Instagram, LinkedIn etc.
 *
 *   npm run og
 *
 * É script e não arquivo estático porque a imagem combina texto vetorial com
 * as fotos reais das lojas-modelo: quando a headline ou as fotos mudarem,
 * roda de novo em vez de editar imagem na mão.
 */

import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const W = 1200;
const H = 630;

const INK = '#171a1f';
const MUTED = '#4a5560';
const ACCENT = '#d43d54';
const CORAL = '#ea5e6d';
const TEAL = '#3fa2b4';

// Mesmas fotos da hero, para quem clica reconhecer a loja que viu no card.
const FOTOS = [
  'public/lp/lp-moda-vestido.webp',
  'public/lp/lp-moda-camisa.webp',
  'public/lp/lp-moda-tenis.webp',
  'public/lp/lp-moda-bone.webp',
];

const CARD = { x: 700, y: 120, w: 420, h: 400 };
const CELL = { w: 195, h: 152, gap: 10 };
const GRID_TOP = CARD.y + 82;

const fundo = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g1" cx="0.72" cy="0.28" r="0.6">
      <stop offset="0%" stop-color="${CORAL}" stop-opacity="0.20" />
      <stop offset="100%" stop-color="${CORAL}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="g2" cx="0.95" cy="0.9" r="0.5">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.22" />
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#f7f8fa" />
  <rect width="${W}" height="${H}" fill="url(#g1)" />
  <rect width="${W}" height="${H}" fill="url(#g2)" />

  <text x="80" y="250" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="800" fill="${INK}">Sua loja virtual vende</text>
  <text x="80" y="316" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="800" fill="${ACCENT}">24 horas por dia.</text>

  <text x="80" y="372" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${MUTED}">Catálogo, checkout, Pix, cartão e frete calculado.</text>
  <text x="80" y="406" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${MUTED}">O cliente compra sozinho, a qualquer hora.</text>

  <rect x="80" y="446" width="316" height="60" rx="4" fill="${ACCENT}" />
  <text x="238" y="484" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">Criar minha loja grátis</text>

  <text x="80" y="566" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="${MUTED}">vendira.com.br · comece grátis, sem cartão de crédito</text>

  <!-- vitrine -->
  <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="12" fill="#ffffff" />
  <path d="M${CARD.x} ${CARD.y + 12} a12 12 0 0 1 12 -12 h${CARD.w - 24} a12 12 0 0 1 12 12 v22 h-${CARD.w} z" fill="#f1f2f4" />
  <circle cx="${CARD.x + 20}" cy="${CARD.y + 17}" r="5" fill="#e0603d" />
  <circle cx="${CARD.x + 38}" cy="${CARD.y + 17}" r="5" fill="#e0b23d" />
  <circle cx="${CARD.x + 56}" cy="${CARD.y + 17}" r="5" fill="#4caf6e" />
  <rect x="${CARD.x + 80}" y="${CARD.y + 9}" width="${CARD.w - 100}" height="16" rx="8" fill="#ffffff" />
  <text x="${CARD.x + 16}" y="${CARD.y + 62}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="${CORAL}">Ateliê Lua</text>
  <line x1="${CARD.x}" y1="${CARD.y + 74}" x2="${CARD.x + CARD.w}" y2="${CARD.y + 74}" stroke="#e6e8ec" stroke-width="1" />
</svg>`;

const base = await sharp(Buffer.from(fundo)).png().toBuffer();

const camadas = [];
for (let i = 0; i < FOTOS.length; i++) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  camadas.push({
    input: await sharp(FOTOS[i])
      .resize(CELL.w, CELL.h, { fit: 'cover', position: 'top' })
      .toBuffer(),
    left: CARD.x + 10 + col * (CELL.w + CELL.gap),
    top: GRID_TOP + row * (CELL.h + CELL.gap),
  });
}

camadas.push({
  input: await sharp('public/brand/vendira-wordmark.webp')
    .resize({ height: 72 })
    .toBuffer(),
  left: 80,
  top: 64,
});

const png = await sharp(base).composite(camadas).png({ quality: 92 }).toBuffer();
writeFileSync('public/og-image.png', png);
console.log(`og-image.png gerada (${(png.length / 1024).toFixed(1)} KB)`);
