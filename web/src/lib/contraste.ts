/**
 * Contraste da cor que o lojista escolhe. Qualquer cor vale (amarelo, verde
 * limão, branco): a vitrine decide sozinha a cor do texto em cima dela e
 * escurece a cor quando ela vira texto sobre fundo branco. Regras do WCAG
 * (4,5:1 para texto normal).
 */

type Rgb = [number, number, number];

function paraRgb(cor: string): Rgb | null {
  const hex = cor.trim().replace(/^#/, '');
  const cheio =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(cheio)) return null;
  return [0, 2, 4].map((i) => parseInt(cheio.slice(i, i + 2), 16)) as Rgb;
}

function luminancia([r, g, b]: Rgb) {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(a: string, b: string) {
  const ra = paraRgb(a);
  const rb = paraRgb(b);
  if (!ra || !rb) return 21;
  const [l1, l2] = [luminancia(ra), luminancia(rb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const BRANCO = '#ffffff';
const TINTA = '#111111';

/** Texto em cima da cor (botão, selo): branco ou quase preto, o que ler melhor. */
export function tintaSobre(fundo: string) {
  return contraste(fundo, BRANCO) >= contraste(fundo, TINTA) ? BRANCO : TINTA;
}

function hex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A cor usada como texto/link em fundo branco: a própria, se já lê bem;
 * senão, escurecida aos poucos até passar de 4,5:1.
 */
export function corDeTexto(cor: string, fundo = BRANCO) {
  const rgb = paraRgb(cor);
  if (!rgb) return cor;
  let atual = rgb;
  for (let i = 0; i < 20 && contraste(hex(atual), fundo) < 4.5; i++) {
    atual = atual.map((v) => v * 0.88) as Rgb;
  }
  return hex(atual);
}
