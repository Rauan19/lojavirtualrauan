'use client';

import { Suspense } from 'react';
import { SuperLojasInner } from './lojas-inner';

export default function SuperLojasPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted">Carregando lojas…</p>}
    >
      <SuperLojasInner />
    </Suspense>
  );
}
