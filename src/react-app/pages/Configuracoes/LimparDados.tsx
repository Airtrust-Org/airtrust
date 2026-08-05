import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { apiJson, frontendErrorMessage } from '@/react-app/lib/api-contract';
import { Trash2, AlertTriangle, Shield, X } from 'lucide-react';
import { useLanguage } from '@/react-app/i18n/useLanguage';
import { SettingsSectionIntro } from './components/SettingsSectionIntro';

interface Contadores {
  funcionarios: number;
  qualificacoes: number;
  treinamentos: number;
  funcoes: number;
  aeronaves: number;
  setores: number;
  auditoria: number;
  importacoes: number;
}

interface Modulo {
  id: string;
  perigo: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
}

const MODULOS: Modulo[] = [
  {
    id: 'qualificacoes',
    perigo: 'ALTO',
  },
  {
    id: 'importacoes',
    perigo: 'BAIXO',
  },
  {
    id: 'treinamentos',
    perigo: 'MEDIO',
  },
  {
    id: 'funcoes',
    perigo: 'MEDIO',
  },
  {
    id: 'aeronaves',
    perigo: 'MEDIO',
  },
  {
    id: 'setores',
    perigo: 'MEDIO',
  },
  {
    id: 'auditoria',
    perigo: 'BAIXO',
  },
  {
    id: 'funcionarios',
    perigo: 'CRITICO',
  },
  {
    id: 'tudo',
    perigo: 'CRITICO',
  },
];

export default function LimparDados() {
  const { t, language } = useLanguage();
  const [contadores, setContadores] = useState<Contadores | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moduloSelecionado, setModuloSelecionado] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState('');
  const [entendi, setEntendi] = useState(false);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    carregarContadores();
  }, []);

  const carregarContadores = async () => {
    setLoadError(null);
    try {
      setContadores(await apiJson<Contadores>(`${API_BASE_URL}/admin/limpar-dados/contadores`));
    } catch (error) {
      console.error('Erro ao carregar contadores:', error);
      setContadores(null);
      setLoadError(frontendErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const abrirModal = (moduloId: string) => {
    setModuloSelecionado(moduloId);
    setConfirmacao('');
    setEntendi(false);
  };

  const fecharModal = () => {
    setModuloSelecionado(null);
    setConfirmacao('');
    setEntendi(false);
  };

  const confirmarLimpeza = async () => {
    if (confirmacao !== 'LIMPAR DADOS' || !entendi) {
      toast.warning(t('settings.danger.clean.toast.confirmSteps'));
      return;
    }

    setProcessando(true);

    try {
      await apiJson<unknown>(`/api/admin/limpar-dados/${moduloSelecionado}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacao: 'LIMPAR DADOS' }),
      });
      fecharModal();
      void carregarContadores();
    } catch (error) {
      console.error('Erro ao limpar dados:', error);
      toast.warning(frontendErrorMessage(error));
    } finally {
      setProcessando(false);
    }
  };

  const getModuloNome = (moduloId: string) => {
    if (moduloId === 'qualificacoes') return t('settings.danger.module.qualifications.name');
    if (moduloId === 'importacoes') return t('settings.danger.module.imports.name');
    if (moduloId === 'treinamentos') return t('settings.danger.module.trainingCatalog.name');
    if (moduloId === 'funcoes') return t('settings.danger.module.roles.name');
    if (moduloId === 'aeronaves') return t('settings.danger.module.aircraft.name');
    if (moduloId === 'setores') return t('settings.danger.module.sectors.name');
    if (moduloId === 'auditoria') return t('settings.danger.module.audit.name');
    if (moduloId === 'funcionarios') return t('settings.danger.module.employees.name');
    return t('settings.danger.module.clearAll.name');
  };

  const getModuloDescricao = (moduloId: string) => {
    if (moduloId === 'qualificacoes') return t('settings.danger.module.qualifications.desc');
    if (moduloId === 'importacoes') return t('settings.danger.module.imports.desc');
    if (moduloId === 'treinamentos') return t('settings.danger.module.trainingCatalog.desc');
    if (moduloId === 'funcoes') return t('settings.danger.module.roles.desc');
    if (moduloId === 'aeronaves') return t('settings.danger.module.aircraft.desc');
    if (moduloId === 'setores') return t('settings.danger.module.sectors.desc');
    if (moduloId === 'auditoria') return t('settings.danger.module.audit.desc');
    if (moduloId === 'funcionarios') return t('settings.danger.module.employees.desc');
    return t('settings.danger.module.clearAll.desc');
  };

  const getPerigoLabel = (perigo: Modulo['perigo']) => {
    if (perigo === 'BAIXO') return t('settings.danger.level.low');
    if (perigo === 'MEDIO') return t('settings.danger.level.medium');
    if (perigo === 'ALTO') return t('settings.danger.level.high');
    return t('settings.danger.level.critical');
  };

  const getCorBadge = (perigo: string) => {
    const cores = {
      BAIXO: 'bg-yellow-100 text-yellow-800',
      MEDIO: 'bg-orange-100 text-orange-800',
      ALTO: 'bg-red-100 text-red-800',
      CRITICO: 'bg-red-600 text-white',
    };
    return cores[perigo as keyof typeof cores] || cores.BAIXO;
  };

  const getCorBorda = (perigo: string) => {
    const cores = {
      BAIXO: 'border-yellow-400',
      MEDIO: 'border-orange-400',
      ALTO: 'border-red-400',
      CRITICO: 'border-red-600',
    };
    return cores[perigo as keyof typeof cores] || cores.BAIXO;
  };

  const getContador = (moduloId: string): number | null => {
    if (!contadores) return null;
    return contadores[moduloId as keyof Contadores] || 0;
  };

  const moduloAtual = MODULOS.find((m) => m.id === moduloSelecionado);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SettingsSectionIntro
        badge="Ações destrutivas"
        title={t('settings.danger.clean.title')}
        description={t('settings.danger.clean.subtitle')}
        icon={<Shield className="h-5 w-5" />}
        tone="danger"
      />

      {/* Alerta de Segurança */}
      <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-5 shadow-sm">
        <div className="flex items-start">
          <div className="mr-3 mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-red-800 font-bold mb-1">
              {t('settings.danger.clean.bannerTitle')}
            </h3>
            <p className="text-red-700 text-sm">
              {t('settings.danger.clean.bannerLine1')} {t('settings.danger.clean.bannerLine2')}{' '}
              {t('settings.danger.clean.bannerLine3')}
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {loadError}
        </div>
      )}

      {/* Grid de Módulos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULOS.map((modulo) => {
          const contador = getContador(modulo.id);

          return (
            <div
              key={modulo.id}
              className={`rounded-2xl border ${getCorBorda(modulo.perigo)} bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                    <Trash2 className="h-5 w-5 text-slate-600" />
                  </div>
                  <h3 className="font-bold text-gray-900">{getModuloNome(modulo.id)}</h3>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${getCorBadge(modulo.perigo)}`}
                >
                  {getPerigoLabel(modulo.perigo)}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-3">{getModuloDescricao(modulo.id)}</p>

              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-gray-900">
                  {loading
                    ? '...'
                    : loadError || contador === null
                      ? '—'
                      : contador.toLocaleString()}
                </span>
                <button
                  onClick={() => abrirModal(modulo.id)}
                  disabled={loading || Boolean(loadError) || contador === null || contador === 0}
                  className={`rounded-xl px-4 py-2 font-medium transition ${
                    modulo.perigo === 'CRITICO'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('settings.danger.clean.clearButton')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Confirmação */}
      {moduloSelecionado && moduloAtual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-6 w-6" />
                {t('settings.danger.clean.modal.title')}
              </h2>
              <button
                onClick={fecharModal}
                disabled={processando}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-red-800 font-bold mb-2">
                {t('settings.danger.clean.modal.removing')}
              </p>
              <p className="text-red-700 text-xl font-bold">
                {(getContador(moduloAtual.id) ?? 0).toLocaleString(
                  language === 'en-US' ? 'en-US' : 'pt-BR',
                )}{' '}
                {t('settings.danger.clean.modal.records')}
              </p>
              <p className="text-red-600 text-sm mt-2">{getModuloDescricao(moduloAtual.id)}</p>
            </div>

            <div className="space-y-4">
              {/* Checkbox de Confirmação */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={entendi}
                  onChange={(e) => setEntendi(e.target.checked)}
                  className="mt-1 h-5 w-5 text-red-600"
                  disabled={processando}
                />
                <span className="text-sm text-gray-700">
                  {t('settings.danger.clean.modal.checkbox')}
                </span>
              </label>

              {/* Input de Confirmação */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.danger.clean.modal.inputLabel')}
                </label>
                <input
                  type="text"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder={t('settings.danger.clean.modal.inputPlaceholder')}
                  disabled={processando}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={fecharModal}
                  disabled={processando}
                  className="flex-1 rounded-xl border border-gray-300 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmarLimpeza}
                  disabled={confirmacao !== 'LIMPAR DADOS' || !entendi || processando}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2 font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processando ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      {t('settings.danger.clean.modal.processing')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      {t('settings.danger.clean.modal.confirm')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
