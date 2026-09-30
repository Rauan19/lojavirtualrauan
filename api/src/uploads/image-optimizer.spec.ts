import sharp from 'sharp';
import { MAX_SIDE, THUMB_SIDE, optimizeImage } from './image-optimizer';

/** Foto "de celular": grande, com ruído (não comprime fácil) e EXIF com GPS. */
async function fotoDeCelular(width = 4000, height = 3000) {
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
  return sharp(noise, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1' } })
    .toBuffer();
}

// Imagem de 12 MP: com a suíte inteira rodando junto, passa dos 5s padrão
jest.setTimeout(30_000);

describe('optimizeImage', () => {
  it('reduz foto grande para WebP de no máximo 1600px, bem menor', async () => {
    const input = await fotoDeCelular();
    const out = await optimizeImage(input);

    const meta = await sharp(out.main).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBe(MAX_SIDE);
    expect(out.main.length).toBeLessThan(input.length / 3);
  });

  it('gera miniatura de até 480px', async () => {
    const out = await optimizeImage(await fotoDeCelular());
    const meta = await sharp(out.thumb).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(THUMB_SIDE);
    expect(out.thumb.length).toBeLessThan(out.main.length);
  });

  it('não aumenta foto pequena', async () => {
    const out = await optimizeImage(await fotoDeCelular(800, 600));
    const meta = await sharp(out.main).metadata();
    expect(meta.width).toBe(800);
  });

  it('remove o EXIF (GPS) da foto', async () => {
    const out = await optimizeImage(await fotoDeCelular(1200, 900));
    const meta = await sharp(out.main).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('mantém a transparência de logo PNG', async () => {
    const png = await sharp({
      create: {
        width: 600,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const meta = await sharp((await optimizeImage(png)).main).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it('recusa arquivo que não é imagem, mesmo com extensão .jpg', async () => {
    await expect(
      optimizeImage(Buffer.from('<html><script>alert(1)</script></html>')),
    ).rejects.toThrow();
  });
});
