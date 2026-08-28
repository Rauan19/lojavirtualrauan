import { Suspense } from 'react';
import ContaCadastroPage from './cadastro-client';

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Carregando...</p>}>
      <ContaCadastroPage />
    </Suspense>
  );
}
