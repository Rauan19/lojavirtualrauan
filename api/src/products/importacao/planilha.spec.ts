import {
  decodificar,
  lerCsv,
  lerProdutos,
  normalizarCabecalho,
  numeroBr,
} from './planilha';

describe('planilha de produtos', () => {
  it('CSV do Excel brasileiro: ";" e Windows-1252', () => {
    const buf = Buffer.from(
      'Nome;Preço;Descrição\nCalça Jeans;129,90;Algodão\n',
      'latin1',
    );
    const tabela = lerCsv(decodificar(buf));
    expect(tabela).toEqual([
      ['Nome', 'Preço', 'Descrição'],
      ['Calça Jeans', '129,90', 'Algodão'],
    ]);
  });

  it('CSV do Google Planilhas: "," e UTF-8 com BOM', () => {
    const buf = Buffer.from('﻿nome,preco\n"Camisa, azul",59.9\n', 'utf8');
    expect(lerCsv(decodificar(buf))).toEqual([
      ['nome', 'preco'],
      ['Camisa, azul', '59.9'],
    ]);
  });

  it('aspas dentro de aspas e quebra de linha no campo', () => {
    const t = 'nome;descricao\n"Copo ""Grande""";"linha 1\nlinha 2"\n';
    expect(lerCsv(t)[1]).toEqual(['Copo "Grande"', 'linha 1\nlinha 2']);
  });

  it('cabeçalho com acento, maiúscula e unidade', () => {
    expect(normalizarCabecalho('Preço (R$)')).toBe('preco');
    expect(normalizarCabecalho('Peso kg')).toBe('peso_kg');
  });

  it('números no formato brasileiro', () => {
    expect(numeroBr('1.234,56')).toBe(1234.56);
    expect(numeroBr('89,9')).toBe(89.9);
    expect(numeroBr('89.90')).toBe(89.9);
    expect(numeroBr('1.234')).toBe(1234);
    expect(numeroBr('R$ 10')).toBe(10);
    expect(numeroBr('')).toBeUndefined();
    expect(numeroBr('abc')).toBeNaN();
  });

  it('lê produtos e aponta o erro de cada linha', () => {
    const { linhas, colunasIgnoradas } = lerProdutos([
      ['Nome', 'Preço', 'Estoque', 'Fotos', 'Cor favorita'],
      [
        'Tênis',
        '199,90',
        '5',
        'https://a.com/1.jpg | https://a.com/2.jpg',
        'x',
      ],
      ['', '10', '', '', ''],
      ['Boné', 'grátis', '', 'http://inseguro.com/a.jpg', ''],
    ]);
    expect(colunasIgnoradas).toEqual(['Cor favorita']);
    expect(linhas[0]).toMatchObject({
      linha: 2,
      erros: [],
      produto: {
        nome: 'Tênis',
        preco: 199.9,
        estoque: 5,
        fotos: ['https://a.com/1.jpg', 'https://a.com/2.jpg'],
      },
    });
    expect(linhas[1].erros).toContain('falta o nome');
    expect(linhas[2].erros).toEqual([
      'preço inválido: "grátis"',
      'foto precisa ser um link começando com https://',
    ]);
  });

  it('sem as colunas obrigatórias, recusa a planilha inteira', () => {
    expect(() => lerProdutos([['produto', 'estoque']])).toThrow(
      /"nome" e "preco"/,
    );
  });

  it('preço "de" menor que o preço é erro', () => {
    const { linhas } = lerProdutos([
      ['nome', 'preco', 'preco_de'],
      ['A', '100', '90'],
    ]);
    expect(linhas[0].erros).toContain(
      'preço "de" precisa ser maior que o preço',
    );
  });
});
