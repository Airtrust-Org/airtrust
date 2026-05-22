/**
 * Simuladores - Main Page
 * Layout: Header + Tabs (cada aba tem seu próprio dashboard)
 *
 * CHANGELOG:
 * - 2026-01-14: Removida aba "Sessões de Treinamento" - gerenciamento via calendário
 */

import { useState, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ClipboardCheck, Settings, Loader, Calendar } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { Button as UIButton } from '@/react-app/components/UI';
import { importWithRetry, lazyWithRetry } from '@/react-app/utils/lazyWithRetry';

const ModalNovaSessao = lazyWithRetry(
  () => import('@/react-app/components/modals/ModalNovaSessao'),
  'SimuladoresModalNovaSessao',
);

// Lazy load das tabs com preload no hover
const TabAgenda = lazyWithRetry(
  () => import('./simuladores/agenda/CalendarioAgendamentos'),
  'SimuladoresTabAgenda',
);
const TabFichas = lazyWithRetry(
  () =>
    import('./simuladores/fichas/index').then((m) => ({ default: m.FichasAvaliacaoContent })),
  'SimuladoresTabFichas',
);
const TabGestaoWrapper = lazyWithRetry(
  () => import('./simuladores/tabs/TabGestaoWrapper'),
  'SimuladoresTabGestao',
);

// Preload function para melhorar UX
const preloadTab = (tab: 'agenda' | 'fichas' | 'gestao') => {
  if (tab === 'agenda') {
    void importWithRetry(
      () => import('./simuladores/agenda/CalendarioAgendamentos'),
      'PreloadTabAgenda',
      {
        reloadOnChunkError: false,
        maxAttempts: 2,
      },
    );
  } else if (tab === 'fichas') {
    void importWithRetry(() => import('./simuladores/fichas/index'), 'PreloadTabFichas', {
      reloadOnChunkError: false,
      maxAttempts: 2,
    });
  } else if (tab === 'gestao') {
    void importWithRetry(() => import('./simuladores/tabs/TabGestaoWrapper'), 'PreloadTabGestao', {
      reloadOnChunkError: false,
      maxAttempts: 2,
    });
  }
};

type TabType = 'agenda' | 'fichas' | 'gestao';

export default function Simuladores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const [modalNovaSessaoOpen, setModalNovaSessaoOpen] = useState(false);

  const validTabs: TabType[] = ['agenda', 'fichas', 'gestao'];

  // Tab ativa derivada da URL, com fallback para 'agenda'
  const activeTab: TabType = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'agenda';

  // Atualizar URL quando mudar tab
  const setActiveTab = (tab: TabType) => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === 'agenda') {
      newParams.delete('tab');
      newParams.delete('sessao');
    } else {
      newParams.set('tab', tab);
      if (tab !== 'fichas') newParams.delete('sessao');
    }
    setSearchParams(newParams, { replace: true });
  };

  const tabs = [
    { id: 'agenda' as TabType, label: 'Agenda / Calendário', icon: CalendarDays },
    { id: 'fichas' as TabType, label: 'Fichas de Avaliação', icon: ClipboardCheck },
    { id: 'gestao' as TabType, label: 'Gestão', icon: Settings },
  ];

  return (
    <AppLayout>
      {/* Page Header */}
      <PageHeader
        className="mb-6"
        title="Simuladores & Voo"
        subtitle="Gerencie sessões de treinamento em simulador e em aeronave real"
        actions={
          <UIButton
            onClick={() => setModalNovaSessaoOpen(true)}
            className="px-6 py-3 border-transparent bg-primary text-white hover:bg-primary/90 focus:ring-primary/30 shadow-sm"
          >
            <Calendar className="w-5 h-5" />
            Nova Sessão de Voo
          </UIButton>
        }
      />

      {/* Main content container */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Tabs Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex overflow-x-auto" role="tablist">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onMouseEnter={() => preloadTab(tab.id)}
                  className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                    isActive
                      ? 'border-primary text-blue-600 dark:text-blue-300'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-4">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-64">
                <Loader className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            }
          >
            {activeTab === 'agenda' && <TabAgenda />}
            {activeTab === 'fichas' && <TabFichas />}
            {activeTab === 'gestao' && <TabGestaoWrapper />}
          </Suspense>
        </div>

        {/* Modal Nova Sessão */}
        {modalNovaSessaoOpen && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/30">
                <Loader className="w-8 h-8 animate-spin text-white" />
              </div>
            }
          >
            <ModalNovaSessao
              isOpen={modalNovaSessaoOpen}
              onClose={() => setModalNovaSessaoOpen(false)}
              onSuccess={() => {
                setModalNovaSessaoOpen(false);
                window.location.reload();
              }}
            />
          </Suspense>
        )}
      </div>
    </AppLayout>
  );
}
