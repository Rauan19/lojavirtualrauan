'use client';

import { DoisFatores } from '@/components/DoisFatores';

export default function SuperSegurancaPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-bold">Segurança</h1>
        <p className="text-sm text-muted">
          Verificação em duas etapas: além da senha, o login pede o código que
          aparece no app autenticador do seu celular.
        </p>
      </div>
      <section className="border border-line bg-white p-5">
        <DoisFatores
          // Recarrega o painel com a sessão nova, já liberada
          onAtivado={() => window.location.assign('/super')}
        />
      </section>
    </div>
  );
}
