import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStoreProfileDto } from './dto/store.dto';

/**
 * O e-mail fiscal é opcional. O painel manda `null` quando o campo está vazio,
 * e isso derrubava o PATCH do perfil com 500 — o callback do ValidateIf estava
 * lendo o valor como se fosse o objeto.
 */
const validar = (payload: Record<string, unknown>) =>
  validate(plainToInstance(UpdateStoreProfileDto, payload));

describe('e-mail fiscal no perfil da loja', () => {
  it.each([
    ['nulo', null],
    ['indefinido', undefined],
    ['string vazia', ''],
  ])('aceita %s sem quebrar', async (_rotulo, sellerEmail) => {
    const erros = await validar({ sellerDocument: '52998224725', sellerEmail });
    expect(erros).toHaveLength(0);
  });

  it('aceita e-mail válido', async () => {
    const erros = await validar({ sellerEmail: 'fiscal@loja.com.br' });
    expect(erros).toHaveLength(0);
  });

  it('continua recusando e-mail inválido', async () => {
    const erros = await validar({ sellerEmail: 'isso-nao-e-email' });
    expect(erros).toHaveLength(1);
    expect(erros[0].property).toBe('sellerEmail');
  });

  it('salva o documento sem informar e-mail — o caso que estava quebrando', async () => {
    const erros = await validar({
      sellerDocType: 'CPF',
      sellerDocument: '529.982.247-25',
      sellerLegalName: 'Rauan Neves',
      sellerEmail: null,
    });
    expect(erros).toHaveLength(0);
  });
});
