/**
 * FRMS — Configuração Metodológica (/frms/configuracoes)
 *
 * Parâmetros que não têm efeito no motor atual permanecem no contrato técnico,
 * mas não são exibidos como configurações operacionais editáveis.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Brain,
  Bell,
  Save,
  RotateCcw,
  AlertTriangle,
  Check,
  Info,
  ArrowLeft,
  ChevronDown,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import {
  useFrmsConfiguracoes,
  useFrmsMutation,
  useFrmsNotificacaoConfig,
  FrmsNotificacaoConfigRow,
} from '@/react-app/hooks/useFrms';
import { clearApiCacheByPattern } from '@/react-app/hooks/useApi';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import FrmsWorkspaceNav from './components/FrmsWorkspaceNav';
import { safeFrmsVisibleErrorMessage } from './frmsVisibleErrorPolicy';

interface ConfigGroup {
  label: string;
  icon: React.ReactNode;
  description: string;
  keys: string[];
}

const GRUPOS_REGULATORIOS: ConfigGroup[] = [
  {
    label: 'Limites de Jornada (FDP)',
    icon: <Shield className="h-4 w-4" />,
    description: 'Flight Duty Period — RBAC 117',
    keys: ['FDP_MAXIMO_HORAS', 'FDP_ALERTA_RESTANTE_HORAS'],
  },
  {
    label: 'Horas de Voo (HV)',
    icon: <Shield className="h-4 w-4" />,
    description: 'Limites regulatórios RBAC 117 / IS 117-001',
    keys: [
      'HV_DIARIA_HORAS',
      'HV_DIA_ALERTA_RESTANTE_HORAS',
      'HV_7_DIAS_HORAS',
      'HV_28_DIAS_HORAS',
      'HV_MES_HORAS',
      'HV_365_DIAS_HORAS',
    ],
  },
  {
    label: 'Repouso',
    icon: <Shield className="h-4 w-4" />,
    description: 'Período mínimo de repouso entre jornadas',
    keys: [
      'REPOUSO_MINIMO_HORAS',
      'REPOUSO_PLATAFORMA_MINIMO_HORAS',
      'REPOUSO_PLATAFORMA_MAXIMO_HORAS',
    ],
  },
  {
    label: 'Limiares de Alerta',
    icon: <AlertTriangle className="h-4 w-4" />,
    description: 'Percentuais de disparo de alertas',
    keys: ['ALERTA_AVISO_PCT', 'ALERTA_ATENCAO_PCT', 'ALERTA_CRITICO_PCT', 'ALERTA_VIOLACAO_PCT'],
  },
];

const GRUPOS_FATORIZACAO: ConfigGroup[] = [
  {
    label: 'Ciclo Embarcado (Process S — Borbély)',
    icon: <Brain className="h-4 w-4" />,
    description: 'Acúmulo homeostático de fadiga durante ciclo offshore',
    keys: [
      'CICLO_EMBARCADO_ATIVO',
      'CICLO_EMBARCADO_DIA_INICIO',
      'CICLO_EMBARCADO_DIA_MAX',
      'CICLO_EMBARCADO_PCT_MIN',
      'CICLO_EMBARCADO_PCT_MAX',
    ],
  },
  {
    label: 'Fator Apresentação (Process C — Circadiano)',
    icon: <Brain className="h-4 w-4" />,
    description: 'Faixas horárias conforme variação circadiana',
    keys: [
      'APRESENTACAO_MADRUGADA_H_MIN',
      'APRESENTACAO_MADRUGADA_H_MAX',
      'APRESENTACAO_MADRUGADA_FATOR',
      'APRESENTACAO_AMANHECER_H_MIN',
      'APRESENTACAO_AMANHECER_H_MAX',
      'APRESENTACAO_AMANHECER_FATOR',
      'APRESENTACAO_DIURNO_H_MIN',
      'APRESENTACAO_DIURNO_H_MAX',
      'APRESENTACAO_DIURNO_FATOR',
      'APRESENTACAO_TARDE_H_MIN',
      'APRESENTACAO_TARDE_H_MAX',
      'APRESENTACAO_TARDE_FATOR',
      'APRESENTACAO_NOITE_FATOR',
    ],
  },
  {
    label: 'Fator Duração',
    icon: <Brain className="h-4 w-4" />,
    description: 'Penalidade por jornada curta ou longa',
    keys: ['DURACAO_LONGA_MINUTOS', 'DURACAO_LONGA_FATOR', 'DURACAO_NORMAL_FATOR'],
  },
  {
    label: 'Fator Repouso',
    icon: <Brain className="h-4 w-4" />,
    description: 'Classificação do repouso inter-jornada',
    keys: [
      'REPOUSO_ADEQUADO_MINUTOS',
      'REPOUSO_ADEQUADO_FATOR',
      'REPOUSO_RUIM_MINUTOS',
      'REPOUSO_RUIM_FATOR',
      'REPOUSO_CRITICO_FATOR',
    ],
  },
  {
    label: 'Janela Noturna Operacional (decolagens/pousos)',
    icon: <Brain className="h-4 w-4" />,
    description:
      'Faixa operacional para penalidade em decolagens e pousos noturnos. Nao e a WOCL fisiologica de despertar.',
    keys: ['NOTURNO_INICIO_HORA', 'NOTURNO_FIM_HORA', 'NOTURNO_FATOR'],
  },
  {
    label: 'Fator Horas de Voo (Quantidade)',
    icon: <Brain className="h-4 w-4" />,
    description: 'Classificação por volume de HV no dia',
    keys: [
      'HV_MUITAS_MINUTOS',
      'HV_MUITAS_FATOR',
      'HV_POUCAS_MINUTOS',
      'HV_POUCAS_FATOR',
      'HV_NORMAL_FATOR',
    ],
  },
];

const GRUPOS_OPERACIONAIS: ConfigGroup[] = [
  {
    label: 'Parâmetros Operacionais',
    icon: <Brain className="h-4 w-4" />,
    description: 'Premissa de sono provisória configurável por empresa.',
    keys: ['MINUTOS_ANTES_APRESENTACAO', 'HORAS_SONO_PADRAO'],
  },
  {
    label: 'Fatores Operacionais',
    icon: <Brain className="h-4 w-4" />,
    description:
      'Penalidades por base AWAY, não-aclimatado e extensão FDP para tripulação aumentada',
    keys: ['FATOR_BASE_AWAY_PCT', 'FATOR_ACLIMATADO_NAO_PCT', 'FATOR_TRIPULACAO_AUM_HORAS'],
  },
  {
    label: 'Limiares configuráveis do índice estimado de efetividade',
    icon: <Brain className="h-4 w-4" />,
    description:
      'Limiares configuráveis do índice estimado de efetividade. Proxy local inspirado em modelos biomatemáticos; não representa validação formal SAFTE-FAST.',
    keys: [
      'EFFECTIV_VERDE_MIN',
      'EFFECTIV_AMARELO_MAX',
      'EFFECTIV_VERMELHO_MAX',
      'EFFECTIV_PERIODO_PCT',
    ],
  },
  {
    label: 'Modelo de Sono Offshore',
    icon: <Brain className="h-4 w-4" />,
    description:
      'Parâmetros do modelo de sono/despertar para tripulantes embarcados em plataformas offshore.',
    keys: ['REPOUSO_MIN_PRE_APRESENTACAO', 'REPOUSO_MIN_POS_LIBERACAO', 'REPOUSO_QUALIDADE_HOTEL'],
  },
];

const LABELS: Record<string, string> = {
  FDP_MAXIMO_HORAS: 'FDP baseline (11 h, profile-dependent)',
  FDP_ALERTA_RESTANTE_HORAS: 'Alerta FDP restante (horas)',
  HV_DIARIA_HORAS: 'HV diária helicóptero (8 h) — Lei 13.475 / RBAC 117',
  HV_DIA_ALERTA_RESTANTE_HORAS: 'Alerta HV dia restante (horas)',
  HV_7_DIAS_HORAS: 'HV 7 dias (45 h) — IOGP/contratual',
  HV_28_DIAS_HORAS: 'HV 28 dias consecutivos (93 h) — RBAC 117 Apêndice C',
  HV_MES_HORAS: 'HV mês calendário (90 h) — Lei 13.475 art. 30 IV',
  HV_365_DIAS_HORAS: 'HV 365 dias (930 h) — RBAC 117',
  REPOUSO_MINIMO_HORAS: 'Repouso baseline (12 h, profile-dependent)',
  REPOUSO_PLATAFORMA_MINIMO_HORAS: 'Repouso Plataforma mín (horas)',
  REPOUSO_PLATAFORMA_MAXIMO_HORAS: 'Repouso Plataforma máx (horas)',
  ALERTA_AVISO_PCT: 'Aviso (%)',
  ALERTA_ATENCAO_PCT: 'Atenção (%)',
  ALERTA_CRITICO_PCT: 'Crítico (%)',
  ALERTA_VIOLACAO_PCT: 'Violação (%)',
  CICLO_EMBARCADO_ATIVO: 'Habilitado (0/1)',
  CICLO_EMBARCADO_DIA_INICIO: 'Dia início do fator',
  CICLO_EMBARCADO_DIA_MAX: 'Dia fator máximo',
  CICLO_EMBARCADO_PCT_MIN: 'Fator mínimo (fração, dia 1)',
  CICLO_EMBARCADO_PCT_MAX: 'Fator máximo (fração, dia N)',
  APRESENTACAO_MADRUGADA_H_MIN: 'Madrugada início (hora)',
  APRESENTACAO_MADRUGADA_H_MAX: 'Madrugada fim (hora)',
  APRESENTACAO_MADRUGADA_FATOR: 'Fator madrugada',
  APRESENTACAO_AMANHECER_H_MIN: 'Amanhecer início (hora)',
  APRESENTACAO_AMANHECER_H_MAX: 'Amanhecer fim (hora)',
  APRESENTACAO_AMANHECER_FATOR: 'Fator amanhecer',
  APRESENTACAO_DIURNO_H_MIN: 'Diurno início (hora)',
  APRESENTACAO_DIURNO_H_MAX: 'Diurno fim (hora)',
  APRESENTACAO_DIURNO_FATOR: 'Fator diurno',
  APRESENTACAO_TARDE_H_MIN: 'Tarde início (hora)',
  APRESENTACAO_TARDE_H_MAX: 'Tarde fim (hora)',
  APRESENTACAO_TARDE_FATOR: 'Fator tarde',
  APRESENTACAO_NOITE_FATOR: 'Fator noite',
  DURACAO_LONGA_MINUTOS: 'Jornada longa (min)',
  DURACAO_LONGA_FATOR: 'Fator longa',
  DURACAO_CURTA_MINUTOS: 'Jornada curta (min)',
  DURACAO_CURTA_FATOR: 'Fator curta',
  DURACAO_NORMAL_FATOR: 'Fator normal',
  REPOUSO_ADEQUADO_MINUTOS: 'Repouso adequado (min)',
  REPOUSO_ADEQUADO_FATOR: 'Fator adequado',
  REPOUSO_RUIM_MINUTOS: 'Repouso ruim (min)',
  REPOUSO_RUIM_FATOR: 'Fator ruim',
  REPOUSO_CRITICO_FATOR: 'Fator crítico',
  NOTURNO_INICIO_HORA: 'Noturno início (hora)',
  NOTURNO_FIM_HORA: 'Noturno fim (hora)',
  NOTURNO_FATOR: 'Fator noturno',
  HV_MUITAS_MINUTOS: 'HV muitas (min)',
  HV_MUITAS_FATOR: 'Fator muitas HV',
  HV_POUCAS_MINUTOS: 'HV poucas (min)',
  HV_POUCAS_FATOR: 'Fator poucas HV',
  HV_NORMAL_FATOR: 'Fator HV normal',
  FATOR_BASE_AWAY_PCT: 'Penalidade AWAY (%)',
  FATOR_ACLIMATADO_NAO_PCT: 'Penalidade não-aclimatado (%)',
  FATOR_TRIPULACAO_AUM_HORAS: 'Extensão FDP trip. aumentada (h)',
  EFFECTIV_VERDE_MIN: 'Verde — mínimo (%)',
  EFFECTIV_AMARELO_MAX: 'Amarelo — máx (%)',
  EFFECTIV_VERMELHO_MAX: 'Vermelho — máx (%)',
  EFFECTIV_PERIODO_PCT: 'Período abaixo limiar (%)',
  REPOUSO_MIN_PRE_APRESENTACAO: 'Repouso mín. pré-apresentação (min)',
  REPOUSO_MIN_POS_LIBERACAO: 'Repouso mín. pós-liberação (min)',
  REPOUSO_QUALIDADE_HOTEL: 'Qualidade sono hotel (%)',
  MINUTOS_ANTES_APRESENTACAO: 'Tempo entre acordar e se apresentar (min)',
  HORAS_SONO_PADRAO: 'Horas de sono assumidas (padrão)',
};

const FIELD_HELPERS: Record<string, string> = {
  MINUTOS_ANTES_APRESENTACAO:
    'Tempo entre o tripulante acordar e se apresentar para o voo (padrão ICAO: 90 min).',
  HORAS_SONO_PADRAO:
    'Usado quando o tripulante não informa a hora que foi dormir. Quando informar, este valor é substituído automaticamente.',
  CICLO_EMBARCADO_PCT_MAX:
    'Fator fracionário do modelo (não é percentual). Default do modelo: -0.15. O valor exibido é o da revisão ativa; não mutar V1 in-place.',
  CICLO_EMBARCADO_PCT_MIN: 'Fator fracionário do modelo (não é percentual).',
  HV_7_DIAS_HORAS: 'Fonte IOGP/contratual. Não rotular como Lei 13.475.',
  HV_28_DIAS_HORAS: '28 dias consecutivos, distinto do mês calendário.',
  HV_MES_HORAS: 'Mês calendário. Distinto de 28 dias consecutivos.',
  ALERTA_AVISO_PCT: 'Política interna de alerta, não limite legal.',
  ALERTA_ATENCAO_PCT: 'Política interna de alerta, não limite legal.',
  ALERTA_CRITICO_PCT: 'Política interna de alerta, não limite legal.',
  ALERTA_VIOLACAO_PCT: 'Política interna de alerta, não limite legal.',
  NOTURNO_INICIO_HORA:
    'Inicio da janela noturna operacional (decolagens/pousos). A WOCL fisiologica de despertar e tratada separadamente no modelo biomatematico (02:00-06:00).',
  NOTURNO_FIM_HORA: 'Fim da janela noturna operacional (decolagens/pousos).',
  NOTURNO_FATOR:
    'Penalidade aplicada a operacoes dentro da janela noturna operacional. Diferente da penalidade por acordar na WOCL fisiologica.',
};

const FIELD_BOUNDS: Record<string, { min?: number; max?: number; step?: number }> = {
  MINUTOS_ANTES_APRESENTACAO: { min: 30, max: 180, step: 1 },
  HORAS_SONO_PADRAO: { min: 4, max: 12, step: 0.1 },
};

export const PARAMETROS_DECORATIVOS = new Set([
  'EFFECTIV_PERIODO_PCT',
  'REPOUSO_MIN_PRE_APRESENTACAO',
  'REPOUSO_MIN_POS_LIBERACAO',
  'REPOUSO_QUALIDADE_HOTEL',
  'DURACAO_CURTA_MINUTOS',
  'DURACAO_CURTA_FATOR',
]);

type Tab = 'regulatorios' | 'fatorizacao' | 'offshore' | 'notificacoes';

export default function FrmsConfiguracoes() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('regulatorios');
  const { data, loading: isLoading, refetch } = useFrmsConfiguracoes();
  const { mutate } = useFrmsMutation();
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (data?.limites) setValues({ ...data.limites });
  }, [data]);

  const handleChange = useCallback((key: string, val: string) => {
    const num = parseFloat(val);
    if (!Number.isNaN(num)) {
      setValues((prev) => ({ ...prev, [key]: num }));
      setSaved(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const configs = Object.entries(values).map(([nome, valor_numerico]) => ({ nome, valor_numerico }));
      const savedLimites = (await mutate('/api/frms/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs }),
      })) as Record<string, number>;

      if (savedLimites && typeof savedLimites === 'object') setValues({ ...savedLimites });
      clearApiCacheByPattern('/frms');
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setSaveError(safeFrmsVisibleErrorMessage('config-save', e));
      console.error('Erro ao salvar:', e);
    } finally {
      setSaving(false);
    }
  }, [values, mutate]);

  const handleRestore = useCallback(async () => {
    if (!(await confirmDialog('Restaurar TODOS os parâmetros para os valores padrão de referência?')))
      return;
    setRestoring(true);
    try {
      await mutate('/api/frms/configuracoes/restaurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      refetch();
    } catch (e) {
      console.error('Erro ao restaurar:', e);
    } finally {
      setRestoring(false);
    }
  }, [mutate, refetch]);

  const handleReprocessar = useCallback(async () => {
    setReprocessing(true);
    setReprocessProgress(null);
    setSaveError(null);
    try {
      const tripulantes =
        ((await mutate('/api/frms/tripulantes-ativos', {
          method: 'GET',
        })) as Array<{ id: number; nome: string }>) ?? [];

      if (tripulantes.length === 0) {
        navigate('/frms');
        return;
      }

      for (let i = 0; i < tripulantes.length; i++) {
        const t = tripulantes[i];
        setReprocessProgress({ current: i + 1, total: tripulantes.length, name: t.nome });
        await mutate(`/api/frms/reprocessar/${t.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      }

      clearApiCacheByPattern('/frms');
      navigate('/frms');
    } catch (e) {
      setSaveError(safeFrmsVisibleErrorMessage('config-reprocess', e));
      console.error('Erro ao reprocessar:', e);
    } finally {
      setReprocessing(false);
      setReprocessProgress(null);
    }
  }, [mutate, navigate]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'regulatorios', label: 'Limites Regulatórios', icon: <Shield className="h-4 w-4" /> },
    { id: 'fatorizacao', label: 'Fatorização Metodológica', icon: <Brain className="h-4 w-4" /> },
    { id: 'offshore', label: 'Operação Offshore & Ambiente', icon: <Brain className="h-4 w-4" /> },
    { id: 'notificacoes', label: 'Notificações', icon: <Bell className="h-4 w-4" /> },
  ];

  const renderGroup = (group: ConfigGroup) => {
    const visibleKeys = group.keys.filter((key) => !PARAMETROS_DECORATIVOS.has(key));
    if (visibleKeys.length === 0) return null;

    return (
      <div key={group.label} className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          {group.icon}
          <h3 className="font-semibold text-gray-900">{group.label}</h3>
        </div>
        <p className="mb-3 text-xs text-gray-500">{group.description}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleKeys.map((key) => (
            <div key={key} className="space-y-1">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                <span>{LABELS[key] || key}</span>
              </label>
              <input
                type="number"
                step={FIELD_BOUNDS[key]?.step ?? 'any'}
                min={FIELD_BOUNDS[key]?.min}
                max={FIELD_BOUNDS[key]?.max}
                value={values[key] ?? ''}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-primary/40"
              />
              {FIELD_HELPERS[key] ? (
                <p className="text-[11px] leading-relaxed text-gray-500">{FIELD_HELPERS[key]}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <FrmsWorkspaceNav />

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => navigate('/frms')}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Administração FRMS
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900">Configurações e políticas FRMS</h1>
            <p className="text-sm text-gray-500">
              Parâmetros ativos do motor, limites e notificações. Campos sem efeito não são exibidos como controles.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:from-primary/90 hover:to-emerald-600/90 disabled:opacity-50"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Salvo' : saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>

        <div className="py-2">
          <div className="mb-6 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-md'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <details className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-amber-900 [&::-webkit-details-marker]:hidden">
              <Settings2 className="h-4 w-4" />
              Governança avançada
              <span className="ml-auto text-xs font-normal text-amber-700">reprocessamento e restauração</span>
            </summary>
            <div className="border-t border-amber-200 px-4 py-4">
              <p className="mb-3 text-xs text-amber-800">
                Estas ações afetam dados derivados do FRMS e ficam separadas da edição normal de parâmetros.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleReprocessar}
                  disabled={reprocessing}
                  className="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                  title="Recalcula jornadas, fatorizações e alertas com os parâmetros ativos para cada tripulante."
                >
                  <RefreshCw className={`h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
                  {reprocessProgress
                    ? `Reprocessando ${reprocessProgress.current}/${reprocessProgress.total} — ${reprocessProgress.name}`
                    : reprocessing
                      ? 'Iniciando...'
                      : 'Reprocessar dados derivados'}
                </button>
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <RotateCcw className={`h-4 w-4 ${restoring ? 'animate-spin' : ''}`} />
                  Restaurar valores padrão
                </button>
              </div>
            </div>
          </details>

          {saveError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{saveError}</span>
              <button onClick={() => setSaveError(null)} className="ml-auto text-red-400 hover:text-red-600">
                ×
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="py-20 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
              <p className="mt-3 text-sm text-gray-500">Carregando configurações...</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              {activeTab === 'regulatorios' && (
                <div>
                  <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-4">
                    <Info className="h-4 w-4 text-primary" />
                    <span className="text-xs text-gray-500">
                      Limites regulatórios RBAC 117 / IS 117-001. Alterações auditadas.
                    </span>
                  </div>
                  {GRUPOS_REGULATORIOS.map(renderGroup)}
                </div>
              )}

              {activeTab === 'fatorizacao' && (
                <div>
                  <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-4">
                    <Info className="h-4 w-4 text-primary" />
                    <span className="text-xs text-gray-500">
                      Modelo Borbély Two-Process + ICAO Doc 9966. Apenas parâmetros com efeito no motor atual são editáveis aqui.
                    </span>
                  </div>
                  {GRUPOS_FATORIZACAO.map(renderGroup)}
                </div>
              )}

              {activeTab === 'offshore' && (
                <div>
                  <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-4">
                    <Info className="h-4 w-4 text-primary" />
                    <span className="text-xs text-gray-500">
                      Operação offshore e ambiente: parâmetros ativos de política interna e modelo. Parâmetros reservados sem efeito nesta versão foram ocultados desta interface operacional.
                    </span>
                  </div>
                  {GRUPOS_OPERACIONAIS.map(renderGroup)}
                </div>
              )}

              {activeTab === 'notificacoes' && <NotificacoesTab />}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

const NIVEIS_NOTIF = ['AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO'] as const;

const CARGO_LABELS: Record<string, string> = {
  PILOTO: 'Piloto / Tripulante',
  GERENTE_OPS: 'Gerente de Operações',
  SEGURANCA_VOO: 'Segurança de Voo',
  ADMIN: 'Administrador',
};

function NotificacoesTab() {
  const { data: apiData, loading: loadingData, refetch } = useFrmsNotificacaoConfig();
  const { mutate, loading: saving } = useFrmsMutation();
  const [localConfigs, setLocalConfigs] = useState<FrmsNotificacaoConfigRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (apiData) {
      const rows =
        (apiData as { data?: FrmsNotificacaoConfigRow[] } & FrmsNotificacaoConfigRow[]).data ??
        (apiData as FrmsNotificacaoConfigRow[]);
      if (Array.isArray(rows) && rows.length > 0) setLocalConfigs(rows);
    }
  }, [apiData]);

  const handleChange = (
    idx: number,
    field: keyof FrmsNotificacaoConfigRow,
    value: string | number,
  ) => {
    setSaved(false);
    setSaveError(null);
    setLocalConfigs((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      for (const cfg of localConfigs) {
        await mutate('/api/frms/configuracoes/notificacoes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cargo: cfg.cargo,
            nivel_minimo: cfg.nivel_minimo,
            ativo: cfg.ativo === 1,
          }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refetch();
    } catch (e) {
      setSaveError(safeFrmsVisibleErrorMessage('notification-save', e));
      console.error('Erro ao salvar notificações FRMS:', e);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
        <span className="ml-3 text-sm text-gray-500">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-xs text-gray-500">
            Defina quais cargos recebem notificação de alerta e o nível mínimo para cada cargo.
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || localConfigs.length === 0}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:from-primary/90 hover:to-emerald-600/90 disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar notificações'}
        </button>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {localConfigs.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Nenhuma configuração encontrada.</div>
      ) : (
        <div className="space-y-4">
          {localConfigs.map((cfg, idx) => (
            <div key={cfg.cargo} className="flex items-center gap-4 rounded-lg bg-gray-50 p-4">
              <div className="flex-1">
                <span className="font-medium text-gray-900">{CARGO_LABELS[cfg.cargo] || cfg.cargo}</span>
                <p className="mt-0.5 text-xs text-gray-500">
                  Recebe alertas a partir de: <strong>{cfg.nivel_minimo}</strong>
                </p>
              </div>
              <div className="relative">
                <select
                  value={cfg.nivel_minimo}
                  onChange={(e) => handleChange(idx, 'nivel_minimo', e.target.value)}
                  className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-sm cursor-pointer"
                >
                  {NIVEIS_NOTIF.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={cfg.ativo === 1}
                  onChange={(e) => handleChange(idx, 'ativo', e.target.checked ? 1 : 0)}
                  className="rounded border-gray-300 text-primary focus:ring-primary/40"
                />
                Ativo
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-primary bg-blue-50 p-4">
        <h4 className="mb-2 text-sm font-semibold text-blue-800">Como funciona</h4>
        <ul className="list-inside list-disc space-y-1 text-xs text-blue-700">
          <li>Quando um alerta é gerado, o sistema verifica quais cargos devem ser notificados</li>
          <li>Se o nível do alerta for igual ou superior ao mínimo configurado, os destinatários daquele cargo recebem a notificação</li>
          <li>Piloto também recebe notificação referente a si próprio conforme a regra ativa</li>
          <li>O histórico permanece separado da fila operacional de decisão</li>
        </ul>
      </div>
    </div>
  );
}
