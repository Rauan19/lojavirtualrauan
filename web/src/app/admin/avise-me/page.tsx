'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Linha = {
  productId: string;
  nome: string;
  codigo: string | null;
  esperando: number;
  estoque: number;
  desde: string;
};

type Resposta = { totalEsperando: number; produtos: Linha[] };

export default function AviseMePage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<Resposta>('/admin/avise-me', {
      token: getToken(),
      storeSlug: getUser()?.store?.slug,
    })
      .then(setDados)
      .catch((e) =>
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar'),
      );
  }, []);

  return (
    <div className="admin-page max-w-3xl space-y-5">
      <div>
        <h1>Avise-me quando chegar</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Clientes que pediram para ser avisados quando um produto esgotado
          voltar. Ao repor o estoque, cada um recebe um e-mail (em até 10
          minutos). Use a lista para decidir o que repor primeiro.
        </p>
      </div>

      {erro ? (
        <p className="border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent">
          {erro}
        </p>
      ) : null}

      {dados ? (
        dados.produtos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/15 bg-white px-4 py-8 text-center text-sm text-muted">
            Ninguém esperando agora. Quando um produto esgotar, a página dele
            mostra o botão &quot;Avise-me quando chegar&quot;.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <strong>{dados.totalEsperando}</strong> pessoa
              {dados.totalEsperando === 1 ? '' : 's'} esperando
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
              {dados.produtos.map((p) => (
                <li
                  key={`${p.productId}-${p.nome}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{p.nome}</p>
                    <p className="text-xs text-muted">
                      {p.codigo ? `${p.codigo} · ` : ''}
                      {p.estoque > 0
                        ? `${p.estoque} em estoque · avisos saindo`
                        : 'esgotado'}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#fff1f3] px-3 py-1 text-sm font-bold text-accent">
                    {p.esperando} esperando
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      ) : !erro ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : null}
    </div>
  );
}
