'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, money } from '@/lib/api';

type Opcao = { id: string; name: string; price: number; days: number };

const CHAVE_CEP = 'vitrine:cep';

function formatarCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Frete na página do produto: o CEP é a primeira coisa que o brasileiro
 * digita antes de decidir. Mesma cotação do checkout (o servidor calcula);
 * o CEP fica lembrado no aparelho para o próximo produto e o checkout.
 */
export function CalcularFrete({
  storeSlug,
  item,
}: {
  storeSlug: string;
  item: { productId: string; variantId?: string | null; price: number };
}) {
  const [cep, setCep] = useState('');
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_CEP);
      if (salvo) setCep(formatarCep(salvo));
    } catch {
      /* navegador sem armazenamento: só não lembra */
    }
  }, []);

  // Trocou a opção (cor/tamanho): o preço pode mudar, a cotação também
  useEffect(() => {
    setOpcoes(null);
  }, [item.productId, item.variantId, item.price]);

  async function calcular(e: FormEvent) {
    e.preventDefault();
    const digitos = cep.replace(/\D/g, '');
    if (digitos.length !== 8) {
      setErro('Digite os 8 números do CEP.');
      return;
    }
    setOcupado(true);
    setErro('');
    try {
      const r = await api<{ options: Opcao[] }>('/shipping/quote', {
        method: 'POST',
        storeSlug,
        body: {
          zipCode: digitos,
          subtotal: item.price,
          items: [
            {
              productId: item.productId,
              ...(item.variantId ? { variantId: item.variantId } : {}),
              quantity: 1,
              price: item.price,
            },
          ],
        },
      });
      setOpcoes(r.options || []);
      try {
        localStorage.setItem(CHAVE_CEP, digitos);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setOpcoes(null);
      setErro(
        err instanceof Error
          ? err.message
          : 'Não foi possível calcular agora. Tente de novo.',
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-5">
      <form onSubmit={calcular} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1" htmlFor="frete-cep">
          <span className="label">Calcular frete e prazo</span>
          <input
            id="frete-cep"
            name="cep"
            className="field h-11"
            inputMode="numeric"
            autoComplete="shipping postal-code"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => setCep(formatarCep(e.target.value))}
          />
        </label>
        <button className="btn btn-ghost h-11 shrink-0 px-4" disabled={ocupado}>
          {ocupado ? 'Calculando…' : 'Calcular'}
        </button>
      </form>
      <a
        href="https://buscacepinter.correios.com.br/app/endereco/index.php"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-[12px] text-muted underline-offset-2 hover:underline"
      >
        Não sei meu CEP
      </a>
      <div aria-live="polite">
        {erro ? <p className="mt-1 text-[13px] text-accent">{erro}</p> : null}
        {opcoes ? (
          opcoes.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">
              A loja não entrega neste CEP ainda.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line border border-line">
              {opcoes.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{o.name}</span>
                    {o.days > 0 ? (
                      <span className="text-muted">
                        {' '}
                        · até {o.days}{' '}
                        {o.days === 1 ? 'dia útil' : 'dias úteis'}
                      </span>
                    ) : null}
                  </span>
                  <strong
                    className={`shrink-0 ${o.price <= 0 ? 'text-[var(--ok)]' : ''}`}
                  >
                    {o.price <= 0 ? 'Grátis' : money(o.price)}
                  </strong>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
