import { Suspense } from 'react';
import ContaEntrarPage from './entrar-client';

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Carregando...</p>}>
      <ContaEntrarPage />
    </Suspense>
  );
}
