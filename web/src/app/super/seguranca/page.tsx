'use client';

import { useEffect, useState } from 'react';
import { DoisFatores } from '@/components/DoisFatores';
import { TrocarSenha } from '@/components/TrocarSenha';
import { CabecalhoPagina } from '@/components/admin/Pagina';
import { getUser } from '@/lib/auth';

export default function SuperSegurancaPage() {
  // O layout já confirmou a sessão em /auth/me e salvou o usuário
  const [senhaProvisoria, setSenhaProvisoria] = useState(false);
  useEffect(() => {
    setSenhaProvisoria(Boolean(getUser()?.trocarSenha));
  }, []);

  return (
    <div className="admin-page max-w-3xl space-y-5">
      <CabecalhoPagina
        icone="/super/seguranca"
        titulo="Segurança"
        descricao="Sua senha e a verificação em duas etapas: além da senha, o login pede o código que aparece no app autenticador do seu celular."
      />

      {senhaProvisoria ? (
        <section className="rounded-2xl border border-[#f1d58a] bg-[#fffaf0] p-5">
          <h2 className="text-base font-bold">Primeiro, crie a sua senha</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Você entrou com uma senha provisória. Troque por uma que só você
            saiba; depois ative a verificação em duas etapas e o painel abre.
          </p>
          <TrocarSenha
            obrigatoria
            // Recarrega com a sessão nova: o layout lê o próximo passo
            onTrocada={() => window.location.assign('/super/seguranca')}
          />
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-white p-5">
            <DoisFatores
              // Recarrega o painel com a sessão nova, já liberada
              onAtivado={() => window.location.assign('/super')}
            />
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-base font-bold">Trocar senha</h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              As outras sessões abertas com a senha antiga saem na hora.
            </p>
            <TrocarSenha onTrocada={() => undefined} />
          </section>
        </>
      )}
    </div>
  );
}
