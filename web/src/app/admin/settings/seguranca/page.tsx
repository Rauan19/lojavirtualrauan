'use client';

import { DoisFatores } from '@/components/DoisFatores';

export default function AdminSegurancaPage() {
  return (
    <div className="admin-page max-w-3xl space-y-6">
      <div>
        <h1>Segurança</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Proteja o painel da sua loja com a verificação em duas etapas: mesmo
          que alguém descubra a sua senha, não entra sem o código do seu
          celular.
        </p>
      </div>
      <section className="rounded-2xl border border-black/10 bg-white px-5 py-5 shadow-sm">
        <h2 className="text-sm font-bold">Verificação em duas etapas</h2>
        <div className="mt-3">
          <DoisFatores />
        </div>
      </section>
    </div>
  );
}
