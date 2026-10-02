'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Chave lida pelo cadastro para já abrir com o nome da loja preenchido */
export const NOME_LOJA_INICIO = 'vendira_nome_loja';

/** Igual ao slugify da API (common/utils/slugify.ts) */
function slug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/*
 * Começo do cadastro na própria hero (padrão Nuvemshop/Shopify): a pessoa
 * digita o nome da loja e já vê o endereço que ela vai ter. O nome segue
 * para /criar-conta pelo sessionStorage, não pela URL.
 */
export function HeroComecar() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const endereco = slug(nome);

  function comecar(e: FormEvent) {
    e.preventDefault();
    try {
      if (nome.trim()) sessionStorage.setItem(NOME_LOJA_INICIO, nome.trim());
    } catch {
      // sem storage o cadastro abre vazio, sem problema
    }
    router.push('/criar-conta');
  }

  return (
    <form onSubmit={comecar} className="w-full max-w-[34rem]">
      <label htmlFor="hero-nome-loja" className="sr-only">
        Nome da sua loja
      </label>
      <div className="lp-comecar">
        <input
          id="hero-nome-loja"
          type="text"
          autoComplete="organization"
          placeholder="Nome da sua loja"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={60}
          className="lp-comecar__campo"
        />
        <button type="submit" className="lp-comecar__botao">
          Criar loja grátis
        </button>
      </div>
      <p
        className="mt-3 min-h-[1.25rem] text-[13px] text-white/75"
        aria-live="polite"
      >
        {endereco ? (
          <>
            Sua loja vai ficar em{' '}
            <strong className="font-semibold text-white">
              vendira.com.br/loja/{endereco}
            </strong>
          </>
        ) : (
          'Comece sem pagar nada'
        )}
      </p>
    </form>
  );
}
