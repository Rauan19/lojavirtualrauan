import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';

/**
 * Impede que um endereço configurado pelo lojista aponte para a rede interna
 * do servidor.
 *
 * O host da impressora vem do painel e o servidor abre socket TCP nele — sem
 * essa checagem dá para varrer a rede privada da VPS e bater no endpoint de
 * metadata da cloud (169.254.169.254), que costuma entregar credencial.
 */
const blocked = new BlockList();

// IPv4
blocked.addSubnet('0.0.0.0', 8, 'ipv4'); // "este host"
blocked.addSubnet('10.0.0.0', 8, 'ipv4'); // privada
blocked.addSubnet('127.0.0.0', 8, 'ipv4'); // loopback
blocked.addSubnet('100.64.0.0', 10, 'ipv4'); // CGNAT
blocked.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local + metadata da cloud
blocked.addSubnet('172.16.0.0', 12, 'ipv4'); // privada
blocked.addSubnet('192.0.0.0', 24, 'ipv4'); // IETF protocol assignments
blocked.addSubnet('192.168.0.0', 16, 'ipv4'); // privada
blocked.addSubnet('198.18.0.0', 15, 'ipv4'); // benchmark
blocked.addSubnet('224.0.0.0', 4, 'ipv4'); // multicast
blocked.addSubnet('240.0.0.0', 4, 'ipv4'); // reservada

// IPv6
blocked.addAddress('::', 'ipv6'); // não especificado
blocked.addAddress('::1', 'ipv6'); // loopback
blocked.addSubnet('fc00::', 7, 'ipv6'); // unique local
blocked.addSubnet('fe80::', 10, 'ipv6'); // link-local
blocked.addSubnet('ff00::', 8, 'ipv6'); // multicast
// NÃO adicionar ::ffff:0:0/96 aqui: no BlockList do Node essa regra casa com
// QUALQUER endereço IPv4, bloqueando a internet inteira. Endereço IPv4
// mapeado é tratado à parte em isPrivateAddress().

export class BlockedNetworkTargetError extends Error {
  constructor(host: string) {
    super(
      `Endereço "${host}" aponta para a rede interna do servidor e não é permitido.`,
    );
  }
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;

  // ::ffff:10.0.0.1 e afins: valida também como IPv4
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped && blocked.check(mapped[1], 'ipv4')) return true;

  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Resolve o host e devolve um IP público para conectar.
 *
 * Devolver o IP resolvido (em vez do hostname) fecha a janela de DNS
 * rebinding: quem for conectar usa exatamente o endereço que foi validado.
 */
export async function resolvePublicAddress(
  host: string,
  allowPrivate = false,
): Promise<string> {
  const target = host.trim();
  if (!target) {
    throw new BlockedNetworkTargetError(host);
  }

  if (isIP(target) !== 0) {
    if (!allowPrivate && isPrivateAddress(target)) {
      throw new BlockedNetworkTargetError(host);
    }
    return target;
  }

  const resolved = await lookup(target, { all: true });
  if (resolved.length === 0) {
    throw new BlockedNetworkTargetError(host);
  }

  if (!allowPrivate) {
    // Qualquer resposta privada reprova o host inteiro — um nome que resolve
    // para público e privado ao mesmo tempo é justamente o ataque.
    for (const entry of resolved) {
      if (isPrivateAddress(entry.address)) {
        throw new BlockedNetworkTargetError(host);
      }
    }
  }

  return resolved[0].address;
}
