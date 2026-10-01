/**
 * Leitura da planilha de produtos (CSV).
 *
 * Feita para o que o lojista realmente manda:
 * - Excel em português salva CSV com ";" e em Windows-1252 (não UTF-8);
 * - Google Planilhas salva com "," em UTF-8;
 * - números no formato brasileiro ("1.234,56");
 * - cabeçalho com ou sem acento, em qualquer ordem.
 */

export type ProdutoDaPlanilha = {
  nome: string;
  preco: number;
  precoDe?: number;
  estoque?: number;
  codigo?: string;
  descricao?: string;
  categoria?: string;
  marca?: string;
  pesoKg?: number;
  larguraCm?: number;
  alturaCm?: number;
  comprimentoCm?: number;
  fotos: string[];
  ativo?: boolean;
};

export type LinhaLida = {
  /** Número da linha na planilha (a 1 é o cabeçalho) */
  linha: number;
  produto: ProdutoDaPlanilha | null;
  erros: string[];
};

export const COLUNAS_MODELO = [
  'nome',
  'preco',
  'preco_de',
  'estoque',
  'codigo',
  'categoria',
  'marca',
  'descricao',
  'fotos',
  'peso_kg',
  'largura_cm',
  'altura_cm',
  'comprimento_cm',
  'ativo',
] as const;

/** Apelidos aceitos para cada coluna (já sem acento e minúsculos). */
const APELIDOS: Record<string, (typeof COLUNAS_MODELO)[number]> = {
  nome: 'nome',
  produto: 'nome',
  titulo: 'nome',
  preco: 'preco',
  valor: 'preco',
  preco_por: 'preco',
  preco_de: 'preco_de',
  preco_antigo: 'preco_de',
  de: 'preco_de',
  estoque: 'estoque',
  quantidade: 'estoque',
  qtd: 'estoque',
  codigo: 'codigo',
  sku: 'codigo',
  referencia: 'codigo',
  categoria: 'categoria',
  marca: 'marca',
  descricao: 'descricao',
  fotos: 'fotos',
  foto: 'fotos',
  imagem: 'fotos',
  imagens: 'fotos',
  peso_kg: 'peso_kg',
  peso: 'peso_kg',
  largura_cm: 'largura_cm',
  largura: 'largura_cm',
  altura_cm: 'altura_cm',
  altura: 'altura_cm',
  comprimento_cm: 'comprimento_cm',
  comprimento: 'comprimento_cm',
  ativo: 'ativo',
};

/** UTF-8 se for válido; senão Windows-1252 (o "CSV" do Excel brasileiro). */
export function decodificar(buf: Buffer): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    texto = new TextDecoder('windows-1252').decode(buf);
  }
  return texto.replace(/^﻿/, '');
}

/** Separador mais frequente na 1ª linha: ";", "," ou tabulação. */
function separador(primeiraLinha: string): string {
  const conta = (c: string) => primeiraLinha.split(c).length - 1;
  const opcoes = [';', ',', '\t'].sort((a, b) => conta(b) - conta(a));
  return conta(opcoes[0]) > 0 ? opcoes[0] : ',';
}

/** CSV com aspas, aspas duplicadas ("") e quebra de linha dentro de aspas. */
export function lerCsv(texto: string): string[][] {
  const sep = separador(texto.split(/\r?\n/, 1)[0] || '');
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        aspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ''));
}

export function normalizarCabecalho(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** "1.234,56" → 1234.56; "89,9" → 89.9; "89.90" → 89.9; "R$ 10" → 10 */
export function numeroBr(valor: string | undefined): number | undefined {
  const t = (valor || '').replace(/[R$\s]/g, '');
  if (!t) return undefined;
  let n: number;
  if (t.includes(',')) {
    n = Number(t.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    // "1.234" sem vírgula é milhar
    n = Number(t.replace(/\./g, ''));
  } else {
    n = Number(t);
  }
  return Number.isFinite(n) ? n : Number.NaN;
}

function simNao(valor: string | undefined): boolean | undefined {
  const t = normalizarCabecalho(valor || '');
  if (!t) return undefined;
  if (['sim', 's', 'yes', 'y', '1', 'true', 'ativo'].includes(t)) return true;
  if (['nao', 'n', 'no', '0', 'false', 'inativo'].includes(t)) return false;
  return undefined;
}

export const LIMITE_LINHAS = 2000;

/** Tabela lida → produtos validados linha a linha. */
export function lerProdutos(tabela: string[][]): {
  linhas: LinhaLida[];
  colunasIgnoradas: string[];
} {
  if (tabela.length === 0) {
    throw new Error('A planilha está vazia.');
  }
  const cab = tabela[0].map(normalizarCabecalho);
  const mapa = cab.map((c) => APELIDOS[c] ?? null);
  if (!mapa.includes('nome') || !mapa.includes('preco')) {
    throw new Error(
      'A planilha precisa das colunas "nome" e "preco". Baixe o modelo para ver o formato.',
    );
  }
  const colunasIgnoradas = tabela[0].filter((_, i) => !mapa[i]);
  const corpo = tabela.slice(1);
  if (corpo.length > LIMITE_LINHAS) {
    throw new Error(
      `A planilha tem ${corpo.length} produtos. Envie no máximo ${LIMITE_LINHAS} por vez.`,
    );
  }

  const linhas = corpo.map((celulas, i): LinhaLida => {
    const v: Partial<Record<(typeof COLUNAS_MODELO)[number], string>> = {};
    mapa.forEach((col, j) => {
      if (col && v[col] === undefined) v[col] = (celulas[j] ?? '').trim();
    });
    const erros: string[] = [];
    const nome = v.nome || '';
    if (!nome) erros.push('falta o nome');
    if (nome.length > 200) erros.push('nome com mais de 200 letras');

    const preco = numeroBr(v.preco);
    if (preco === undefined) erros.push('falta o preço');
    else if (!(preco > 0)) erros.push(`preço inválido: "${v.preco}"`);

    const numeros: [keyof ProdutoDaPlanilha, string | undefined, string][] = [
      ['precoDe', v.preco_de, 'preço "de"'],
      ['estoque', v.estoque, 'estoque'],
      ['pesoKg', v.peso_kg, 'peso'],
      ['larguraCm', v.largura_cm, 'largura'],
      ['alturaCm', v.altura_cm, 'altura'],
      ['comprimentoCm', v.comprimento_cm, 'comprimento'],
    ];
    const extra: Partial<ProdutoDaPlanilha> = {};
    for (const [campo, bruto, rotulo] of numeros) {
      const n = numeroBr(bruto);
      if (n === undefined) continue;
      if (!Number.isFinite(n) || n < 0) {
        erros.push(`${rotulo} inválido: "${bruto}"`);
        continue;
      }
      (extra as Record<string, number>)[campo] =
        campo === 'estoque' ? Math.floor(n) : n;
    }
    if (
      extra.precoDe !== undefined &&
      preco !== undefined &&
      extra.precoDe <= preco
    ) {
      erros.push('preço "de" precisa ser maior que o preço');
    }

    const fotos = (v.fotos || '')
      .split(/[|\s]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const fotosRuins = fotos.filter((u) => !/^https:\/\/\S+$/i.test(u));
    if (fotosRuins.length) {
      erros.push('foto precisa ser um link começando com https://');
    }

    const ativo = simNao(v.ativo);
    if (v.ativo && ativo === undefined) {
      erros.push(`ativo deve ser "sim" ou "não": "${v.ativo}"`);
    }

    return {
      linha: i + 2,
      erros,
      produto: erros.length
        ? null
        : {
            nome,
            preco: preco as number,
            ...extra,
            codigo: v.codigo || undefined,
            descricao: v.descricao || undefined,
            categoria: v.categoria || undefined,
            marca: v.marca || undefined,
            fotos: fotos.slice(0, 6),
            ativo,
          },
    };
  });

  return { linhas, colunasIgnoradas };
}
