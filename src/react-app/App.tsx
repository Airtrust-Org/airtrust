import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginSimple from './pages/LoginSimple';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';
// RequestMonitor removed
const FrmsDashboard = lazyWithRetry(() => import('./pages/frms/FrmsDashboard'), 'FrmsDashboard');
import { applySystemSettingsToDocument, getSystemSettings } from './config/systemSettings';
import { LanguageProvider } from './i18n/LanguageContext';
import { useLanguage } from './i18n/useLanguage';
import { syncRuntimeTranslation } from './i18n/runtimeTranslator';
import DashboardPrincipal from './pages/DashboardPrincipal';
import { ThemeProvider } from './theme/ThemeProvider';

// 🚀 LAZY LOADING: Páginas principais (code splitting)
const HomePerfil = lazyWithRetry(() => import('./pages/HomePerfil'), 'HomePerfil');
const TrocarSenhaPage = lazyWithRetry(() => import('./pages/TrocarSenhaPage'), 'TrocarSenhaPage');
const Funcionarios = lazyWithRetry(() => import('./pages/Funcionarios'), 'Funcionarios');
const PastaVirtual = lazyWithRetry(() => import('./pages/PastaVirtual'), 'PastaVirtual');
const Qualificacoes = lazyWithRetry(() => import('./pages/Qualificacoes'), 'Qualificacoes');
const DashboardQualificacoes = lazyWithRetry(
  () => import('./pages/DashboardQualificacoes'),
  'DashboardQualificacoes',
);
const ReclassificacaoQualificacoes = lazyWithRetry(
  () => import('./pages/ReclassificacaoQualificacoes'),
  'ReclassificacaoQualificacoes',
);
const QualificacoesAlertas = lazyWithRetry(
  () => import('./pages/qualificacoes/Alertas'),
  'QualificacoesAlertas',
);
const LicencasPage = lazyWithRetry(() => import('./pages/LicencasPage'), 'LicencasPage');
const HospedagemPage = lazyWithRetry(() => import('./pages/HospedagemPage'), 'HospedagemPage');
const FichaFuncionarioPage = lazyWithRetry(
  () => import('./pages/FichaFuncionarioPage'),
  'FichaFuncionarioPage',
);
const PerfilFuncionario = lazyWithRetry(
  () => import('./pages/funcionarios/PerfilFuncionario'),
  'PerfilFuncionario',
);
const ImportacaoPageV2 = lazyWithRetry(
  () => import('./pages/ImportacaoPageV2'),
  'ImportacaoPageV2',
);
const Simuladores = lazyWithRetry(() => import('./pages/Simuladores'), 'Simuladores');
const SimuladoresDashboard = lazyWithRetry(
  () => import('./pages/simuladores/dashboard/SimuladoresDashboard'),
  'SimuladoresDashboard',
);
const DashboardDesempenho = lazyWithRetry(
  () => import('./pages/simuladores/dashboard/DashboardDesempenho'),
  'DashboardDesempenho',
);
const FichasSessao = lazyWithRetry(() => import('./pages/simuladores/fichas'), 'FichasSessao');
const FichaDetalhe = lazyWithRetry(
  () => import('./pages/simuladores/fichas/FichaDetalhe'),
  'FichaDetalhe',
);
const CrudSimuladores = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/simuladores/crud-completo'),
  'CrudSimuladores',
);
const CrudManobras = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/manobras'),
  'CrudManobras',
);
const CrudModelos = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/modelos'),
  'CrudModelos',
);
const CrudCategorias = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/categorias'),
  'CrudCategorias',
);
const CrudTiposSessao = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/tipos-sessao'),
  'CrudTiposSessao',
);
const CrudInstrutores = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/instrutores'),
  'CrudInstrutores',
);
const CrudModelosSessao = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/modelos-sessao'),
  'CrudModelosSessao',
);
const RelatoriosSimuladores = lazyWithRetry(
  () => import('./pages/simuladores/relatorios'),
  'RelatoriosSimuladores',
);
const RelatoriosDashboard = lazyWithRetry(
  () => import('./pages/relatorios/Dashboard'),
  'RelatoriosDashboard',
);
const ConfiguracoesCadastros = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/configuracoes'),
  'ConfiguracoesCadastros',
);
const Configuracoes = lazyWithRetry(() => import('./pages/Configuracoes'), 'Configuracoes');
const ConfiguracoesCadastrosGerais = lazyWithRetry(
  () => import('./pages/Configuracoes/CadastrosPage'),
  'ConfiguracoesCadastrosGerais',
);
const IntegracoesEdApp = lazyWithRetry(
  () => import('./pages/Configuracoes/Integracoes/EdApp'),
  'IntegracoesEdApp',
);
const ComplianceSettings = lazyWithRetry(
  () => import('./pages/ComplianceSettings').then((m) => ({ default: m.ComplianceSettings })),
  'ComplianceSettings',
);
const VerificarCertificado = lazyWithRetry(
  () => import('./pages/VerificarCertificado'),
  'VerificarCertificado',
);
const ValidarCertificado = lazyWithRetry(
  () => import('./pages/ValidarCertificado'),
  'ValidarCertificado',
);
const AceitarConvite = lazyWithRetry(() => import('./pages/AceitarConvite'), 'AceitarConvite');
const AdminUsuarios = lazyWithRetry(() => import('./pages/admin/UsuariosPage'), 'AdminUsuarios');
const AdminPermissoes = lazyWithRetry(
  () => import('./pages/admin/PermissoesPage'),
  'AdminPermissoes',
);
// Escalas (Planejamento de Escala Mensal)
const EscalasMensais = lazyWithRetry(
  () => import('./pages/escalas/EscalasMensais'),
  'EscalasMensais',
);
const ConfiguracaoEscala = lazyWithRetry(
  () => import('./pages/escalas/ConfiguracaoEscalaPage'),
  'ConfiguracaoEscala',
);
const MinhaEscala = lazyWithRetry(() => import('./pages/escalas/MinhaEscalaPage'), 'MinhaEscala');
const EvdPage = lazyWithRetry(() => import('./pages/escalas/EvdPage'), 'EvdPage');
// FRMS (Gestão de Fadiga e Jornada)
const FrmsFichaTripulante = lazyWithRetry(
  () => import('./pages/frms/FrmsFichaTripulante'),
  'FrmsFichaTripulante',
);
const FrmsAlertasPainel = lazyWithRetry(
  () => import('./pages/frms/FrmsAlertasPainel'),
  'FrmsAlertasPainel',
);
const FrmsRelatorios = lazyWithRetry(() => import('./pages/frms/FrmsRelatorios'), 'FrmsRelatorios');
const FrmsEscalas = lazyWithRetry(() => import('./pages/frms/FrmsEscalas'), 'FrmsEscalas');
const FrmsConfiguracoes = lazyWithRetry(
  () => import('./pages/frms/FrmsConfiguracoes'),
  'FrmsConfiguracoes',
);
const FrmsImportacaoFira = lazyWithRetry(
  () => import('./pages/frms/FrmsImportacaoFira'),
  'FrmsImportacaoFira',
);
const FrmsHistoricoFira = lazyWithRetry(
  () => import('./pages/frms/FrmsHistoricoFira'),
  'FrmsHistoricoFira',
);
const FrmsConceitos = lazyWithRetry(() => import('./pages/frms/FrmsConceitos'), 'FrmsConceitos');
const FrmsFadigaAcumulada = lazyWithRetry(
  () => import('./pages/frms/FrmsFadigaAcumulada'),
  'FrmsFadigaAcumulada',
);
const FrmsCheckinFadiga = lazyWithRetry(
  () => import('./pages/frms/FrmsCheckinFadiga'),
  'FrmsCheckinFadiga',
);
const FrmsFadigaPainel = lazyWithRetry(
  () => import('./pages/frms/FrmsFadigaPainel'),
  'FrmsFadigaPainel',
);
const FrmsFadigaHistorico = lazyWithRetry(
  () => import('./pages/frms/FrmsFadigaHistorico'),
  'FrmsFadigaHistorico',
);
const HorasVooPage = lazyWithRetry(() => import('./pages/HorasVooPage'), 'HorasVooPage');
const SolicitacoesTreinamentoPage = lazyWithRetry(
  () => import('./pages/SolicitacoesTreinamentoPage'),
  'SolicitacoesTreinamentoPage',
);
const TreinamentosPlanejadosPage = lazyWithRetry(
  () => import('./pages/TreinamentosPlanejadosPage'),
  'TreinamentosPlanejadosPage',
);

// LMS — Learning Management System
const LmsCatalogo = lazyWithRetry(() => import('./pages/lms/LmsCatalogo'), 'LmsCatalogo');
const LmsCursoDetalhe = lazyWithRetry(
  () => import('./pages/lms/LmsCursoDetalhe'),
  'LmsCursoDetalhe',
);
const LmsAdminCursos = lazyWithRetry(() => import('./pages/lms/LmsAdminCursos'), 'LmsAdminCursos');
const LmsPlayer = lazyWithRetry(() => import('./pages/lms/LmsPlayer'), 'LmsPlayer');
const LmsPreviewPlayer = lazyWithRetry(
  () => import('./pages/lms/LmsPreviewPlayer'),
  'LmsPreviewPlayer',
);
const LmsPlayerH5p = lazyWithRetry(() => import('./pages/lms/LmsPlayerH5p'), 'LmsPlayerH5p');
const LmsPlayerPdf = lazyWithRetry(() => import('./pages/lms/LmsPlayerPdf'), 'LmsPlayerPdf');
const LmsPlayerPptx = lazyWithRetry(() => import('./pages/lms/LmsPlayerPptx'), 'LmsPlayerPptx');
const LmsRelatorios = lazyWithRetry(() => import('./pages/lms/LmsRelatorios'), 'LmsRelatorios');
const LmsHistoricoEdApp = lazyWithRetry(
  () => import('./pages/lms/LmsHistoricoEdApp'),
  'LmsHistoricoEdApp',
);
const LmsDashboard = lazyWithRetry(() => import('./pages/lms/LmsDashboard'), 'LmsDashboard');
const LmsMatriculas = lazyWithRetry(() => import('./pages/lms/LmsMatriculas'), 'LmsMatriculas');

// SGSO — Sistema de Gerenciamento de Segurança Operacional
const Sgso = lazyWithRetry(() => import('./pages/Sgso'), 'Sgso');
const SgsoRelato = lazyWithRetry(() => import('./pages/SgsoRelato'), 'SgsoRelato');
const SgsoRelprevPage = lazyWithRetry(
  () => import('./pages/sgso/SgsoRelprevPage'),
  'SgsoRelprevPage',
);
const SgsoBowtiePage = lazyWithRetry(() => import('./pages/sgso/SgsoBowtiePage'), 'SgsoBowtiePage');
const SgsoFratPage = lazyWithRetry(() => import('./pages/sgso/SgsoFratPage'), 'SgsoFratPage');

// Loading fallback component
const PageLoader = () => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-gray-600">{t('common.loading')}</p>
      </div>
    </div>
  );
};

const RuntimeTranslationBridge = () => {
  const { language } = useLanguage();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    syncRuntimeTranslation(language).then((dispose) => {
      cleanup = dispose;
    });

    return () => {
      cleanup?.();
    };
  }, [language]);

  return null;
};

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      gcTime: 1000 * 60 * 30, // 30 minutos
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Redireciona para a home correta de acordo com o perfil do usuário */
function HomeRouter() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  const role = user?.role?.toUpperCase() ?? '';
  if (role === 'ALUNO' || role === 'STUDENT' || role === 'INSTRUTOR' || role === 'INSTRUCTOR' || role === 'USUARIO') return <HomePerfil />;
  return <DashboardPrincipal />;
}

function LmsEntryRouter() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  const role = user?.role?.toUpperCase() ?? '';
  if (role === 'ALUNO' || role === 'STUDENT' || role === 'INSTRUTOR' || role === 'INSTRUCTOR') return <Navigate to="/lms/cursos" replace />;
  return <LmsDashboard />;
}

export default function App() {
  useEffect(() => {
    applySystemSettingsToDocument(getSystemSettings());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
          toastOptions={{
            style: {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '14px',
              borderRadius: '12px',
            },
          }}
        />
        <LanguageProvider>
          <RuntimeTranslationBridge />
          <AuthProvider>
            <BrowserRouter>
              <div className="airtrust-global-standard">
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/login" element={<LoginSimple />} />
                      <Route path="/aceitar-convite" element={<AceitarConvite />} />
                      <Route
                        path="/admin/usuarios"
                        element={
                          <ProtectedRoute>
                            <AdminUsuarios />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/permissoes"
                        element={
                          <ProtectedRoute>
                            <AdminPermissoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute>
                            <HomeRouter />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/home"
                        element={
                          <ProtectedRoute>
                            <HomePerfil />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/perfil/trocar-senha"
                        element={
                          <ProtectedRoute>
                            <TrocarSenhaPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/funcionarios"
                        element={
                          <ProtectedRoute>
                            <Funcionarios />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/pasta-virtual/:funcionarioId"
                        element={
                          <ProtectedRoute>
                            <PastaVirtual />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes"
                        element={
                          <ProtectedRoute>
                            <Qualificacoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes/dashboard"
                        element={
                          <ProtectedRoute>
                            <DashboardQualificacoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes/reclassificacao"
                        element={
                          <ProtectedRoute>
                            <ReclassificacaoQualificacoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes/alertas"
                        element={
                          <ProtectedRoute>
                            <QualificacoesAlertas />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/licencas"
                        element={
                          <ProtectedRoute>
                            <LicencasPage />
                          </ProtectedRoute>
                        }
                      />
                    <Route
                      path="/hospedagem"
                      element={
                        <ProtectedRoute>
                          <HospedagemPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/funcionarios/:id/ficha"
                      element={
                        <ProtectedRoute>
                          <FichaFuncionarioPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/funcionarios/:id"
                      element={
                        <ProtectedRoute>
                          <FichaFuncionarioPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/funcionarios/:id/perfil"
                      element={
                        <ProtectedRoute>
                          <PerfilFuncionario />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores"
                      element={
                        <ProtectedRoute>
                          <Simuladores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/dashboard"
                      element={
                        <ProtectedRoute>
                          <SimuladoresDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/desempenho/:funcionarioId"
                      element={
                        <ProtectedRoute>
                          <DashboardDesempenho />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/calendario"
                      element={<Navigate to="/simuladores" replace />}
                    />
                    <Route
                      path="/simuladores/fichas"
                      element={
                        <ProtectedRoute>
                          <FichasSessao />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/configuracoes"
                      element={
                        <ProtectedRoute>
                          <ConfiguracoesCadastros />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/fichas/:id"
                      element={
                        <ProtectedRoute>
                          <FichaDetalhe />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/sessoes/nova"
                      element={
                        <ProtectedRoute>
                          <Navigate to="/simuladores" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/simuladores"
                      element={
                        <ProtectedRoute>
                          <CrudSimuladores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/manobras"
                      element={
                        <ProtectedRoute>
                          <CrudManobras />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/modelos"
                      element={
                        <ProtectedRoute>
                          <CrudModelos />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/categorias"
                      element={
                        <ProtectedRoute>
                          <CrudCategorias />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/tipos"
                      element={
                        <ProtectedRoute>
                          <CrudTiposSessao />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/instrutores"
                      element={
                        <ProtectedRoute>
                          <CrudInstrutores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/modelos-sessao"
                      element={
                        <ProtectedRoute>
                          <CrudModelosSessao />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/relatorios"
                      element={
                        <ProtectedRoute>
                          <RelatoriosDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/relatorios"
                      element={
                        <ProtectedRoute>
                          <RelatoriosSimuladores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes"
                      element={
                        <ProtectedRoute>
                          <Configuracoes />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/matriz-treinamentos"
                      element={
                        <ProtectedRoute>
                          <Navigate to="/configuracoes?tab=matriz-treinamento" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/cadastros"
                      element={
                        <ProtectedRoute>
                          <ConfiguracoesCadastrosGerais />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/integracoes/edapp"
                      element={
                        <ProtectedRoute>
                          <IntegracoesEdApp />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/integracoes/sigvoos"
                      element={
                        <ProtectedRoute>
                          <IntegracoesEdApp />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/compliance"
                      element={
                        <ProtectedRoute>
                          <ComplianceSettings />
                        </ProtectedRoute>
                      }
                    />
                    {/* Treinamentos integrado em qualificações */}
                    {/* Importação Inteligente */}
                    <Route
                      path="/importacao"
                      element={
                        <ProtectedRoute>
                          <ImportacaoPageV2 />
                        </ProtectedRoute>
                      }
                    />
                    {/* Compat: redirecionar rota antiga para a nova */}
                    <Route
                      path="/habilitacoes"
                      element={<Navigate to="/qualificacoes" replace />}
                    />

                    {/* Escalas — Planejamento Mensal (protegido) */}
                    <Route
                      path="/escalas"
                      element={
                        <ProtectedRoute>
                          <EscalasMensais />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/escalas/configuracoes"
                      element={
                        <ProtectedRoute>
                          <Suspense fallback={<PageLoader />}>
                            <ConfiguracaoEscala />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/escalas/minha-escala"
                      element={
                        <ProtectedRoute>
                          <Suspense fallback={<PageLoader />}>
                            <MinhaEscala />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/escalas/diaria"
                      element={
                        <ProtectedRoute>
                          <EvdPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/escalas/evd"
                      element={
                        <ProtectedRoute>
                          <EvdPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* FRMS — Gestão de Fadiga e Jornada (protegido) */}
                    <Route
                      path="/frms"
                      element={
                        <ProtectedRoute>
                          <FrmsDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/tripulante/:id"
                      element={
                        <ProtectedRoute>
                          <FrmsFichaTripulante />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/alertas"
                      element={
                        <ProtectedRoute>
                          <FrmsAlertasPainel />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/relatorios"
                      element={
                        <ProtectedRoute>
                          <FrmsRelatorios />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/escalas"
                      element={
                        <ProtectedRoute>
                          <FrmsEscalas />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/configuracoes"
                      element={
                        <ProtectedRoute>
                          <FrmsConfiguracoes />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/importacao/fira"
                      element={
                        <ProtectedRoute>
                          <FrmsImportacaoFira />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/importacao/fira/historico"
                      element={
                        <ProtectedRoute>
                          <FrmsHistoricoFira />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/conceitos"
                      element={
                        <ProtectedRoute>
                          <FrmsConceitos />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/metodologia"
                      element={<Navigate to="/frms/conceitos" replace />}
                    />
                    <Route
                      path="/frms/fadiga-acumulada"
                      element={
                        <ProtectedRoute>
                          <FrmsFadigaAcumulada />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/checkin"
                      element={
                        <ProtectedRoute>
                          <FrmsCheckinFadiga />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/fadiga-painel"
                      element={
                        <ProtectedRoute>
                          <FrmsFadigaPainel />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/fadiga-historico"
                      element={
                        <ProtectedRoute>
                          <FrmsFadigaHistorico />
                        </ProtectedRoute>
                      }
                    />

                    {/* SGSO — Sistema de Gerenciamento de Segurança Operacional */}
                    <Route
                      path="/sgso"
                      element={
                        <ProtectedRoute>
                          <Sgso />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/relatos/:id"
                      element={
                        <ProtectedRoute>
                          <SgsoRelato />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/relprev"
                      element={
                        <ProtectedRoute>
                          <SgsoRelprevPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/bowtie"
                      element={
                        <ProtectedRoute>
                          <SgsoBowtiePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/frat"
                      element={
                        <ProtectedRoute>
                          <SgsoFratPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Horas de Voo — caderneta standalone */}
                    <Route
                      path="/horas-voo"
                      element={
                        <ProtectedRoute>
                          <HorasVooPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Treinamentos Planejados — agora aba de Qualificações */}
                    <Route
                      path="/treinamentos/planejados"
                      element={<Navigate to="/qualificacoes" replace />}
                    />
                    <Route
                      path="/treinamentos/solicitacoes"
                      element={
                        <ProtectedRoute>
                          <SolicitacoesTreinamentoPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* LMS — Learning Management System */}
                    <Route
                      path="/lms"
                      element={
                        <ProtectedRoute>
                          <LmsEntryRouter />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/dashboard"
                      element={
                        <ProtectedRoute>
                          <LmsEntryRouter />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/admin"
                      element={<Navigate to="/lms/admin/cursos" replace />}
                    />
                    <Route
                      path="/treinamentos"
                      element={<Navigate to="/treinamentos/planejados" replace />}
                    />
                    <Route
                      path="/lms/cursos"
                      element={
                        <ProtectedRoute>
                          <LmsCatalogo />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/cursos/:id"
                      element={
                        <ProtectedRoute>
                          <LmsCursoDetalhe />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/admin/cursos"
                      element={
                        <ProtectedRoute>
                          <LmsAdminCursos />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayer />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/preview/:cursoId"
                      element={
                        <ProtectedRoute>
                          <LmsPreviewPlayer />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/h5p/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayerH5p />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/pdf/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayerPdf />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/pptx/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayerPptx />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/relatorios"
                      element={
                        <ProtectedRoute>
                          <LmsRelatorios />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/legado-edapp"
                      element={
                        <ProtectedRoute>
                          <LmsHistoricoEdApp />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/historico-edapp"
                      element={
                        <ProtectedRoute>
                          <Navigate to="/lms/legado-edapp" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/matriculas"
                      element={
                        <ProtectedRoute>
                          <LmsMatriculas />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/matriculas/:cursoId"
                      element={
                        <ProtectedRoute>
                          <LmsMatriculas />
                        </ProtectedRoute>
                      }
                    />

                    {/* Rotas PÚBLICAS de Verificação de Certificados */}
                    <Route path="/verificar-certificado" element={<VerificarCertificado />} />
                    <Route path="/verificar-certificado/:hash" element={<VerificarCertificado />} />
                    <Route path="/c/:hash" element={<ValidarCertificado />} />
                    <Route path="/validar/:hash" element={<ValidarCertificado />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </div>
            </BrowserRouter>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
