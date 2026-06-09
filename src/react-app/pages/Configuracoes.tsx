import { Suspense, useEffect, useState } from 'react';
import {
  Users,
  Database,
  Globe,
  FileText,
  AlertTriangle,
  Layers,
  Plug,
  Settings2,
  Network,
  BookOpen,
} from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { DangerZone } from '../components/admin/DangerZone';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { useLanguage } from '@/react-app/i18n/useLanguage';

const Cadastros = lazyWithRetry(
  () => import('./Configuracoes/Cadastros').then((module) => ({ default: module.Cadastros })),
  'ConfiguracoesCadastrosTab',
);
const BackupPage = lazyWithRetry(() => import('./Configuracoes/Backup'), 'ConfiguracoesBackupTab');
const EdAppIntegration = lazyWithRetry(
  () => import('../components/integracoes/EdAppIntegration'),
  'ConfiguracoesEdAppIntegrationTab',
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
const tabFallback = <div className="min-h-[16rem] animate-pulse rounded-xl bg-slate-100" />;

export default function Configuracoes() {
  const { t } = useLanguage();
  const { empresaAtualId, empresas } = useAuth();
  const { isAdmin, isGestor } = usePermissions();
  const canAccessCompanyManagement = isAdmin;
  const [searchParams] = useSearchParams();
  const canManageMatriz = isAdmin || isGestor;
  const [activeTab, setActiveTab] = useState<
    | 'backup'
    | 'empresas'
    | 'cadastros'
    | 'importacao'
    | 'integracoes'
    | 'sistema'
    | 'danger-zone'
    | 'usuarios'
    | 'setores-gestores'
    | 'matriz-treinamento'
  >(canAccessCompanyManagement ? 'empresas' : 'cadastros');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'matriz-treinamento' && canManageMatriz) {
      setActiveTab('matriz-treinamento');
    }
  }, [searchParams, canManageMatriz]);

  return (
    <AppLayout>
      {/* Page Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          {t('settings.page.title')}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t('settings.page.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex overflow-x-auto" role="tablist">
          {canAccessCompanyManagement && (
            <button
              onClick={() => setActiveTab('empresas')}
              className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'empresas'
                  ? 'border-primary text-blue-600 dark:text-blue-300'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Globe className="w-4 h-4" />
              {t('settings.tab.companies')}
            </button>
          )}

          <button
            onClick={() => setActiveTab('usuarios')}
            className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'usuarios'
                ? 'border-primary text-blue-600 dark:text-blue-300'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('settings.tab.users')}
          </button>

          <button
            onClick={() => setActiveTab('cadastros')}
            className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'cadastros'
                ? 'border-primary text-blue-600 dark:text-blue-300'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            {t('settings.tab.registry')}
          </button>

          <button
            onClick={() => setActiveTab('setores-gestores')}
            className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'setores-gestores'
                ? 'border-primary text-blue-600 dark:text-blue-300'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Network className="w-4 h-4" />
            Gestores por Setor
          </button>

          {canManageMatriz && (
            <button
              onClick={() => setActiveTab('matriz-treinamento')}
              className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'matriz-treinamento'
                  ? 'border-primary text-blue-600 dark:text-blue-300'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Matriz de Treinamentos
            </button>
          )}

          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-primary bg-slate-50 text-primary font-semibold'
                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            {t('settings.tab.backup')}
          </button>

          <button
            onClick={() => setActiveTab('importacao')}
            className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'importacao'
                ? 'border-primary bg-slate-50 text-primary font-semibold'
                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            {t('settings.tab.imports')}
          </button>

          <button
            onClick={() => setActiveTab('integracoes')}
            className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'integracoes'
                ? 'border-primary bg-slate-50 text-primary font-semibold'
                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Plug className="w-4 h-4" />
            {t('settings.tab.integrations')}
          </button>

          {(isAdmin || isGestor) && (
            <button
              onClick={() => setActiveTab('sistema')}
              className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'sistema'
                  ? 'border-primary text-blue-600 dark:text-blue-300'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              {t('settings.tab.system')}
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setActiveTab('danger-zone')}
              className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'danger-zone'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              {t('settings.tab.dangerZone')}
            </button>
          )}
        </div>
        </div>
      </div>

      {activeTab === 'backup' && (
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

      {activeTab === 'setores-gestores' && (
        <Suspense fallback={tabFallback}>
          <SetoresGestores />
        </Suspense>
      )}

      {canManageMatriz && activeTab === 'matriz-treinamento' && (
        <Suspense fallback={tabFallback}>
          <MatrizTreinamento />
        </Suspense>
      )}

      {(isAdmin || isGestor) && activeTab === 'importacao' && (
        <Suspense fallback={tabFallback}>
          <ImportacaoPage />
        </Suspense>
      )}

      {/* Tab: Integrações */}
      {(isAdmin || isGestor) && activeTab === 'integracoes' && (
        <Suspense fallback={tabFallback}>
          <EdAppIntegration />
        </Suspense>
      )}

      {/* Tab: Sistema */}
      {(isAdmin || isGestor) && activeTab === 'sistema' && (
        <Suspense fallback={tabFallback}>
          <SistemaConfiguracoes />
        </Suspense>
      )}

      {/* Tab: Usuários */}
      {(isAdmin || isGestor) && activeTab === 'usuarios' && (
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

      {/* Tab: Danger Zone */}
      {activeTab === 'danger-zone' && <DangerZone />}
    </AppLayout>
  );
}
