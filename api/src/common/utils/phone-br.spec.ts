import { isValidBrazilianPhone } from './phone-br';

describe('isValidBrazilianPhone', () => {
  it.each([
    ['11988887777', 'celular SP'],
    ['21988887777', 'celular RJ'],
    ['1133334444', 'fixo SP'],
    ['(11) 98888-7777', 'com máscara'],
  ])('aceita %s (%s)', (phone) => {
    expect(isValidBrazilianPhone(phone)).toBe(true);
  });

  it.each([
    ['00988887777', 'DDD inexistente'],
    ['11888887777', 'celular sem o 9'],
    ['11999999999', 'todos dígitos iguais'],
    ['119999', 'curto demais'],
    ['119888877771', 'longo demais'],
    ['', 'vazio'],
  ])('recusa %s (%s)', (phone) => {
    expect(isValidBrazilianPhone(phone)).toBe(false);
  });
});
