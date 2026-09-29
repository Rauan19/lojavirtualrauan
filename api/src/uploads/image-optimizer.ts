import sharp from 'sharp';

/** Lado maior da foto grande (página do produto, zoom, banner). */
export const MAX_SIDE = 1600;
/** Lado maior da miniatura (vitrine, carrinho, listas do painel). */
export const THUMB_SIDE = 480;
/** Sufixo da miniatura: `abc.webp` → `abc-thumb.webp`. O front usa a mesma regra. */
export const THUMB_SUFFIX = '-thumb';

/*
 * Foto de 8000×6000 já passa de qualquer celular. Acima disso é arquivo feito
 * para derrubar o servidor (descompactar gasta RAM por pixel, não por byte).
 */
const MAX_INPUT_PIXELS = 50_000_000;

export type OptimizedImage = {
  main: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
};

/**
 * Converte a foto enviada pelo lojista em WebP leve + miniatura.
 *
 * Foto de celular chega com 2–4 MB; aqui sai com 100–250 KB e a miniatura com
 * 15–40 KB. É isso que faz o disco do VPS durar e a vitrine abrir rápido no 4G.
 *
 * - Respeita a orientação do EXIF e depois descarta todo o metadado (inclui
 *   GPS da casa do lojista, que vinha junto na foto do celular).
 * - PNG (logo com fundo transparente) mantém o alfa e sai com qualidade maior,
 *   porque borda de logo mostra artefato de compressão.
 * - GIF animado continua animado.
 * - Arquivo que não é imagem de verdade (só tem extensão .jpg) é recusado aqui,
 *   porque o sharp não consegue ler.
 */
export async function optimizeImage(input: Buffer): Promise<OptimizedImage> {
  const meta = await sharp(input, {
    limitInputPixels: MAX_INPUT_PIXELS,
  }).metadata();

  const animated = meta.format === 'gif' && (meta.pages ?? 1) > 1;
  const quality = meta.format === 'png' ? 90 : 80;

  const base = () => {
    const img = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated,
    });
    // rotate() sem argumento aplica o EXIF; em animação não há EXIF
    return animated ? img : img.rotate();
  };

  const { data: main, info } = await base()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base()
    .resize({
      width: THUMB_SIDE,
      height: THUMB_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: Math.min(quality, 78), effort: 4 })
    .toBuffer();

  return {
    main,
    thumb,
    width: info.width,
    height: animated && info.pageHeight ? info.pageHeight : info.height,
  };
}
