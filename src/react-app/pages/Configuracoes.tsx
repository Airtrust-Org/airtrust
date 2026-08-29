import { Suspense, useEffect, useState } from 'react';
import {
  BookOpen,
  Database,
  FileText,
  Globe,
  Layers,
  Network,
  Plug,
  Settings2,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { useLanguage } from '@/react-app/i18n/useLanguage';

const Cadastros = lazyWithRetry(
  () => import('./Configuracoes/Cadastros').then((module) => ({ default: module.Cadastros })),
  'ConfiguracoesCadastrosTab',
);
const BackupPage = lazyWithRetry(() => import('./Configuracoes/Backup'), 'ConfiguracoesBackupTab');
const SigvoosIntegration = lazyWithRetry(
  () => import('../components/integracoes/SigvoosIntegration'),
  'ConfiguracoesSigvoosIntegrationTab',
);
const GestaoEmpresas = lazyWithRetry(
  () =>
    import('./Configuracoes/GestaoEmpresas').then((module) => ({ default: module.GestaoEmpresas })),
  'ConfiguracoesGestaoEmpresasTab',
);
const SetoresGestores = lazyWithRetry(
  () =>
    import('./Configuracoes/SetoresGestores').then((module) => ({
      default: module.SetoresGestores,
    })),
  'ConfiguracoesSetoresGestoresTab',
);
const MatrizTreinamento = lazyWithRetry(
  () =>
    import('./Configuracoes/MatrizTreinamento').then((module) => ({
      default: module.MatrizTreinamento,
    })),
  'ConfiguracoesMatrizTreinamentoTab',
);
const SistemaConfiguracoes = lazyWithRetry(
  () => import('./Configuracoes/Sistema'),
  'ConfiguracoesSistemaTab',
);
const ImportacaoPage = lazyWithRetry(
  () => import('./Configuracoes/Importacao'),
  'ConfiguracoesImportacaoTab',
);
const UsuariosContent = lazyWithRetry(
  () => import('./Configuracoes/Usuarios').then((m) => ({ default: m.UsuariosConfig })),
  'ConfiguracoesUsuariosTab',
);

const tabFallback = (
  <div className="min-h-[16rem] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
);

type ConfigTab =
  | 'backup'
  | 'empresas'
  | 'cadastros'
  | 'importacao'
  | 'integracoes'
  | 'sistema'
  | 'usuarios'
  | 'setores-gestores'
  | 'matriz-treinamento';

function tabClass(active: boolean) {
  return `flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-all sm:px-5 ${
    active
      ? 'border-primary bg-[var(--at-selected)] text-[var(--at-text-primary)]'
      : 'border-transparent text-[var(--at-text-secondary)] hover:bg-[var(--at-hover)] hover:text-[var(--at-text-primary)]'
  }`;
}

export default function Configuracoes() {
  const { t } = useLanguage();
  const { empresaAtualId, empresas } = useAuth();
  const { isAdmin, isGestor } = usePermissions();
  const canAccessCompanyManagement = isAdmin;
  const canManageMatriz = isAdmin || isGestor;
  const canManageUsers = isAdmin;
  const canManageBackup = isAdmin;
  const canManageOperationalSettings = isAdmin || isGestor;
  const [searchParams] = useSearchParams();

  // The operational organization registry is the safe/default entry point.
  // Platform/company administration remains available to authorized users but
  // no longer becomes the first screen merely because the user is an admin.
  const [activeTab, setActiveTab] = useState<ConfigTab>('cadastros');

  useEffect(() => {
    const requested = searchParams.get('tab') as ConfigTab | null;
    if (!requested) return;

    if (requested === 'cadastros') {
      setActiveTab('cadastros');
      return;
    }
    if (requested === 'matriz-treinamento' && canManageMatriz) {
      setActiveTab(requested);
      return;
    }
    if (requested === 'empresas' && canAccessCompanyManagement) {
      setActiveTab(requested);
      return;
    }
    if (requested === 'usuarios' && canManageUsers) {
      setActiveTab(requested);
      return;
    }
    if (requested === 'backup' && canManageBackup) {
      setActiveTab(requested);
      return;
    }
    if (
      ['importacao', 'integracoes', 'sistema', 'setores-gestores'].includes(requested) &&
      canManageOperationalSettings
    ) {
      setActiveTab(requested);
    }
  }, [
    searchParams,
    canAccessCompanyManagement,
    canManageBackup,
    canManageMatriz,
    canManageOperationalSettings,
    canManageUsers,
  ]);

  useEffect(() => {
    if (activeTab === 'empresas' && !canAccessCompanyManagement) {
      setActiveTab('cadastros');
      return;
    }
    if (activeTab === 'usuarios' && !canManageUsers) {
      setActiveTab('cadastros');
      return;
    }
    if (activeTab === 'backup' && !canManageBackup) {
      setActiveTab('cadastros');
      return;
    }
    if (
      ['importacao', 'integracoes', 'sistema', 'setores-gestores'].includes(activeTab) &&
      !canManageOperationalSettings
    ) {
      setActiveTab('cadastros');
    }
  }, [
    activeTab,
    canAccessCompanyManagement,
    canManageBackup,
    canManageOperationalSettings,
    canManageUsers,
  ]);

  const hasAdministration =
    canAccessCompanyManagement || canManageUsers || canManageBackup || canManageOperationalSettings;

  return (
    <AppLayout>
      <PageHeader
        className="mb-4"
        title={t('settings.page.title')}
        subtitle="Configure primeiro a operação da organização. Administração e manutenção ficam separadas abaixo."
      />

      <div className="mb-4 overflow-hidden rounded-lg border border-[var(--at-border)] bg-[var(--at-bg-surface)]">
        <div className="border-b border-[var(--at-border)] px-3 pt-3 sm:px-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--at-text-subtle)]">
            Configuração da organização
          </p>
          <div className="flex overflow-x-auto" role="tablist" aria-label="Configuração da organização">
            <button
              type="button"
              onClick={() => setActiveTab('cadastros')}
              className={tabClass(activeTab === 'cadastros')}
              aria-selected={activeTab === 'cadastros'}
              role="tab"
            >
              <Layers className="h-4 w-4" />
              {t('settings.tab.registry')}
            </button>

            {canManageOperationalSettings && (
              <button
                type="button"
                onClick={() => setActiveTab('setores-gestores')}
                className={tabClass(activeTab === 'setores-gestores')}
                aria-selected={activeTab === 'setores-gestores'}
                role="tab"
              >
                <Network className="h-4 w-4" />
                Gestores por Setor
              </button>
            )}

            {canManageMatriz && (
              <button
                type="button"
                onClick={() => setActiveTab('matriz-treinamento')}
                className={tabClass(activeTab === 'matriz-treinamento')}
                aria-selected={activeTab === 'matriz-treinamento'}
                role="tab"
              >
                <BookOpen className="h-4 w-4" />
                Matriz de Treinamentos
              </button>
            )}

            {canManageOperationalSettings && (
              <button
                type="button"
                onClick={() => setActiveTab('integracoes')}
                className={tabClass(activeTab === 'integracoes')}
                aria-selected={activeTab === 'integracoes'}
                role="tab"
              >
                <Plug className="h-4 w-4" />
                {t('settings.tab.integrations')}
              </button>
            )}

            {canManageOperationalSettings && (
              <button
                type="button"
                onClick={() => setActiveTab('importacao')}
                className={tabClass(activeTab === 'importacao')}
                aria-selected={activeTab === 'importacao'}
                role="tab"
              >
                <FileText className="h-4 w-4" />
                {t('settings.tab.imports')}
              </button>
            )}
          </div>
        </div>

        {hasAdministration && (
          <div className="px-3 pt-3 sm:px-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--at-text-subtle)]">
              Administração e manutenção
            </p>
            <div className="flex overflow-x-auto" role="tablist" aria-label="Administração e manutenção">
              {canAccessCompanyManagement && (
                <button
                  type="button"
                  onClick={() => setActiveTab('empresas')}
                  className={tabClass(activeTab === 'empresas')}
                  aria-selected={activeTab === 'empresas'}
                  role="tab"
                >
                  <Globe className="h-4 w-4" />
                  {t('settings.tab.companies')}
                </button>
              )}

              {canManageUsers && (
                <button
                  type="button"
                  onClick={() => setActiveTab('usuarios')}
                  className={tabClass(activeTab === 'usuarios')}
                  aria-selected={activeTab === 'usuarios'}
                  role="tab"
                >
                  <Users className="h-4 w-4" />
                  {t('settings.tab.users')}
                </button>
              )}

              {canManageBackup && (
                <button
                  type="button"
                  onClick={() => setActiveTab('backup')}
                  className={tabClass(activeTab === 'backup')}
                  aria-selected={activeTab === 'backup'}
                  role="tab"
                >
                  <Database className="h-4 w-4" />
                  {t('settings.tab.backup')}
                </button>
              )}

              {canManageOperationalSettings && (
                <button
                  type="button"
                  onClick={() => setActiveTab('sistema')}
                  className={tabClass(activeTab === 'sistema')}
                  aria-selected={activeTab === 'sistema'}
                  role="tab"
                >
                  <Settings2 className="h-4 w-4" />
                  {t('settings.tab.system')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {canManageBackup && activeTab === 'backup' && (
        <Suspense fallback={tabFallback}>
          <BackupPage />
        </Suspense>
      )}

      {canAccessCompanyManagement && activeTab === 'empresas' && (
        <Suspense fallback={tabFallback}>
          <GestaoEmpresas />
        </Suspense>
      )}

      {activeTab === 'cadastros' && (
        <Suspense fallback={tabFallback}>
          <Cadastros />
        </Suspense>
      )}

      {canManageOperationalSettings && activeTab === 'setores-gestores' && (
        <Suspense fallback={tabFallback}>
          <SetoresGestores />
        </Suspense>
      )}

      {canManageMatriz && activeTab === 'matriz-treinamento' && (
        <Suspense fallback={tabFallback}>
          <MatrizTreinamento />
        </Suspense>
      )}

      {canManageOperationalSettings && activeTab === 'importacao' && (
        <Suspense fallback={tabFallback}>
          <ImportacaoPage />
        </Suspense>
      )}

      {canManageOperationalSettings && activeTab === 'integracoes' && (
        <Suspense fallback={tabFallback}>
          <SigvoosIntegration />
        </Suspense>
      )}

      {canManageOperationalSettings && activeTab === 'sistema' && (
        <Suspense fallback={tabFallback}>
          <SistemaConfiguracoes />
        </Suspense>
      )}

      {canManageUsers && activeTab === 'usuarios' && (
        <Suspense fallback={tabFallback}>
          <UsuariosContent
            empresaId={empresaAtualId}
            empresasDisponiveis={empresas.map((empresa) => ({
              id: empresa.id,
              nome: empresa.nome,
              codigo: empresa.codigo,
            }))}
          />
        </Suspense>
      )}
    </AppLayout>
  );
}
