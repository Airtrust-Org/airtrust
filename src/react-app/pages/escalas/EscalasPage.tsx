// src/react-app/pages/escalas/EscalasPage.tsx
//
// Thin provider wrapper — all logic lives in EscalaPageContext.
// Renders EscalasListagemView when no escala is selected,
// or EscalasDetalheView when an escala is open.

import { Suspense } from 'react';
import { EscalaPageProvider } from './EscalaPageContext';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import { useEscalaStore } from './hooks/useEscalaStore';

const EscalasListagemView = lazyWithRetry(
  () => import('./views/EscalasListagemView'),
  'EscalasListagemView',
);
const EscalasDetalheView = lazyWithRetry(
  () => import('./views/EscalasDetalheView'),
  'EscalasDetalheView',
);

function EscalasPageInner() {
  const { escalaAtualId } = useEscalaStore();
  return (
    <Suspense
      fallback={<div className="min-h-[320px] rounded-xl border border-slate-200 bg-white" />}
    >
      {escalaAtualId ? <EscalasDetalheView /> : <EscalasListagemView />}
    </Suspense>
  );
}

export default function EscalasPage() {
  return (
    <EscalaPageProvider>
      <EscalasPageInner />
    </EscalaPageProvider>
  );
}
