'use client';

import { Suspense } from 'react';
import { AdminPlanosInner } from './planos-inner';

export default function AdminPlanosPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-page max-w-3xl">
          <h1>Planos</h1>
          <p className="text-sm text-muted">Carregando...</p>
        </div>
      }
    >
      <AdminPlanosInner />
    </Suspense>
  );
}
