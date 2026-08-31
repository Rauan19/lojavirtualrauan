/*
 * Gera todos os arquivos da marca a partir de uma arte só.
 *
 *   npm run brand
 *
 * Entrada:  brand-originais/vendira.png  (a arte como veio do designer)
 * Saída:    public/brand/vendira-logo.webp      lockup com a tagline
 *           public/brand/vendira-wordmark.webp  carrinho + "vendira"
 *           public/brand/vendira-mark.webp      só o símbolo, quadrado
 *           src/app/icon.png                    favicon (Next monta as tags)
 *           src/app/apple-icon.png              atalho do iOS
 *
 * Trocou a logo? Substitui a arte de entrada e roda de novo.
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const ORIGEM = 'brand-originais/vendira.png';

/*
 * A arte vem com fundo (gradiente claro) chapado por baixo. Máscara por
 * saturação e luminância: fica o que é saturado — turquesa e coral — ou
 * escuro — o texto da tagline; sai o que é claro e sem cor, que é o fundo.
 * Funciona melhor que recorte por cor porque o fundo é um degradê, não uma
 * cor só.
 */
async function removerFundo(caminho) {
  const { data, info } = await sharp(caminho)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const lum = mx / 255;
    const a = Math.max(0, Math.min(1, Math.max((sat - 0.15) / 0.25, (0.85 - lum) / 0.25)));
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    out[j + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function aparar(buf) {
  const { data, info } = await sharp(buf)
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  return { buf: await sharp(data).png().toBuffer(), info };
}

/** Rótulo de componentes conectados, para separar o símbolo das letras. */
async function componentes(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const lab = new Int32Array(w * h).fill(-1);
  const lista = [];
  for (let p = 0; p < w * h; p++) {
    if (data[p * 4 + 3] <= 60 || lab[p] >= 0) continue;
    const id = lista.length;
    const fila = [p];
    lab[p] = id;
    let minx = w;
    while (fila.length) {
      const q = fila.pop();
      const x = q % w;
      const y = (q - x) / w;
      if (x < minx) minx = x;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const r = ny * w + nx;
        if (lab[r] >= 0 || data[r * 4 + 3] <= 60) continue;
        lab[r] = id;
        fila.push(r);
      }
    }
    lista.push({ id, minx });
  }
  return { data, info, lab, lista };
}

function so(ids, data, info, lab) {
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p++) {
    if (!ids.has(lab[p])) continue;
    const j = p * 4;
    out[j] = data[j];
    out[j + 1] = data[j + 1];
    out[j + 2] = data[j + 2];
    out[j + 3] = data[j + 3];
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

const semFundo = await removerFundo(ORIGEM);
const { buf: cheio, info: infoCheio } = await aparar(semFundo);
const w = infoCheio.width;
const h = infoCheio.height;

// 1) lockup completo
writeFileSync(
  'public/brand/vendira-logo.webp',
  await sharp(cheio).resize({ height: 200 }).webp({ quality: 92, alphaQuality: 100 }).toBuffer(),
);

/*
 * 2) sem tagline. A tagline fica na faixa de cima à direita; a ponta da seta
 * é a única coisa do símbolo que sobe até lá, e para muito antes na
 * horizontal — por isso o corte é um retângulo e não uma linha.
 */
const CORTE_TAGLINE = { x: Math.round(w * 0.32), y: Math.round(h * 0.19) };
const bruto = await sharp(cheio).raw().toBuffer();
for (let y = 0; y <= CORTE_TAGLINE.y; y++) {
  for (let x = CORTE_TAGLINE.x; x < w; x++) bruto[(y * w + x) * 4 + 3] = 0;
}
const semTag = await sharp(bruto, { raw: { width: w, height: h, channels: 4 } })
  .png()
  .toBuffer();
const { buf: wordmark } = await aparar(semTag);
writeFileSync(
  'public/brand/vendira-wordmark.webp',
  await sharp(wordmark).resize({ height: 140 }).webp({ quality: 92, alphaQuality: 100 }).toBuffer(),
);

/*
 * 3) só o símbolo. Corte retangular não serve: a ponta da seta passa por cima
 * do "v". Separa por componente conectado e fica com os que começam na
 * metade esquerda — carrinho, seta e as duas rodinhas.
 */
const { data, info, lab, lista } = await componentes(semTag);
const LIMITE = Math.round(w * 0.22);
const idsSimbolo = new Set(lista.filter((c) => c.minx < LIMITE).map((c) => c.id));
const { buf: simbolo, info: infoSimbolo } = await aparar(await so(idsSimbolo, data, info, lab));

const lado = Math.round(Math.max(infoSimbolo.width, infoSimbolo.height) * 1.24);
const arte = await sharp(simbolo)
  .resize({ width: Math.round(lado * 0.78), height: Math.round(lado * 0.78), fit: 'inside' })
  .toBuffer();
const dim = await sharp(arte).metadata();
const quadrado = await sharp({
  create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: arte, left: Math.round((lado - dim.width) / 2), top: Math.round((lado - dim.height) / 2) },
  ])
  .png()
  .toBuffer();

writeFileSync(
  'public/brand/vendira-mark.webp',
  await sharp(quadrado).resize(256, 256).webp({ quality: 95, alphaQuality: 100 }).toBuffer(),
);
writeFileSync('src/app/icon.png', await sharp(quadrado).resize(512, 512).png().toBuffer());

// iOS não respeita transparência no atalho: sem fundo sólido o ícone sai preto.
writeFileSync(
  'src/app/apple-icon.png',
  await sharp({ create: { width: 180, height: 180, channels: 4, background: '#ffffff' } })
    .composite([{ input: await sharp(quadrado).resize(150, 150).toBuffer(), left: 15, top: 15 }])
    .png()
    .toBuffer(),
);

for (const f of [
  'public/brand/vendira-logo.webp',
  'public/brand/vendira-wordmark.webp',
  'public/brand/vendira-mark.webp',
  'src/app/icon.png',
  'src/app/apple-icon.png',
]) {
  console.log(`ok  ${f}  ${(statSync(f).size / 1024).toFixed(1)} KB`);
}
console.log('\nRode `npm run og` depois, se a logo mudou: a imagem de compartilhamento usa ela.');
