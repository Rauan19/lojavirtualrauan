'use client';

import { DoisFatores } from '@/components/DoisFatores';
import { CabecalhoPagina } from '@/components/admin/Pagina';

export default function SuperSegurancaPage() {
  return (
    <div className="admin-page max-w-3xl">
      <CabecalhoPagina
        icone="/super/seguranca"
        titulo="Segurança"
        descricao="Verificação em duas etapas: além da senha, o login pede o código que aparece no app autenticador do seu celular."
      />
      <section className="rounded-2xl border border-line bg-white p-5">
        <DoisFatores
          // Recarrega o painel com a sessão nova, já liberada
          onAtivado={() => window.location.assign('/super')}
        />
      </section>
    </div>
  );
}
