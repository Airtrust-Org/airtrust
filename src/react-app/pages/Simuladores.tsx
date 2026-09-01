/**
 * Simuladores - Main Page
 * Layout: Header + Tabs (cada aba tem seu próprio dashboard)
 *
 * CHANGELOG:
 * - 2026-01-14: Removida aba "Sessões de Treinamento" - gerenciamento via calendário
 */

import { useState, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Loader,
  Settings,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { Button as UIButton } from '@/react-app/components/UI';
import { importWithRetry, lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import { useGuiasInstrutorPermissions } from '@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions';

const ModalNovaSessao = lazyWithRetry(
  () => import('@/react-app/components/modals/ModalNovaSessao'),
  'SimuladoresModalNovaSessao',
);

const TabAgenda = lazyWithRetry(
  () => import('./simuladores/agenda/CalendarioAgendamentos'),
  'SimuladoresTabAgenda',
);
const TabPlanejamento = lazyWithRetry(
  () => import('./simuladores/planejamento/PlanejamentoSimuladoresV3'),
  'SimuladoresTabPlanejamento',
);
const PlanejamentoPolicyConfig = lazyWithRetry(
  () => import('./simuladores/planejamento/PlanejamentoPolicyConfig'),
  'SimuladoresPlanejamentoPolicyConfig',
);
const TabFichas = lazyWithRetry(
  () => import('./simuladores/fichas/index').then((m) => ({ default: m.FichasAvaliacaoContent })),
  'SimuladoresTabFichas',
);
const TabGestaoWrapper = lazyWithRetry(
  () => import('./simuladores/tabs/TabGestaoWrapper'),
  'SimuladoresTabGestao',
);
const TabGuiasInstrutor = lazyWithRetry(
  () => import('./instrutor/GuiasInstrutor').then((m) => ({ default: m.GuiasInstrutorContent })),
  'SimuladoresTabGuiasInstrutor',
);

const preloadTab = (tab: 'agenda' | 'planejamento' | 'fichas' | 'gestao' | 'guias') => {
  if (tab === 'agenda') {
    void importWithRetry(
      () => import('./simuladores/agenda/CalendarioAgendamentos'),
      'PreloadTabAgenda',
      {
        reloadOnChunkError: false,
        maxAttempts: 2,
      },
    );
  } else if (tab === 'planejamento') {
    void importWithRetry(
      () => import('./simuladores/planejamento/PlanejamentoSimuladoresV3'),
      'PreloadTabPlanejamento',
      {
        reloadOnChunkError: false,
        maxAttempts: 2,
      },
    );
    void importWithRetry(
      () => import('./simuladores/planejamento/PlanejamentoPolicyConfig'),
      'PreloadPlanejamentoPolicyConfig',
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
  } else if (tab === 'guias') {
    void importWithRetry(() => import('./instrutor/GuiasInstrutor'), 'PreloadTabGuiasInstrutor', {
      reloadOnChunkError: false,
      maxAttempts: 2,
    });
  }
};

type TabType = 'agenda' | 'planejamento' | 'fichas' | 'gestao' | 'guias';

export default function Simuladores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const [modalNovaSessaoOpen, setModalNovaSessaoOpen] = useState(false);
  const { podeVisualizar: podeVerGuias } = useGuiasInstrutorPermissions();

  const validTabs: TabType[] = [
    'agenda',
    'planejamento',
    'fichas',
    'gestao',
    ...(podeVerGuias ? (['guias'] as const) : []),
  ];

  const activeTab: TabType = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'agenda';

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
    { id: 'planejamento' as TabType, label: 'Planejamento', icon: CalendarRange },
    { id: 'fichas' as TabType, label: 'Fichas de Avaliação', icon: ClipboardCheck },
    { id: 'gestao' as TabType, label: 'Gestão', icon: Settings },
    ...(podeVerGuias
      ? [{ id: 'guias' as TabType, label: 'Guias do Instrutor', icon: BookOpen }]
      : []),
  ];

  return (
    <AppLayout>
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

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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

        <div className="p-4">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-64">
                <Loader className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            }
          >
            {activeTab === 'agenda' && <TabAgenda />}
            {activeTab === 'planejamento' && (
              <>
                <PlanejamentoPolicyConfig />
                <TabPlanejamento />
              </>
            )}
            {activeTab === 'fichas' && <TabFichas />}
            {activeTab === 'gestao' && <TabGestaoWrapper />}
            {activeTab === 'guias' && <TabGuiasInstrutor />}
          </Suspense>
        </div>

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