'use client';

import { DoisFatores } from '@/components/DoisFatores';
import { CabecalhoPagina } from '@/components/admin/Pagina';

export default function AdminSegurancaPage() {
  return (
    <div className="admin-page max-w-3xl space-y-6">
      <CabecalhoPagina
        icone="/admin/settings/seguranca"
        titulo="Segurança"
        descricao={
          <>
            Proteja o painel da sua loja com a verificação em duas etapas: mesmo
            que alguém descubra a sua senha, não entra sem o código do seu
            celular.
          </>
        }
      />
      <section className="rounded-2xl border border-black/10 bg-white px-5 py-5 shadow-sm">
        <h2 className="text-sm font-bold">Verificação em duas etapas</h2>
        <div className="mt-3">
          <DoisFatores />
        </div>
      </section>
    </div>
  );
}
