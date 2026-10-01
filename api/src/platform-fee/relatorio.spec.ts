import { celulaCsv, intervaloDoMes, reaisCsv } from './relatorio';

describe('relatório da comissão', () => {
  it('mês vai da meia-noite de Brasília do dia 1 até a do mês seguinte', () => {
    const { inicio, fim, mes } = intervaloDoMes('2026-12');
    expect(mes).toBe('2026-12');
    expect(inicio.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('recusa mês mal escrito', () => {
    expect(() => intervaloDoMes('2026-13')).toThrow();
    expect(() => intervaloDoMes("2026-01' OR 1=1")).toThrow();
  });

  it('valores em reais no formato da planilha', () => {
    expect(reaisCsv(123456)).toBe('1234,56');
    expect(reaisCsv(5)).toBe('0,05');
    expect(reaisCsv(-180)).toBe('-1,80');
  });

  it('CSV: escapa ; e aspas, e neutraliza fórmula', () => {
    expect(celulaCsv('Loja; da "Ana"')).toBe('"Loja; da ""Ana"""');
    expect(celulaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celulaCsv(null)).toBe('');
    expect(celulaCsv('-1,80')).toBe('-1,80');
    expect(celulaCsv('-1+1')).toBe("'-1+1");
  });
});
