/**
 * Encolhe as fotos antigas da pasta de uploads, no lugar.
 *
 * Upload novo já sai otimizado (WebP + miniatura, ver
 * src/uploads/image-optimizer.ts). Este script é para o que foi enviado antes
 * disso: JPG/PNG originais de celular, de 2–4 MB cada.
 *
 * Mantém nome e extensão do arquivo, então nenhuma URL no banco muda. Só
 * regrava quando o resultado fica menor que o original.
 *
 *   npx tsx scripts/optimize-uploads.ts           # simula e mostra a economia
 *   npx tsx scripts/optimize-uploads.ts --apply   # regrava de verdade
 *
 * Faça backup da pasta antes do --apply (ex: tar czf uploads.tgz uploads/):
 * a foto original não volta.
 */
import 'dotenv/config';
import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import sharp from 'sharp';
import { MAX_SIDE, THUMB_SUFFIX } from '../src/uploads/image-optimizer';

const APPLY = process.argv.includes('--apply');
const ROOT = resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
/** Abaixo disso e dentro do tamanho máximo, não vale mexer. */
const SKIP_UNDER_BYTES = 250 * 1024;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function shrink(file: string, ext: string): Promise<Buffer | null> {
  const input = await readFile(file);
  const meta = await sharp(input).metadata();
  const big = (meta.width ?? 0) > MAX_SIDE || (meta.height ?? 0) > MAX_SIDE;
  if (!big && input.length < SKIP_UNDER_BYTES) return null;

  const pipeline = sharp(input).rotate().resize({
    width: MAX_SIDE,
    height: MAX_SIDE,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const out =
    ext === '.png'
      ? await pipeline
          .png({ compressionLevel: 9, palette: true, quality: 90 })
          .toBuffer()
      : await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();

  return out.length < input.length ? out : null;
}

async function main() {
  const exists = await stat(ROOT).catch(() => null);
  if (!exists?.isDirectory()) {
    console.error(`Pasta de uploads não encontrada: ${ROOT}`);
    process.exit(1);
  }

  let files = 0;
  let changed = 0;
  let failed = 0;
  let before = 0;
  let after = 0;

  for await (const file of walk(ROOT)) {
    const ext = extname(file).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;
    if (file.includes(THUMB_SUFFIX)) continue;
    files++;

    const size = (await stat(file)).size;
    before += size;
    try {
      const out = await shrink(file, ext);
      if (!out) {
        after += size;
        continue;
      }
      changed++;
      after += out.length;
      if (APPLY) await writeFile(file, out);
    } catch (err) {
      failed++;
      after += size;
      console.warn(
        `pulado ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + ' MB';
  console.log(
    `${APPLY ? 'Otimizado' : 'Simulação'}: ${files} fotos, ${changed} ${
      APPLY ? 'regravadas' : 'seriam regravadas'
    }, ${failed} com erro.`,
  );
  console.log(
    `Tamanho: ${mb(before)} → ${mb(after)} (${
      before ? Math.round((1 - after / before) * 100) : 0
    }% menor).`,
  );
  if (!APPLY && changed > 0) {
    console.log('Rode de novo com --apply para gravar (faça backup antes).');
  }
}

void main();
