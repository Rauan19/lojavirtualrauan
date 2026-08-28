import {
  BlockedNetworkTargetError,
  isPrivateAddress,
  resolvePublicAddress,
} from './network-target';

/**
 * printerHost é preenchido pelo lojista e o servidor abre socket TCP nele.
 * Sem bloqueio, o campo vira scanner da rede interna da VPS — e o endpoint
 * de metadata da cloud entrega credencial.
 */
describe('network-target', () => {
  describe('isPrivateAddress', () => {
    it.each([
      ['127.0.0.1', 'loopback'],
      ['10.1.2.3', 'privada 10/8'],
      ['172.16.0.1', 'privada 172.16/12'],
      ['172.31.255.254', 'fim da 172.16/12'],
      ['192.168.0.1', 'privada 192.168/16'],
      ['169.254.169.254', 'metadata da cloud'],
      ['100.64.0.1', 'CGNAT'],
      ['0.0.0.0', 'não especificado'],
      ['::1', 'loopback IPv6'],
      ['fd00::1', 'ULA IPv6'],
      ['fe80::1', 'link-local IPv6'],
      ['::ffff:169.254.169.254', 'metadata via IPv4 mapeado'],
    ])('bloqueia %s (%s)', (address) => {
      expect(isPrivateAddress(address)).toBe(true);
    });

    it.each([
      ['8.8.8.8'],
      ['1.1.1.1'],
      ['200.160.2.3'],
      ['2001:4860:4860::8888'],
    ])('libera %s', (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    });

    it('172.32.0.1 não é privada (fora da faixa /12)', () => {
      expect(isPrivateAddress('172.32.0.1')).toBe(false);
    });
  });

  describe('resolvePublicAddress', () => {
    it('recusa IP interno', async () => {
      await expect(resolvePublicAddress('169.254.169.254')).rejects.toThrow(
        BlockedNetworkTargetError,
      );
      await expect(resolvePublicAddress('127.0.0.1')).rejects.toThrow(
        BlockedNetworkTargetError,
      );
      await expect(resolvePublicAddress('192.168.1.50')).rejects.toThrow(
        BlockedNetworkTargetError,
      );
    });

    it('recusa host vazio', async () => {
      await expect(resolvePublicAddress('   ')).rejects.toThrow(
        BlockedNetworkTargetError,
      );
    });

    it('devolve o IP público informado', async () => {
      await expect(resolvePublicAddress('8.8.8.8')).resolves.toBe('8.8.8.8');
    });

    it('libera rede interna quando o operador opta explicitamente', async () => {
      await expect(resolvePublicAddress('192.168.1.50', true)).resolves.toBe(
        '192.168.1.50',
      );
    });

    it('recusa hostname que resolve para loopback (rebinding)', async () => {
      // localhost resolve para 127.0.0.1 / ::1
      await expect(resolvePublicAddress('localhost')).rejects.toThrow(
        BlockedNetworkTargetError,
      );
    });
  });
});
