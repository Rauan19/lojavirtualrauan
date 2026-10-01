import { proxiesConfiaveis } from './request-ip';

describe('proxiesConfiaveis', () => {
  it('aceita a quantidade de proxies configurada', () => {
    expect(proxiesConfiaveis('2')).toBe(2);
    expect(proxiesConfiaveis('0')).toBe(0);
  });

  it('valor ausente ou estranho volta para 1 (Nginx na frente)', () => {
    expect(proxiesConfiaveis(undefined)).toBe(1);
    expect(proxiesConfiaveis('')).toBe(1);
    expect(proxiesConfiaveis('true')).toBe(1);
    expect(proxiesConfiaveis('99')).toBe(1);
  });
});
