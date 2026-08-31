/*
 * Prepara as fotos das lojas-modelo da landing.
 *
 * Coloque os arquivos originais em web/lp-fotos-originais/ usando os nomes
 * listados em SLOTS (a extensão pode ser .jpg, .jpeg, .png ou .webp) e rode:
 *
 *   npm run lp:fotos
 *
 * O script corta no formato certo de cada loja (moda em retrato 3:4, o resto
 * em quadrado), converte para WebP e grava em web/public/lp/. Slot sem foto
 * original é ignorado — a arte que já está lá continua valendo, então dá pra
 * ir substituindo aos poucos.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const SRC = 'lp-fotos-originais';
const OUT = 'public/lp';

/** [nome do arquivo, formato] — retrato para moda, quadrado para o resto. */
const SLOTS = [
  ['lp-moda-vestido', 'retrato'],
  ['lp-moda-camisa', 'retrato'],
  ['lp-moda-tenis', 'retrato'],
  ['lp-moda-bone', 'retrato'],
  ['lp-moda-mochila', 'retrato'],
  ['lp-moda-tenis-lilas', 'retrato'],
  ['lp-eletro-celular', 'quadrado'],
  ['lp-eletro-tv', 'quadrado'],
  ['lp-eletro-fogao', 'quadrado'],
  ['lp-eletro-geladeira', 'quadrado'],
];

const SIZES = { retrato: [480, 640], quadrado: [480, 480] };
const ACEITA = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function acharOriginal(nome) {
  if (!existsSync(SRC)) return null;
  for (const f of readdirSync(SRC)) {
    if (!statSync(join(SRC, f)).isFile()) continue;
    if (!ACEITA.has(extname(f).toLowerCase())) continue;
    if (basename(f, extname(f)).toLowerCase() === nome) return join(SRC, f);
  }
  return null;
}

let feitos = 0;
const faltando = [];

for (const [nome, formato] of SLOTS) {
  const origem = acharOriginal(nome);
  if (!origem) {
    faltando.push(nome);
    continue;
  }
  const [w, h] = SIZES[formato];
  const destino = join(OUT, `${nome}.webp`);
  /*
   * contain, não cover: foto de produto não pode ser recortada. Cover num
   * original quase quadrado forçado pra 3:4 corta o pé do tênis e o topo do
   * boné. O fundo branco emenda com o fundo das próprias fotos, então a
   * sobra não aparece.
   */
  await sharp(origem)
    .resize(w, h, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 84 })
    .toFile(destino);
  console.log(`ok   ${nome}.webp  (${formato} ${w}x${h})`);
  feitos++;
}

console.log(`\n${feitos} foto(s) processada(s).`);
if (faltando.length) {
  console.log(
    `Sem original em ${SRC}/ (segue com a arte atual): ${faltando.join(', ')}`,
  );
}
