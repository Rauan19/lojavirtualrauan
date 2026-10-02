'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Resumo = {
  url: string;
  produtosNoCatalogo: number;
  produtosSemFoto: number;
};

export default function CatalogoPage() {
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const user = getUser();
    api<Resumo>('/admin/catalogo', {
      token: getToken(),
      storeSlug: user?.store?.slug,
    })
      .then(setDados)
      .catch((e) =>
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar'),
      );
  }, []);

  async function copiar() {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(dados.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="admin-page max-w-3xl space-y-5">
      <div>
        <h1>Google e Instagram</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Seus produtos aparecendo no Google Shopping e na aba de compras do
          Instagram e do Facebook. Você cadastra o endereço abaixo uma vez; eles
          buscam os produtos sozinhos todo dia, com preço, estoque e fotos
          atualizados.
        </p>
      </div>

      {erro ? (
        <p role="alert" className="border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent">
          {erro}
        </p>
      ) : null}

      {dados ? (
        <>
          <section className="rounded-2xl border border-black/10 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-bold">Endereço do seu catálogo</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded border border-line bg-[#f7f8fa] px-3 py-2 text-[13px]">
                {dados.url}
              </code>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => void copiar()}
              >
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="mt-3 text-sm">
              <strong>{dados.produtosNoCatalogo}</strong> produto
              {dados.produtosNoCatalogo === 1 ? '' : 's'} no catálogo
              {dados.produtosSemFoto > 0 ? (
                <span className="text-[#7a5200]">
                  {' '}
                  · {dados.produtosSemFoto} sem foto ficaram de fora (o Google
                  não aceita produto sem foto)
                </span>
              ) : null}
            </p>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white px-5 py-4 shadow-sm">
            <h2 className="text-sm font-bold">Google Shopping</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
              <li>
                Entre no{' '}
                <a
                  href="https://merchants.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline"
                >
                  Google Merchant Center
                </a>{' '}
                com a conta Google da loja (é grátis).
              </li>
              <li>Confirme o endereço da sua loja quando ele pedir.</li>
              <li>
                Vá em <strong className="text-ink">Produtos → Adicionar produtos</strong>{' '}
                e escolha <strong className="text-ink">adicionar de um arquivo</strong>{' '}
                com <strong className="text-ink">busca programada</strong>.
              </li>
              <li>Cole o endereço do catálogo e escolha atualizar todo dia.</li>
            </ol>
            <p className="mt-2 text-xs text-muted">
              Os produtos aparecem de graça na aba Shopping. Anúncios pagos são
              opcionais, no Google Ads.
            </p>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white px-5 py-4 shadow-sm">
            <h2 className="text-sm font-bold">Instagram e Facebook</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
              <li>
                Abra o{' '}
                <a
                  href="https://business.facebook.com/commerce"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline"
                >
                  Gerenciador de Comércio
                </a>{' '}
                com a conta do Facebook da loja.
              </li>
              <li>
                Crie um <strong className="text-ink">catálogo</strong> do tipo
                comércio eletrônico.
              </li>
              <li>
                Em <strong className="text-ink">Fontes de dados → Feed de dados</strong>,
                cole o endereço do catálogo e programe a atualização diária.
              </li>
              <li>
                Ligue o catálogo ao perfil comercial do Instagram para marcar
                produtos nas fotos.
              </li>
            </ol>
          </section>
        </>
      ) : !erro ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : null}
    </div>
  );
}
