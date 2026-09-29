import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

/**
 * Hash bcrypt (custo 10, o mesmo das senhas reais) de um valor aleatório que
 * ninguém digita. Serve só para gastar o mesmo tempo quando a conta não
 * existe. Gerado uma vez, na primeira vez que precisar.
 */
let dummyHash: string | null = null;
function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync(randomBytes(16).toString('hex'), 10);
  return dummyHash;
}

/**
 * Compara a senha com o hash, ou com um hash falso quando não há conta.
 *
 * Sem isso o login respondia na hora para e-mail inexistente e ~80 ms depois
 * para e-mail cadastrado — dava para descobrir quem é cliente de qual loja só
 * medindo o tempo de resposta, mesmo com a mensagem de erro igual.
 */
export async function comparePasswordConstantTime(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, getDummyHash());
    return false;
  }
  return bcrypt.compare(password, hash);
}
