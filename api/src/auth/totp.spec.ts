import {
  base32Decode,
  base32Encode,
  codigoDoPasso,
  enderecoOtpauth,
  gerarCodigosRecuperacao,
  gerarSegredo,
  hashRecuperacao,
  verificarCodigo,
} from './totp';

/** Chave dos vetores de teste da RFC 6238 (SHA1). */
const CHAVE_RFC = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('vetor oficial da RFC em t=%i dá %s', (t, esperado) => {
    expect(codigoDoPasso(CHAVE_RFC, Math.floor(t / 30), 8)).toBe(esperado);
  });

  it('base32 ida e volta', () => {
    const buf = Buffer.from('12345678901234567890', 'ascii');
    expect(base32Encode(buf)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('aceita o código atual e devolve o passo', () => {
    const segredo = gerarSegredo();
    const agora = 1_790_000_000_000;
    const passo = Math.floor(agora / 30000);
    const codigo = codigoDoPasso(base32Decode(segredo), passo);
    expect(verificarCodigo(segredo, codigo, null, agora)).toBe(passo);
  });

  it('tolera relógio do celular 30s fora, mas não 2 minutos', () => {
    const segredo = gerarSegredo();
    const agora = 1_790_000_000_000;
    const passo = Math.floor(agora / 30000);
    const chave = base32Decode(segredo);
    expect(
      verificarCodigo(segredo, codigoDoPasso(chave, passo - 1), null, agora),
    ).toBe(passo - 1);
    expect(
      verificarCodigo(segredo, codigoDoPasso(chave, passo - 4), null, agora),
    ).toBeNull();
  });

  it('o mesmo código não vale duas vezes', () => {
    const segredo = gerarSegredo();
    const agora = 1_790_000_000_000;
    const passo = Math.floor(agora / 30000);
    const codigo = codigoDoPasso(base32Decode(segredo), passo);
    expect(verificarCodigo(segredo, codigo, passo, agora)).toBeNull();
  });

  it('recusa formato errado', () => {
    const segredo = gerarSegredo();
    expect(verificarCodigo(segredo, 'abc123', null)).toBeNull();
    expect(verificarCodigo(segredo, '12345', null)).toBeNull();
  });

  it('endereço do QR code no formato que os apps leem', () => {
    const url = enderecoOtpauth('Vendira', 'ana@loja.com', 'JBSWY3DPEHPK3PXP');
    expect(url).toMatch(/^otpauth:\/\/totp\/Vendira%3Aana%40loja\.com\?/);
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('issuer=Vendira');
  });

  it('códigos de recuperação: 10, únicos, sem letras confusas', () => {
    const codigos = gerarCodigosRecuperacao();
    expect(codigos).toHaveLength(10);
    expect(new Set(codigos).size).toBe(10);
    for (const c of codigos)
      expect(c).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
  });

  it('hash do código de recuperação ignora traço e minúscula', () => {
    expect(hashRecuperacao('abcde-fghjk')).toBe(hashRecuperacao('ABCDEFGHJK'));
  });
});
