import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  History,
  Users,
  HeartPulse,
  Clock,
  MessageCircleWarning,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import TimeInput from '@/react-app/components/TimeInput';
import {
  useCheckinHoje,
  useSubmitCheckin,
  useFadigaHistorico,
  useFadigaPainel,
} from '@/react-app/hooks/useFadigaCheckin';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { normalizeTimeInput } from '@/react-app/lib/time-input';
import { toast } from 'sonner';
import { resolveFadigaPostSavePath } from './frmsPostSaveNavigation';
import OperationalVigilanceTest, {
  type OperationalVigilanceResult,
} from './OperationalVigilanceTest';
import RecoveryActivityCard from './RecoveryActivityCard';
import { useReadinessBaseline, useReadinessToday, useSubmitReadiness } from '@/react-app/hooks/useOperationalReadiness';

/* eslint-disable react-refresh/only-export-components */

function getTodayLocalKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const NIVEL_COLOR: Record<string, string> = {
  VERDE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  AMARELO: 'bg-amber-100 text-amber-800 border-amber-200',
  LARANJA: 'bg-orange-100 text-orange-800 border-orange-200',
  VERMELHO: 'bg-red-100 text-red-800 border-red-200',
};

function badgeNivel(nivel: string) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${NIVEL_COLOR[nivel] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}
    >
      {nivel}
    </span>
  );
}

const STATUS_OPERACIONAL_LABEL: Record<string, string> = {
  APTO: 'Prontidão normal',
  APTO_COM_RESSALVA: 'Atenção - revisar com gestor',
  INAPTO: 'Requer revisão operacional',
  NAO_APTO: 'Requer revisão imediata',
  RESTRITO: 'Requer revisão operacional',
};

function statusOperacionalLabel(value: unknown): string {
  const key = String(value ?? '').trim().toUpperCase();
  if (!key) return '-';
  return STATUS_OPERACIONAL_LABEL[key] || key;
}

type SonoOpcao = 'menos4' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8';

type EscalaSeveridade = 'melhor' | 'boa' | 'intermediaria' | 'atencao' | 'critica';

const SONO_OPCOES: {
  key: SonoOpcao;
  label: string;
  horas: number;
  severidade: EscalaSeveridade;
}[] = [
  { key: 'menos4', label: 'Menos de 4 horas', horas: 3.5, severidade: 'critica' },
  { key: 'h4', label: '4 a menos de 5 horas', horas: 4, severidade: 'critica' },
  { key: 'h5', label: '5 a menos de 6 horas', horas: 5, severidade: 'critica' },
  { key: 'h6', label: '6 a menos de 7 horas', horas: 6, severidade: 'atencao' },
  { key: 'h7', label: '7 a menos de 8 horas', horas: 7, severidade: 'intermediaria' },
  { key: 'h8', label: '8 horas ou mais', horas: 8, severidade: 'melhor' },
];

const KSS_OPCOES = [
  { value: 1, hint: 'Extremamente alerta' },
  { value: 2, hint: 'Muito alerta' },
  { value: 3, hint: 'Alerta' },
  { value: 4, hint: 'Mais alerta do que sonolento' },
  { value: 5, hint: 'Nem alerta nem sonolento' },
  { value: 6, hint: 'Alguns sinais de sonolência' },
  { value: 7, hint: 'Sonolento, mas sem esforço para permanecer acordado' },
  { value: 8, hint: 'Sonolento, com esforço para permanecer acordado' },
  { value: 9, hint: 'Extremamente sonolento, com grande esforço para permanecer acordado' },
];

const QUALIDADE_SONO_OPCOES = [
  {
    value: 5,
    title: 'Excelente',
    description: 'Dormi muito bem; acordei descansado e recuperado.',
    severidade: 'melhor' as const,
  },
  {
    value: 4,
    title: 'Boa',
    description: 'Dormi bem; acordei relativamente descansado.',
    severidade: 'boa' as const,
  },
  {
    value: 3,
    title: 'Regular',
    description: 'Dormi razoavelmente; descanso mediano.',
    severidade: 'intermediaria' as const,
  },
  {
    value: 2,
    title: 'Ruim',
    description: 'Dormi mal; descanso insuficiente.',
    severidade: 'atencao' as const,
  },
  {
    value: 1,
    title: 'Péssima',
    description: 'Dormi muito mal; acordei várias vezes ou quase não descansei.',
    severidade: 'critica' as const,
  },
];

type OptionalBinaryResponse = boolean | null;
type FitForDutyChoice = 'sim' | 'nao' | 'coord' | null;
const HIDDEN_RADIO_INPUT_CLASS =
  'absolute left-0 top-0 h-px w-px m-0 border-0 p-0 opacity-0 pointer-events-none';

export function optionalBinaryResponseToPayload(value: OptionalBinaryResponse): boolean | null {
  return value;
}

export function mapKssToSubjectiveFatigue(kssScore: number): number {
  if (kssScore >= 8) return 10;
  if (kssScore >= 7) return 8;
  if (kssScore >= 5) return 5;
  if (kssScore >= 3) return 3;
  return 1;
}

export function normalizeWakeTimeInput(rawValue: string): string | null {
  const compact = String(rawValue ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!compact) return null;

  if (/^\d{1,2}[:h]\d{1,2}$/.test(compact)) {
    return normalizeTimeInput(compact);
  }

  const digitsOnly = compact.replace(/\D/g, '');
  if (digitsOnly.length === 3 || digitsOnly.length === 4) {
    return normalizeTimeInput(digitsOnly);
  }

  return null;
}

export function isValidWakeTime(value: string): boolean {
  return normalizeWakeTimeInput(value) !== null;
}

function fitChoiceToPayload(choice: FitForDutyChoice): boolean | null {
  if (choice === 'sim') return true;
  if (choice === 'nao' || choice === 'coord') return false;
  return null;
}

function selectedScaleClasses(severidade: EscalaSeveridade): string {
  switch (severidade) {
    case 'melhor':
      return 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200';
    case 'boa':
      return 'border-lime-500 bg-lime-50 text-lime-800 ring-1 ring-lime-200';
    case 'intermediaria':
      return 'border-amber-500 bg-amber-50 text-amber-800 ring-1 ring-amber-200';
    case 'atencao':
      return 'border-orange-500 bg-orange-50 text-orange-800 ring-1 ring-orange-200';
    case 'critica':
      return 'border-red-500 bg-red-50 text-red-800 ring-1 ring-red-200';
  }
}

export function isFadigaCheckinSubmitReady(input: {
  sonoOpcao: SonoOpcao | null;
  wakeTime: string;
  qualidadeSono: number | null;
  kssScore: number | null;
  fitForDutyChoice: FitForDutyChoice;
  aceiteTermos: boolean;
  aceitePrivacidade: boolean;
  observacao: string;
}): boolean {
  const fitForDutyPayload = fitChoiceToPayload(input.fitForDutyChoice);
  const wakeTimeValid = isValidWakeTime(input.wakeTime);
  return (
    input.sonoOpcao !== null &&
    wakeTimeValid &&
    input.qualidadeSono !== null &&
    input.kssScore !== null &&
    fitForDutyPayload !== null &&
    input.aceiteTermos &&
    input.aceitePrivacidade &&
    !((input.fitForDutyChoice === 'nao' || input.fitForDutyChoice === 'coord') &&
      !input.observacao.trim())
  );
}

function HistoricoTab({ collective }: { collective: boolean }) {
  const hoje = getTodayLocalKey();
  const inicio = `${hoje.slice(0, 8)}01`;
  const { data, isLoading } = useFadigaHistorico({ data_inicio: inicio, data_fim: hoje, limit: 30 });
  const rows = data?.data ?? [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-700">
          {collective ? 'Check-ins recebidos no mês atual' : 'Meus check-ins do mês atual'}
        </p>
        {collective && (
          <p className="mt-0.5 text-xs text-slate-500">
            Visão coletiva para coordenação; cada registro identifica explicitamente o tripulante.
          </p>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum check-in registrado este mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2 text-left font-medium text-slate-500">Data</th>
                {collective && (
                  <th className="py-2 text-left font-medium text-slate-500">Tripulante</th>
                )}
                <th className="py-2 text-left font-medium text-slate-500">KSS</th>
                <th className="py-2 text-left font-medium text-slate-500">Sono (h)</th>
                <th className="py-2 text-left font-medium text-slate-500">Score</th>
                <th className="py-2 text-left font-medium text-slate-500">Nível de alerta</th>
                <th className="py-2 text-left font-medium text-slate-500">Status Op.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const row = r as typeof r & {
                  funcionario_id?: string | number | null;
                  funcionario_nome?: string | null;
                };
                return (
                  <tr key={r.id}>
                    <td className="py-2 text-slate-700">{r.data_checkin}</td>
                    {collective && (
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        {row.funcionario_id ? (
                          <Link
                            to={`/frms/tripulante/${encodeURIComponent(String(row.funcionario_id))}`}
                            className="hover:text-blue-700 hover:underline"
                          >
                            {row.funcionario_nome || `#${row.funcionario_id}`}
                          </Link>
                        ) : (
                          row.funcionario_nome || 'Não identificado'
                        )}
                      </td>
                    )}
                    <td className="py-2 text-slate-700">{r.kss_score}</td>
                    <td className="py-2 text-slate-700">{Number(r.horas_sono ?? 0).toFixed(1)}</td>
                    <td className="py-2 font-semibold text-slate-800">
                      {Math.round(Number(r.score_fadiga ?? 0))}
                    </td>
                    <td className="py-2">{badgeNivel(r.nivel_fadiga)}</td>
                    <td className="py-2 text-slate-600">
                      {statusOperacionalLabel(r.status_operacional)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PainelGestorTab() {
  const hoje = getTodayLocalKey();
  const [data, setData] = useState(hoje);
  const { data: painel, isLoading, isError, error, refetch, isFetching } = useFadigaPainel(data);
  const rows = Array.isArray(painel) ? painel : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="data-gestor" className="text-sm font-medium text-slate-700">
          Data de referência
        </label>
        <input
          id="data-gestor"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Carregando...</div>
        ) : isError ? (
          <div className="space-y-3 px-4 py-10 text-center">
            <p className="text-sm font-medium text-rose-700">
              {error instanceof Error ? error.message : 'Erro ao carregar check-ins da equipe.'}
            </p>
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
                Tentar novamente
              </Button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            Nenhum check-in registrado para esta data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Tripulante</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">KSS</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Score</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Nível de alerta</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Status Op.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r: Record<string, unknown>) => (
                  <tr key={String(r.id)} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <Link
                        to={`/frms/tripulante/${encodeURIComponent(String(r.funcionario_id || ''))}`}
                        className="font-medium text-slate-800 hover:text-blue-700 hover:underline"
                      >
                        {String(r.funcionario_nome ?? r.funcionario_id ?? '-')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{String(r.kss_score ?? '-')}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {Math.round(Number(r.score_fadiga ?? 0))}
                    </td>
                    <td className="px-4 py-3">{badgeNivel(String(r.nivel_fadiga ?? ''))}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {statusOperacionalLabel(r.status_operacional)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FormCard({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">{label}</h2>
      {hint ? <p className="mt-1 mb-3 text-xs text-slate-500">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function TriStateButtons({
  value,
  onChange,
  baseId,
}: {
  value: OptionalBinaryResponse;
  onChange: (value: OptionalBinaryResponse) => void;
  baseId: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label
        id={`${baseId}-nao`}
        className={`relative flex min-h-11 w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
          value === false
            ? 'border-blue-400 bg-blue-50 text-blue-700 ring-1 ring-blue-200'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        <input
          type="radio"
          name={baseId}
          value="nao"
          checked={value === false}
          onChange={() => onChange(false)}
          className={HIDDEN_RADIO_INPUT_CLASS}
        />
        Não
      </label>
      <label
        id={`${baseId}-sim`}
        className={`relative flex min-h-11 w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
          value === true
            ? 'border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-200'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        <input
          type="radio"
          name={baseId}
          value="sim"
          checked={value === true}
          onChange={() => onChange(true)}
          className={HIDDEN_RADIO_INPUT_CLASS}
        />
        Sim
      </label>
      <label
        id={`${baseId}-prefiro-nao`}
        className={`relative flex min-h-11 w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
          value === null
            ? 'border-slate-400 bg-slate-100 text-slate-700 ring-1 ring-slate-300'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        <input
          type="radio"
          name={baseId}
          value="prefiro-nao"
          checked={value === null}
          onChange={() => onChange(null)}
          className={HIDDEN_RADIO_INPUT_CLASS}
        />
        Prefiro não informar
      </label>
    </div>
  );
}

export default function FrmsFlightCheckinFadiga() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getTodayLocalKey();
  const { isAdmin, isGestor, role } = usePermissions();
  const canViewTeam = isAdmin || isGestor;

  type TabType = 'form' | 'historico' | 'gestor';
  const requestedTab = searchParams.get('tab');
  const initialTab: TabType =
    requestedTab === 'historico'
      ? 'historico'
      : (requestedTab === 'gestor' || requestedTab === 'equipe') && canViewTeam
        ? 'gestor'
        : 'form';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const selectTab = (tab: TabType) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'form') next.delete('tab');
    else next.set('tab', tab === 'gestor' ? 'equipe' : tab);
    setSearchParams(next, { replace: true });
  };

  const [sonoOpcao, setSonoOpcao] = useState<SonoOpcao | null>(null);
  const [wakeTime, setWakeTime] = useState('');
  const [wakeTimeTouched, setWakeTimeTouched] = useState(false);
  const [qualidadeSono, setQualidadeSono] = useState<number | null>(null);
  const [kssScore, setKssScore] = useState<number | null>(null);
  const [fitForDutyChoice, setFitForDutyChoice] = useState<FitForDutyChoice>(null);
  const [medsUlt12h, setMedsUlt12h] = useState<OptionalBinaryResponse>(null);
  const [alcoolUlt12h, setAlcoolUlt12h] = useState<OptionalBinaryResponse>(null);
  const [observacao, setObservacao] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [vigilanceResult, setVigilanceResult] = useState<OperationalVigilanceResult | null>(null);

  const { data: existente, refetch } = useCheckinHoje();
  const submitMutation = useSubmitCheckin();
  const readinessMutation = useSubmitReadiness();
  const { data: readinessBaseline } = useReadinessBaseline(today);
  const { data: readinessToday } = useReadinessToday(today);

  const canSubmit = isFadigaCheckinSubmitReady({
    sonoOpcao,
    wakeTime,
    qualidadeSono,
    kssScore,
    fitForDutyChoice,
    aceiteTermos,
    aceitePrivacidade,
    observacao,
  });

  const canSubmitWithReadiness = canSubmit && vigilanceResult !== null;
  const isNeedsCoordinatorReview = fitForDutyChoice === 'nao' || fitForDutyChoice === 'coord';
  const wakeTimeHasValue = wakeTime.trim().length > 0;
  const wakeTimeNormalized = normalizeWakeTimeInput(wakeTime);
  const wakeTimeValid = wakeTimeNormalized !== null;
  const wakeTimeShowInvalid =
    (wakeTimeTouched || submitAttempted) && wakeTimeHasValue && !wakeTimeValid;

  const missingItems: string[] = [];
  if (sonoOpcao === null) missingItems.push('Horas de sono nas últimas 24h');
  if (!wakeTimeValid) {
    if (!wakeTimeHasValue) missingItems.push('Hora em que acordou');
    else missingItems.push('Horário inválido - corrija a hora em que acordou');
  }
  if (qualidadeSono === null) missingItems.push('Qualidade do sono');
  if (kssScore === null) missingItems.push('Nível de sonolência (KSS)');
  if (vigilanceResult === null) missingItems.push('Teste breve de atenção e tempo de reação');
  if (fitForDutyChoice === null) missingItems.push('Condição para iniciar a jornada');
  if (isNeedsCoordinatorReview && !observacao.trim())
    missingItems.push('Observação obrigatória para revisão');
  if (!aceiteTermos) missingItems.push('Declaração de veracidade');
  if (!aceitePrivacidade) missingItems.push('Aceite da política de privacidade');

  const submit = async () => {
    if (submitMutation.isPending || readinessMutation.isPending) return;

    setSubmitAttempted(true);
    if (!canSubmitWithReadiness) {
      toast.error(
        !wakeTimeValid && wakeTimeHasValue
          ? 'Informe um horário válido, ex.: 06:30.'
          : isNeedsCoordinatorReview && !observacao.trim()
            ? 'Informe uma observação para revisão da coordenação'
            : 'Preencha os campos obrigatórios',
      );
      return;
    }

    if (!wakeTimeNormalized) {
      toast.error('Informe um horário válido para "Hora em que acordou" (HH:mm).');
      return;
    }

    try {
      const kss = kssScore!;
      const subjectiveFatigueLevel = mapKssToSubjectiveFatigue(kss);
      const fitForDuty = fitChoiceToPayload(fitForDutyChoice);

      if (!vigilanceResult) {
        toast.error('Conclua o teste breve de atenção antes de enviar.');
        return;
      }

      const result = await submitMutation.mutateAsync({
        reference_date: today,
        data_checkin: today,
        hora_acordou: wakeTimeNormalized!,
        wake_time: wakeTimeNormalized!,
        horas_sono_24h: SONO_OPCOES.find((o) => o.key === sonoOpcao!)!.horas,
        qualidade_sono: qualidadeSono!,
        kss_score: kss,
        subjective_fatigue_level: subjectiveFatigueLevel,
        sleepiness_level: subjectiveFatigueLevel,
        fit_for_duty: fitForDuty!,
        motivo_inaptidao: isNeedsCoordinatorReview ? observacao.trim() : undefined,
        free_text_notes:
          !isNeedsCoordinatorReview && observacao.trim() ? observacao.trim() : undefined,
        meds_ult_12h: optionalBinaryResponseToPayload(medsUlt12h),
        alcool_ult_12h: optionalBinaryResponseToPayload(alcoolUlt12h),
        aceite_termos: true,
        aceite_privacidade: true,
      });

      await readinessMutation.mutateAsync({
        reference_date: today,
        duration_ms: vigilanceResult.summary.durationMs,
        trials: vigilanceResult.trials,
        protocol_version: vigilanceResult.summary.protocolVersion,
      });

      toast.success('Check-in de fadiga e teste de atenção registrados com sucesso');
      await refetch();

      if ((result as { data?: { requires_frat_review?: number } })?.data?.requires_frat_review) {
        toast.warning('Check-in indica revisão FRAT recomendada');
      }

      navigate(resolveFadigaPostSavePath(role), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar check-in');
    }
  };

  const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'form', label: 'Fadiga Diária', icon: <HeartPulse className="h-4 w-4" /> },
    { key: 'historico', label: 'Histórico', icon: <History className="h-4 w-4" /> },
    ...(canViewTeam
      ? [{ key: 'gestor' as TabType, label: 'Equipe', icon: <Users className="h-4 w-4" /> }]
      : []),
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <PageHeader
                title="Fadiga Diária"
                subtitle="Triagem antes da jornada para apoiar o gerenciamento de risco de fadiga."
              />
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                <Clock className="h-3 w-3" />
                Check-in guiado
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => navigate(canViewTeam ? '/frms/controle-operacional' : '/frms')}
                className="text-xs sm:text-sm"
              >
                Voltar ao FRMS
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/sgso/frat?source=frms-checkin&data=${today}`)}
                className="text-xs sm:text-sm"
              >
                Abrir FRAT deste check-in
              </Button>
            </div>
          </div>

          <div className="flex border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm ${
                  activeTab === t.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'historico' && <HistoricoTab collective={canViewTeam} />}
        {activeTab === 'gestor' && <PainelGestorTab />}

        {activeTab === 'form' && (
          <>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Ferramenta de triagem operacional: este check-in gera sinalização para revisão humana.
              Não é diagnóstico médico e não determina automaticamente aptidão ou restrição operacional.
            </div>

            {existente && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                Check-in de hoje já registrado. Você pode atualizar e reenviar.
              </div>
            )}

            {!canSubmitWithReadiness && (
              <div
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
                role="status"
                aria-live="polite"
                aria-label={`${missingItems.length} ${missingItems.length === 1 ? 'resposta pendente' : 'respostas pendentes'}`}
              >
                <p className="text-sm font-semibold text-amber-800">
                  {missingItems.length}{' '}
                  {missingItems.length === 1 ? 'resposta pendente' : 'respostas pendentes'}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                  {missingItems.slice(0, 3).map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                {missingItems.length > 3 && (
                  <p className="mt-1 text-xs text-amber-600">
                    ...e mais {missingItems.length - 3} itens.
                  </p>
                )}
              </div>
            )}

            <RecoveryActivityCard today={today} />

            <div className="space-y-3">
              <FormCard label="Bloco 1 - Sono" hint="Informe seu descanso mais recente.">
                <div className="space-y-4">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium text-slate-700">
                      Horas de sono nas últimas 24h
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                      {SONO_OPCOES.map((op) => {
                        const selected = sonoOpcao === op.key;
                        return (
                          <label
                            key={op.key}
                            className={`relative flex min-h-11 w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                              selected
                                ? selectedScaleClasses(op.severidade)
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="sono-24h"
                              value={op.key}
                              checked={selected}
                              onChange={() => setSonoOpcao(op.key)}
                              className={HIDDEN_RADIO_INPUT_CLASS}
                            />
                            {op.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="wake-time"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Hora em que acordou
                      </label>
                      <TimeInput
                        id="wake-time"
                        aria-invalid={wakeTimeShowInvalid}
                        aria-describedby="wake-time-help wake-time-error"
                        value={wakeTime}
                        onChange={(nextValue) => {
                          setWakeTime(nextValue);
                          if (!nextValue.trim()) setWakeTimeTouched(false);
                        }}
                        onBlur={() => setWakeTimeTouched(true)}
                        normalizer={normalizeWakeTimeInput}
                        className={`min-h-11 w-full rounded-xl border bg-white px-3 py-2 text-base font-semibold text-slate-800 focus:outline-none focus:ring-2 ${
                          wakeTimeShowInvalid
                            ? 'border-red-400 focus:ring-red-400'
                            : 'border-slate-200 focus:ring-blue-500'
                        }`}
                      />
                      <p id="wake-time-help" className="mt-2 text-xs text-slate-500">
                        Digite um horário real entre 00:00 e 23:59. Ex.: 0630 vira 06:30.
                      </p>
                      {wakeTimeShowInvalid && (
                        <p id="wake-time-error" className="mt-1 text-xs text-red-700">
                          Informe um horário válido no formato HH:mm. Minutos devem ficar entre 00 e 59.
                        </p>
                      )}
                    </div>

                    <fieldset>
                      <legend className="mb-2 text-sm font-medium text-slate-700">
                        Qualidade do sono
                      </legend>
                      <div className="space-y-2">
                        {QUALIDADE_SONO_OPCOES.map((op) => {
                          const selected = qualidadeSono === op.value;
                          return (
                            <label
                              key={op.value}
                              className={`relative block w-full min-h-11 rounded-xl border px-3 py-2 text-left cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                                selected
                                  ? selectedScaleClasses(op.severidade)
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name="qualidade-sono"
                                value={op.value}
                                checked={selected}
                                onChange={() => setQualidadeSono(op.value)}
                                className={HIDDEN_RADIO_INPUT_CLASS}
                                aria-label={`Qualidade ${op.value} - ${op.title}`}
                              />
                              <span className="block text-sm font-semibold">
                                {op.value} - {op.title}
                              </span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                                {op.description}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                </div>
              </FormCard>

              <FormCard
                label="Bloco 2 - Sonolência agora"
                hint="Quão sonolento ou alerta você está agora? Escolha a opção que melhor descreve seu estado neste momento."
              >
                <fieldset>
                  <legend className="mb-3 text-xs font-medium text-slate-500">
                    Escala KSS (1-9)
                  </legend>
                  <div className="space-y-2">
                    {KSS_OPCOES.map((op) => {
                      const selected = kssScore === op.value;
                      const severidade: EscalaSeveridade =
                        op.value <= 2
                          ? 'melhor'
                          : op.value <= 4
                            ? 'boa'
                            : op.value <= 6
                              ? 'intermediaria'
                              : op.value <= 7
                                ? 'atencao'
                                : 'critica';
                      return (
                        <label
                          key={op.value}
                          className={`relative block w-full min-h-11 rounded-xl border px-4 py-3 text-left cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                            selected
                              ? selectedScaleClasses(severidade)
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="kss"
                            value={op.value}
                            checked={selected}
                            onChange={() => setKssScore(op.value)}
                            className={HIDDEN_RADIO_INPUT_CLASS}
                            aria-label={`KSS ${op.value}: ${op.hint}`}
                          />
                          <span
                            className={`block text-sm font-semibold ${selected ? '' : 'text-slate-800'}`}
                          >
                            {op.value} - {op.hint}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </FormCard>

              <FormCard
                label="Bloco 3 - Atenção e tempo de reação"
                hint="Teste breve objetivo para complementar sono, KSS e sua autoavaliação. O resultado não determina aptidão isoladamente."
              >
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {readinessBaseline?.ready
                    ? `Baseline individual disponível (${readinessBaseline.sessions} sessões anteriores).`
                    : `Baseline individual em formação (${readinessBaseline?.sessions ?? 0}/${readinessBaseline?.minimum_sessions ?? 5} sessões anteriores).`}
                  {readinessToday ? ' Já existe uma avaliação salva hoje; um novo teste substituirá a avaliação ativa de hoje sem contar duas vezes no baseline.' : ''}
                </div>
                {vigilanceResult ? (
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">Teste concluído</p>
                      <p className="mt-1 text-xs text-emerald-800">
                        Mediana de resposta: {vigilanceResult.summary.medianReactionTimeMs == null ? '-' : `${Math.round(vigilanceResult.summary.medianReactionTimeMs)} ms`} ·
                        Lapsos: {vigilanceResult.summary.lapses} ·
                        Antecipações: {vigilanceResult.summary.falseStarts}
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => setVigilanceResult(null)}>
                      Refazer teste
                    </Button>
                  </div>
                ) : (
                  <OperationalVigilanceTest onComplete={setVigilanceResult} />
                )}
              </FormCard>

              <FormCard label="Bloco 4 - Condição para jornada">
                <fieldset>
                  <legend className="mb-3 text-sm text-slate-700">
                    Você se sente em condição segura para iniciar a jornada?
                  </legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label
                      id="fit-choice-sim"
                      className={`relative flex min-h-12 w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                        fitForDutyChoice === 'sim'
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fit-for-duty"
                        value="sim"
                        checked={fitForDutyChoice === 'sim'}
                        onChange={() => setFitForDutyChoice('sim')}
                        className={HIDDEN_RADIO_INPUT_CLASS}
                      />
                      Sim, consigo iniciar a jornada com segurança
                    </label>
                    <label
                      id="fit-choice-nao"
                      className={`relative flex min-h-12 w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                        fitForDutyChoice === 'nao'
                          ? 'border-red-400 bg-red-50 text-red-700 ring-1 ring-red-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fit-for-duty"
                        value="nao"
                        checked={fitForDutyChoice === 'nao'}
                        onChange={() => setFitForDutyChoice('nao')}
                        className={HIDDEN_RADIO_INPUT_CLASS}
                      />
                      Não, preciso revisão com a coordenação
                    </label>
                    <label
                      id="fit-choice-coord"
                      className={`relative flex min-h-12 w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                        fitForDutyChoice === 'coord'
                          ? 'border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fit-for-duty"
                        value="coord"
                        checked={fitForDutyChoice === 'coord'}
                        onChange={() => setFitForDutyChoice('coord')}
                        className={HIDDEN_RADIO_INPUT_CLASS}
                      />
                      Preciso falar com a coordenação
                    </label>
                  </div>
                </fieldset>

                {isNeedsCoordinatorReview && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    A coordenação será notificada para revisar a situação com você.
                  </div>
                )}

                <div className="mt-4">
                  <label
                    htmlFor="observacao"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    {isNeedsCoordinatorReview
                      ? 'Explique o motivo para revisão pela coordenação'
                      : 'Há algo que a coordenação precisa saber? (opcional)'}
                  </label>
                  <textarea
                    id="observacao"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={3}
                    placeholder={
                      isNeedsCoordinatorReview
                        ? 'Descreva brevemente o motivo...'
                        : 'Ex: noite de sono ruim por ruído externo...'
                    }
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 ${
                      isNeedsCoordinatorReview
                        ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                        : 'border-slate-200 bg-white focus:ring-blue-500'
                    }`}
                  />
                </div>
              </FormCard>

              <FormCard label="Bloco 5 - Fatores relevantes" hint="Esses itens são opcionais.">
                <div className="space-y-4">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium text-slate-700">
                      Medicação que pode causar sonolência
                    </legend>
                    <TriStateButtons
                      value={medsUlt12h}
                      onChange={setMedsUlt12h}
                      baseId="meds-ult-12h"
                    />
                  </fieldset>

                  <fieldset>
                    <legend className="mb-2 text-sm font-medium text-slate-700">
                      Álcool nas últimas 12h
                    </legend>
                    <TriStateButtons
                      value={alcoolUlt12h}
                      onChange={setAlcoolUlt12h}
                      baseId="alcool-ult-12h"
                    />
                  </fieldset>
                </div>
              </FormCard>

              <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Declaração
                </p>
                <label
                  className="flex cursor-pointer items-start gap-3 py-2"
                  htmlFor="aceite-termos"
                >
                  <input
                    id="aceite-termos"
                    type="checkbox"
                    checked={aceiteTermos}
                    onChange={(e) => setAceiteTermos(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
                  />
                  <span className="text-sm leading-relaxed text-slate-700">
                    As informações fornecidas são verídicas e refletem meu estado atual.
                  </span>
                </label>
                <label
                  className="flex cursor-pointer items-start gap-3 py-2"
                  htmlFor="aceite-privacidade"
                >
                  <input
                    id="aceite-privacidade"
                    type="checkbox"
                    checked={aceitePrivacidade}
                    onChange={(e) => setAceitePrivacidade(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
                  />
                  <span className="text-sm leading-relaxed text-slate-700">
                    Aceito o uso dos dados no FRMS conforme a política de privacidade da empresa.
                  </span>
                </label>
              </div>

              <Button
                id="submit-checkin-fadiga"
                onClick={submit}
                loading={submitMutation.isPending || readinessMutation.isPending}
                disabled={!canSubmitWithReadiness || submitMutation.isPending || readinessMutation.isPending}
                className="min-h-12 w-full text-base"
              >
                Confirmar Check-in Diário
              </Button>

              {!canSubmitWithReadiness && (
                <p className="flex items-start gap-2 text-xs text-slate-500" role="alert">
                  <MessageCircleWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Confira os itens destacados acima para liberar o envio.
                </p>
              )}
            </div>

            {isNeedsCoordinatorReview && !observacao.trim() && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                role="alert"
              >
                Quando você seleciona "Não" ou "Preciso falar com a coordenação", a observação é obrigatória.
              </div>
            )}

            <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 lg:block">
              Este formulário coleta apenas campos com uso operacional claro no backend FRMS.
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}