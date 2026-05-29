import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
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
import {
  useCheckinHoje,
  useSubmitCheckin,
  useFadigaHistorico,
  useFadigaPainel,
} from '@/react-app/hooks/useFadigaCheckin';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { toast } from 'sonner';

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

type SonoOpcao = 'menos4' | 'ate5' | 'ate6' | 'ate8' | 'mais8';

const SONO_OPCOES: { key: SonoOpcao; label: string; horas: number; risco?: 'critico' | 'atencao' }[] = [
  { key: 'menos4', label: '< 4h', horas: 3.5, risco: 'critico' },
  { key: 'ate5', label: '4-5h', horas: 4.5, risco: 'atencao' },
  { key: 'ate6', label: '5-6h', horas: 5.5 },
  { key: 'ate8', label: '6-8h', horas: 7 },
  { key: 'mais8', label: '> 8h', horas: 8.5 },
];

const KSS_OPCOES = [
  { value: 1, hint: 'Extremamente alerta' },
  { value: 2, hint: 'Muito alerta' },
  { value: 3, hint: 'Alerta' },
  { value: 4, hint: 'Mais alerta que sonolento' },
  { value: 5, hint: 'Nem alerta nem sonolento' },
  { value: 6, hint: 'Alguns sinais de sonolencia' },
  { value: 7, hint: 'Sonolento, sem esforco para ficar acordado' },
  { value: 8, hint: 'Sonolento, com esforco para ficar acordado' },
  { value: 9, hint: 'Muito sonolento' },
];

const QUALIDADE_SONO_OPCOES = [
  { value: 1, hint: 'Muito ruim' },
  { value: 2, hint: 'Ruim' },
  { value: 3, hint: 'Regular' },
  { value: 4, hint: 'Boa' },
  { value: 5, hint: 'Muito boa' },
];

type OptionalBinaryResponse = boolean | null;
type FitForDutyChoice = 'sim' | 'nao' | 'coord' | null;

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

function fitChoiceToPayload(choice: FitForDutyChoice): boolean | null {
  if (choice === 'sim') return true;
  if (choice === 'nao' || choice === 'coord') return false;
  return null;
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
  return (
    input.sonoOpcao !== null &&
    input.wakeTime !== '' &&
    input.qualidadeSono !== null &&
    input.kssScore !== null &&
    fitForDutyPayload !== null &&
    input.aceiteTermos &&
    input.aceitePrivacidade &&
    !((input.fitForDutyChoice === 'nao' || input.fitForDutyChoice === 'coord') &&
      !input.observacao.trim())
  );
}

function HistoricoTab() {
  const hoje = getTodayLocalKey();
  const inicio = `${hoje.slice(0, 8)}01`;
  const { data, isLoading } = useFadigaHistorico({ data_inicio: inicio, data_fim: hoje, limit: 30 });
  const rows = data?.data ?? [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-slate-700">Meus check-ins do mes atual</p>
      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum check-in registrado este mes.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2 text-left font-medium text-slate-500">Data</th>
                <th className="py-2 text-left font-medium text-slate-500">KSS</th>
                <th className="py-2 text-left font-medium text-slate-500">Sono (h)</th>
                <th className="py-2 text-left font-medium text-slate-500">Score</th>
                <th className="py-2 text-left font-medium text-slate-500">Nivel de alerta</th>
                <th className="py-2 text-left font-medium text-slate-500">Status Op.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 text-slate-700">{r.data_checkin}</td>
                  <td className="py-2 text-slate-700">{r.kss_score}</td>
                  <td className="py-2 text-slate-700">{Number(r.horas_sono ?? 0).toFixed(1)}</td>
                  <td className="py-2 font-semibold text-slate-800">{Math.round(Number(r.score_fadiga ?? 0))}</td>
                  <td className="py-2">{badgeNivel(r.nivel_fadiga)}</td>
                  <td className="py-2 text-slate-600">{r.status_operacional}</td>
                </tr>
              ))}
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
  const { data: painel, isLoading } = useFadigaPainel(data);
  const rows = Array.isArray(painel) ? painel : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="data-gestor" className="text-sm font-medium text-slate-700">
          Data de referencia
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
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Nenhum check-in registrado para esta data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Tripulante</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">KSS</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Score</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Nivel de alerta</th>
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
                    <td className="px-4 py-3 font-semibold text-slate-900">{Math.round(Number(r.score_fadiga ?? 0))}</td>
                    <td className="px-4 py-3">{badgeNivel(String(r.nivel_fadiga ?? ''))}</td>
                    <td className="px-4 py-3 text-slate-600">{String(r.status_operacional ?? '-')}</td>
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
      <button
        id={`${baseId}-nao`}
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(false)}
        className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${
          value === false
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        Nao
      </button>
      <button
        id={`${baseId}-sim`}
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(true)}
        className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${
          value === true
            ? 'border-amber-400 bg-amber-50 text-amber-700'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        Sim
      </button>
      <button
        id={`${baseId}-prefiro-nao`}
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${
          value === null
            ? 'border-slate-400 bg-slate-100 text-slate-700'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        Prefiro nao informar
      </button>
    </div>
  );
}

export default function FrmsCheckinFadiga() {
  const navigate = useNavigate();
  const today = getTodayLocalKey();
  const { isAdmin, isGestor } = usePermissions();
  const canViewTeam = isAdmin || isGestor;

  type TabType = 'form' | 'historico' | 'gestor';
  const [activeTab, setActiveTab] = useState<TabType>('form');

  const [sonoOpcao, setSonoOpcao] = useState<SonoOpcao | null>(null);
  const [wakeTime, setWakeTime] = useState('');
  const [qualidadeSono, setQualidadeSono] = useState<number | null>(null);
  const [kssScore, setKssScore] = useState<number | null>(null);
  const [fitForDutyChoice, setFitForDutyChoice] = useState<FitForDutyChoice>(null);
  const [medsUlt12h, setMedsUlt12h] = useState<OptionalBinaryResponse>(null);
  const [alcoolUlt12h, setAlcoolUlt12h] = useState<OptionalBinaryResponse>(null);
  const [observacao, setObservacao] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false);

  const { data: existente, refetch } = useCheckinHoje();
  const submitMutation = useSubmitCheckin();

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

  const isNeedsCoordinatorReview = fitForDutyChoice === 'nao' || fitForDutyChoice === 'coord';

  const submit = async () => {
    if (!canSubmit) {
      toast.error(
        isNeedsCoordinatorReview && !observacao.trim()
          ? 'Informe uma observacao para revisao da coordenacao'
          : 'Preencha os campos obrigatorios',
      );
      return;
    }

    try {
      const kss = kssScore!;
      const subjectiveFatigueLevel = mapKssToSubjectiveFatigue(kss);
      const fitForDuty = fitChoiceToPayload(fitForDutyChoice);

      const result = await submitMutation.mutateAsync({
        reference_date: today,
        data_checkin: today,
        hora_acordou: wakeTime,
        wake_time: wakeTime,
        horas_sono_24h: SONO_OPCOES.find((o) => o.key === sonoOpcao!)!.horas,
        qualidade_sono: qualidadeSono!,
        kss_score: kss,
        subjective_fatigue_level: subjectiveFatigueLevel,
        sleepiness_level: subjectiveFatigueLevel,
        fit_for_duty: fitForDuty!,
        motivo_inaptidao: isNeedsCoordinatorReview ? observacao.trim() : undefined,
        free_text_notes: !isNeedsCoordinatorReview && observacao.trim() ? observacao.trim() : undefined,
        meds_ult_12h: optionalBinaryResponseToPayload(medsUlt12h),
        alcool_ult_12h: optionalBinaryResponseToPayload(alcoolUlt12h),
        aceite_termos: true,
        aceite_privacidade: true,
      });

      toast.success('Check-in de fadiga registrado com sucesso');
      await refetch();

      if ((result as { data?: { requires_frat_review?: number } })?.data?.requires_frat_review) {
        toast.warning('Check-in indica revisao FRAT recomendada');
        navigate(`/sgso/frat?prefill=fadiga&date=${today}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar check-in');
    }
  };

  const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'form', label: 'Fadiga Diaria', icon: <HeartPulse className="h-4 w-4" /> },
    { key: 'historico', label: 'Historico', icon: <History className="h-4 w-4" /> },
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
                title="Fadiga Diaria"
                subtitle="Check-in rapido para apoiar o gerenciamento de risco de fadiga."
              />
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <Clock className="h-3 w-3" />
                Leva menos de 1 minuto
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/frms')} className="text-xs sm:text-sm">
                Voltar ao FRMS
              </Button>
              <Button variant="secondary" onClick={() => navigate('/sgso/frat')} className="text-xs sm:text-sm">
                Abrir FRAT
              </Button>
            </div>
          </div>

          <div className="flex border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
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

        {activeTab === 'historico' && <HistoricoTab />}
        {activeTab === 'gestor' && <PainelGestorTab />}

        {activeTab === 'form' && (
          <>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Se houver sinal de fadiga significativa, a coordenacao pode revisar sua jornada.
            </div>

            {existente && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                Check-in de hoje ja registrado. Voce pode atualizar e reenviar.
              </div>
            )}

            <div className="space-y-3">
              <FormCard label="Bloco 1 - Sono" hint="Informe seu descanso mais recente.">
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">Horas de sono nas ultimas 24h</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {SONO_OPCOES.map((op) => {
                        const selected = sonoOpcao === op.key;
                        return (
                          <button
                            key={op.key}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSonoOpcao(op.key)}
                            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                              selected
                                ? op.risco === 'critico'
                                  ? 'border-red-400 bg-red-100 text-red-700'
                                  : op.risco === 'atencao'
                                    ? 'border-amber-400 bg-amber-100 text-amber-700'
                                    : 'border-blue-400 bg-blue-100 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            {op.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="wake-time" className="mb-2 block text-sm font-medium text-slate-700">
                        Hora em que acordou
                      </label>
                      <input
                        id="wake-time"
                        type="time"
                        value={wakeTime}
                        onChange={(e) => setWakeTime(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">Qualidade do sono</p>
                      <div className="grid grid-cols-5 gap-2">
                        {QUALIDADE_SONO_OPCOES.map((op) => {
                          const selected = qualidadeSono === op.value;
                          return (
                            <button
                              key={op.value}
                              type="button"
                              aria-label={`Qualidade ${op.value}: ${op.hint}`}
                              aria-pressed={selected}
                              onClick={() => setQualidadeSono(op.value)}
                              className={`min-h-11 rounded-xl border px-2 py-2 text-center text-sm font-semibold ${
                                selected
                                  ? 'border-blue-400 bg-blue-100 text-blue-700'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              {op.value}
                            </button>
                          );
                        })}
                      </div>
                      {qualidadeSono != null && (
                        <p className="mt-2 text-xs text-slate-500">
                          {QUALIDADE_SONO_OPCOES.find((op) => op.value === qualidadeSono)?.hint}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </FormCard>

              <FormCard
                label="Bloco 2 - Sonolencia agora"
                hint="Quao sonolento ou alerta voce esta agora? Escolha a opcao que melhor descreve seu estado neste momento."
              >
                <p className="mb-3 text-xs text-slate-500">Escala KSS (1-9).</p>
                <div className="space-y-2">
                  {KSS_OPCOES.map((op) => {
                    const selected = kssScore === op.value;
                    return (
                      <button
                        key={op.value}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`KSS ${op.value}: ${op.hint}`}
                        onClick={() => setKssScore(op.value)}
                        className={`w-full rounded-xl border px-4 py-3 text-left ${
                          selected
                            ? op.value >= 8
                              ? 'border-red-400 bg-red-50'
                              : op.value >= 7
                                ? 'border-amber-400 bg-amber-50'
                                : 'border-blue-400 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-slate-800">{op.value}</span>
                        <span className="block text-xs text-slate-600">{op.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </FormCard>

              <FormCard label="Bloco 3 - Aptidao operacional">
                <p className="mb-3 text-sm text-slate-700">
                  Voce se sente em condicao segura para iniciar a jornada?
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    id="fit-choice-sim"
                    type="button"
                    aria-pressed={fitForDutyChoice === 'sim'}
                    onClick={() => setFitForDutyChoice('sim')}
                    className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      fitForDutyChoice === 'sim'
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    id="fit-choice-nao"
                    type="button"
                    aria-pressed={fitForDutyChoice === 'nao'}
                    onClick={() => setFitForDutyChoice('nao')}
                    className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      fitForDutyChoice === 'nao'
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    Nao
                  </button>
                  <button
                    id="fit-choice-coord"
                    type="button"
                    aria-pressed={fitForDutyChoice === 'coord'}
                    onClick={() => setFitForDutyChoice('coord')}
                    className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      fitForDutyChoice === 'coord'
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    Preciso falar com a coordenacao
                  </button>
                </div>

                {isNeedsCoordinatorReview && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    A coordenacao sera notificada para revisar a situacao com voce.
                  </div>
                )}

                <div className="mt-4">
                  <label htmlFor="observacao" className="mb-2 block text-sm font-medium text-slate-700">
                    {isNeedsCoordinatorReview
                      ? 'Explique rapidamente (obrigatorio)'
                      : 'Ha algo que a coordenacao precisa saber? (opcional)'}
                  </label>
                  <textarea
                    id="observacao"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={3}
                    placeholder={
                      isNeedsCoordinatorReview
                        ? 'Descreva brevemente o motivo...'
                        : 'Ex: noite de sono ruim por ruido externo...'
                    }
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 ${
                      isNeedsCoordinatorReview
                        ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                        : 'border-slate-200 bg-white focus:ring-blue-500'
                    }`}
                  />
                </div>
              </FormCard>

              <FormCard label="Bloco 4 - Fatores relevantes" hint="Esses itens sao opcionais.">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="meds-ult-12h-nao" className="mb-2 block text-sm font-medium text-slate-700">
                      Medicacao que pode causar sonolencia
                    </label>
                    <TriStateButtons value={medsUlt12h} onChange={setMedsUlt12h} baseId="meds-ult-12h" />
                  </div>

                  <div>
                    <label htmlFor="alcool-ult-12h-nao" className="mb-2 block text-sm font-medium text-slate-700">
                      Alcool nas ultimas 12h
                    </label>
                    <TriStateButtons value={alcoolUlt12h} onChange={setAlcoolUlt12h} baseId="alcool-ult-12h" />
                  </div>
                </div>
              </FormCard>

              <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Declaracao</p>
                <label className="flex items-start gap-3">
                  <input
                    id="aceite-termos"
                    type="checkbox"
                    checked={aceiteTermos}
                    onChange={(e) => setAceiteTermos(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">
                    As informacoes fornecidas sao veridicas e refletem meu estado atual.
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    id="aceite-privacidade"
                    type="checkbox"
                    checked={aceitePrivacidade}
                    onChange={(e) => setAceitePrivacidade(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">
                    Aceito o uso dos dados no FRMS conforme a politica de privacidade da empresa.
                  </span>
                </label>
              </div>

              <Button
                id="submit-checkin-fadiga"
                onClick={submit}
                loading={submitMutation.isPending}
                disabled={!canSubmit}
                className="min-h-12 w-full text-base"
              >
                Confirmar Check-in Diario
              </Button>

              {!canSubmit && (
                <p className="flex items-start gap-2 text-xs text-slate-500">
                  <MessageCircleWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Preencha os campos obrigatorios para liberar o envio.
                </p>
              )}
            </div>

            {isNeedsCoordinatorReview && !observacao.trim() && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Quando voce seleciona "Nao" ou "Preciso falar com a coordenacao", a observacao e obrigatoria.
              </div>
            )}

            <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 lg:block">
              Este formulario foi simplificado para check-in mobile-first e coleta apenas campos com uso
              operacional claro no backend FRMS.
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
