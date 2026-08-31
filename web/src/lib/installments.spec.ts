import {
  installmentHeadlineFromPlan,
  mapApiOptionsToPlan,
  type InstallmentOption,
} from './installments';

/*
 * CDC art. 52: parcelamento com juros exige informar o montante dos
 * acréscimos e a soma total a pagar. Mostrar só o valor da parcela é
 * infração, então o total tem que aparecer em toda linha com juros.
 */
/** money() usa Intl, que separa "R$" do valor com espaço não-quebrável. */
const txt = (v: string | null) => (v ?? '').replace(/ /g, ' ');

describe('parcelamento — informação obrigatória de crédito', () => {
  const semJuros: InstallmentOption = {
    count: 6,
    installmentAmount: 50,
    totalAmount: 300,
    interestFree: true,
    installmentRate: 0,
    source: 'store_offer',
    label: '',
  };
  const comJuros: InstallmentOption = {
    count: 12,
    installmentAmount: 30,
    totalAmount: 360,
    interestFree: false,
    installmentRate: 2.5,
    source: 'mercadopago',
    label: '',
  };

  it('mostra o total quando a única opção é com juros', () => {
    const h = installmentHeadlineFromPlan(300, [comJuros], 0);
    expect(txt(h.cardLine)).toContain('com juros');
    expect(txt(h.cardLine)).toContain('total R$ 360,00');
  });

  it('mostra o total na linha extra quando há também opção sem juros', () => {
    const h = installmentHeadlineFromPlan(300, [semJuros, comJuros], 6);
    expect(txt(h.cardLine)).toContain('sem juros');
    expect(txt(h.cardExtraLine)).toContain('com juros');
    expect(txt(h.cardExtraLine)).toContain('total R$ 360,00');
  });

  it('não inventa linha com juros quando todas as opções são sem juros', () => {
    const h = installmentHeadlineFromPlan(300, [semJuros], 6);
    expect(h.cardExtraLine).toBeNull();
  });

  it('sempre mostra o preço à vista junto', () => {
    const h = installmentHeadlineFromPlan(300, [comJuros], 0);
    expect(txt(h.cashLine)).toBe('À vista R$ 300,00');
  });

  it('rótulo de opção com juros carrega o total', () => {
    const [semJurosMap, comJurosMap] = mapApiOptionsToPlan([
      {
        count: 6,
        installmentAmount: 50,
        totalAmount: 300,
        interestFree: true,
        installmentRate: 0,
        source: 'store_offer',
      },
      {
        count: 12,
        installmentAmount: 30,
        totalAmount: 360,
        interestFree: false,
        installmentRate: 2.5,
        source: 'mercadopago',
      },
    ]);
    expect(txt(semJurosMap.label)).toBe('6x de R$ 50,00 sem juros');
    expect(txt(comJurosMap.label)).toContain('total R$ 360,00');
  });
});
