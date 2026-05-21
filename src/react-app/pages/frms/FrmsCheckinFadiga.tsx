import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldAlert,
  History,
  Users,
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

/** KSS labels for display */
const KSS_LABELS: Record<number, string> = {
  1: '1 — Extremamente alerta',
  2: '2 — Muito alerta',
  3: '3 — Alerta',
  4: '4 — Razoavelmente alerta',
  5: '5 — Nem alerta nem sonolento',
  6: '6 — Alguns sinais de sonolência',
  7: '7 — Sonolento, sem esforço para ficar acordado',
  8: '8 — Sonolento, esforço para ficar acordado',
  9: '9 — Sonolência intensa',
};

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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-800">{label}</p>
      {children}
    </div>
  );
}

/** HistóricoTab — últimos check-ins do próprio tripulante */
function HistoricoTab() {
  const hoje = getTodayLocalKey();
  const inicio = `${hoje.slice(0, 8)}01`;
  const { data, isLoading } = useFadigaHistorico({
    data_inicio: inicio,
    data_fim: hoje,
    limit: 30,
  });
  const rows = data?.data ?? [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-slate-700">Meus check-ins do mês atual</p>
      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum check-in registrado este mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2 text-left font-medium text-slate-500">Data</th>
                <th className="py-2 text-left font-medium text-slate-500">KSS</th>
                <th className="py-2 text-left font-medium text-slate-500">Sono (h)</th>
                <th className="py-2 text-left font-medium text-slate-500">Score</th>
                <th className="py-2 text-left font-medium text-slate-500">Nível</th>
                <th className="py-2 text-left font-medium text-slate-500">Status Op.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 text-slate-700">{r.data_checkin}</td>
                  <td className="py-2 text-slate-700">{r.kss_score}</td>
                  <td className="py-2 text-slate-700">{Number(r.horas_sono ?? 0).toFixed(1)}</td>
                  <td className="py-2 font-semibold text-slate-800">
                    {Math.round(Number(r.score_fadiga ?? 0))}
                  </td>
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

/** PainelGestorTab — check-ins da equipe no dia (visível apenas para admin/gestor) */
function PainelGestorTab() {
  const hoje = getTodayLocalKey();
  const [data, setData] = useState(hoje);
  const { data: painel, isLoading } = useFadigaPainel(data);
  const rows = Array.isArray(painel) ? painel : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-slate-700">Data de referência</label>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Carregando…</div>
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
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Nível</th>
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
                        {String(r.funcionario_nome ?? r.funcionario_id ?? '—')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{String(r.kss_score ?? '—')}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {Math.round(Number(r.score_fadiga ?? 0))}
                    </td>
                    <td className="px-4 py-3">{badgeNivel(String(r.nivel_fadiga ?? ''))}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {String(r.status_operacional ?? '—')}
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

// ── formulário principal ─────────────────────────────────────────────────────

export default function FrmsCheckinFadiga() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const { isAdmin, isGestor } = usePermissions();
  const canViewTeam = isAdmin || isGestor;

  type TabType = 'form' | 'historico' | 'gestor';
  const [activeTab, setActiveTab] = useState<TabType>('form');
  const [step, setStep] = useState(1);

  // Step 1 — KSS
  const [kss, setKss] = useState(5);
  const [sleepinessLevel, setSleepinessLevel] = useState(5);
  const [subjectiveFatigueLevel, setSubjectiveFatigueLevel] = useState(5);

  // Step 2 — Sono
  const [horaDormiu, setHoraDormiu] = useState('22:00');
  const [horaAcordou, setHoraAcordou] = useState('06:00');
  const [horasSono48h, setHorasSono48h] = useState(16);
  const [qualidadeSono, setQualidadeSono] = useState(3);
  const [jornadaInicio, setJornadaInicio] = useState('07:00');

  // Step 3 — Sintomas (estruturado: 0=nenhum, 1=leve, 2=moderado, 3=grave)
  const [fadiga_fisica, setFadigaFisica] = useState(0);
  const [fadiga_mental, setFadigaMental] = useState(0);
  const [dificuldade_concentracao, setDificuldadeConc] = useState(0);
  const [sonolencia_diurna, setSonolenciaDiurna] = useState(0);
  const [irritabilidade, setIrritab] = useState(0);

  // Step 4 — Revisão
  const [apto, setApto] = useState<1 | 0>(1);
  const [motivoInaptidao, setMotivoInaptidao] = useState('');
  const [medsUlt12h, setMedsUlt12h] = useState<0 | 1>(0);
  const [alcoolUlt12h, setAlcoolUlt12h] = useState<0 | 1>(0);
  const [riscoAutoavaliado, setRiscoAutoavaliado] = useState(3);
  const [observacoes, setObservacoes] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false);

  const { data: existente, refetch } = useCheckinHoje();
  const submitMutation = useSubmitCheckin();

  /** Calcula horas de sono a partir dos horários dormir/acordar */
  const horasSono = useMemo(() => {
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    };
    let diff = toMin(horaAcordou) - toMin(horaDormiu);
    if (diff < 0) diff += 1440; // dormiu antes da meia-noite
    return Math.round((diff / 60) * 10) / 10;
  }, [horaDormiu, horaAcordou]);

  const riscoLocal = useMemo(() => {
    const kssScore = (kss - 1) * 10;
    const sonoScore = Math.max(0, 8 - horasSono) * 8;
    const qualScore = (5 - qualidadeSono) * 8;
    const subjetivoScore = subjectiveFatigueLevel * 4;
    const sonolenciaScore = sleepinessLevel * 4;
    const sintomasScore =
      (fadiga_fisica +
        fadiga_mental +
        dificuldade_concentracao +
        sonolencia_diurna +
        irritabilidade) *
      4;
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          kssScore + sonoScore + qualScore + subjetivoScore + sonolenciaScore + sintomasScore,
        ),
      ),
    );
  }, [
    kss,
    horasSono,
    qualidadeSono,
    subjectiveFatigueLevel,
    sleepinessLevel,
    fadiga_fisica,
    fadiga_mental,
    dificuldade_concentracao,
    sonolencia_diurna,
    irritabilidade,
  ]);

  const nivelLocal =
    riscoLocal >= 80
      ? 'VERMELHO'
      : riscoLocal >= 60
        ? 'LARANJA'
        : riscoLocal >= 40
          ? 'AMARELO'
          : 'VERDE';

  const submit = async () => {
    if (!aceiteTermos || !aceitePrivacidade) {
      toast.error('Aceite os termos e a política de privacidade para continuar');
      return;
    }
    if (apto === 0 && !motivoInaptidao.trim()) {
      toast.error('Informe o motivo da inaptidão');
      return;
    }
    try {
      const result = await submitMutation.mutateAsync({
        reference_date: today,
        data_checkin: today,
        hora_dormiu: horaDormiu,
        hora_acordou: horaAcordou,
        wake_time: horaAcordou,
        horas_sono_24h: horasSono,
        horas_sono_48h: horasSono48h,
        qualidade_sono: qualidadeSono,
        kss_score: kss,
        subjective_fatigue_level: subjectiveFatigueLevel,
        sleepiness_level: sleepinessLevel,
        sintomas: {
          fadiga_fisica,
          fadiga_mental,
          dificuldade_concentracao,
          sonolencia_diurna,
          irritabilidade,
        },
        apto,
        fit_for_duty: apto === 1,
        motivo_inaptidao: apto === 0 ? motivoInaptidao : undefined,
        meds_ult_12h: medsUlt12h,
        alcool_ult_12h: alcoolUlt12h,
        risco_autoavaliado: riscoAutoavaliado,
        jornada_inicio_prevista: jornadaInicio,
        free_text_notes: observacoes || undefined,
        observacoes: observacoes || undefined,
        aceite_termos: true,
        aceite_privacidade: true,
      });

      const data = (
        result as {
          data?: { requires_frat_review?: number; frat_prefill?: { nivelRiscoSugerido?: string } };
        }
      )?.data;
      toast.success('Check-in de fadiga registrado com sucesso');
      await refetch();
      setStep(1);

      if ((result as { data?: { requires_frat_review?: number } })?.data?.requires_frat_review) {
        toast.warning('Check-in indica revisão FRAT recomendada');
        navigate(`/sgso/frat?prefill=fadiga&date=${today}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar check-in');
    }
  };

  const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'form', label: 'Fadiga Diária', icon: <CheckCircle2 className="h-4 w-4" /> },
    { key: 'historico', label: 'Histórico', icon: <History className="h-4 w-4" /> },
    ...(canViewTeam
      ? [{ key: 'gestor' as TabType, label: 'Equipe', icon: <Users className="h-4 w-4" /> }]
      : []),
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="Fadiga Diária"
          subtitle="Autorrelato diário de fadiga para gerenciamento de risco e revisão operacional"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/frms')}>
                Voltar ao FRMS
              </Button>
              <Button variant="secondary" onClick={() => navigate('/sgso/frat')}>
                Abrir FRAT
              </Button>
            </div>
          }
        />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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

        {activeTab === 'historico' && <HistoricoTab />}
        {activeTab === 'gestor' && <PainelGestorTab />}

        {activeTab === 'form' && (
          <>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Este registro é usado para gerenciamento de risco de fadiga e revisão operacional. Em
              caso de fadiga significativa, informe também sua coordenação conforme procedimento da
              empresa.
            </div>
            {existente ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Check-in de hoje já registrado. Você pode atualizar os dados e reenviar.
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {/* Steps breadcrumb */}
                <div className="mb-6 flex flex-wrap items-center gap-1 text-sm text-slate-400">
                  {['Sonolência', 'Sono', 'Sintomas', 'Revisão'].map((label, i) => (
                    <span key={label} className="flex items-center gap-1">
                      {i > 0 && <ArrowRight className="h-3 w-3" />}
                      <span
                        className={
                          step === i + 1
                            ? 'font-semibold text-slate-900'
                            : step > i + 1
                              ? 'text-emerald-600'
                              : ''
                        }
                      >
                        {i + 1}. {label}
                      </span>
                    </span>
                  ))}
                </div>

                {/* Step 1: KSS */}
                {step === 1 && (
                  <div className="space-y-5">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Escala de Sonolência KSS
                    </h2>
                    <p className="text-sm text-slate-500">
                      Como você se sente agora em relação à sonolência? (1 = extremamente alerta, 9
                      = sonolência intensa)
                    </p>
                    <input
                      type="range"
                      min={1}
                      max={9}
                      step={1}
                      value={kss}
                      onChange={(e) => setKss(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                    <div className="rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-800">
                      KSS {kss} — {KSS_LABELS[kss]}
                    </div>
                    <Section
                      label={`Como você avalia sua fadiga agora? ${subjectiveFatigueLevel}/10`}
                    >
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={subjectiveFatigueLevel}
                        onChange={(e) => setSubjectiveFatigueLevel(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </Section>
                    <Section label={`Como está sua sonolência agora? ${sleepinessLevel}/10`}>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={sleepinessLevel}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setSleepinessLevel(value);
                          setKss(Math.min(9, Math.max(1, Math.round((value / 10) * 8) + 1)));
                        }}
                        className="w-full accent-indigo-600"
                      />
                    </Section>
                  </div>
                )}

                {/* Step 2: Sono */}
                {step === 2 && (
                  <div className="space-y-5">
                    <h2 className="text-lg font-semibold text-slate-900">Sono da última noite</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Section label="Horário em que dormiu (hora_dormiu)">
                        <input
                          type="time"
                          value={horaDormiu}
                          onChange={(e) => setHoraDormiu(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </Section>
                      <Section label="Horário em que acordou (hora_acordou)">
                        <input
                          type="time"
                          value={horaAcordou}
                          onChange={(e) => setHoraAcordou(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </Section>
                    </div>
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-700">
                      Duração calculada: <strong>{horasSono}h</strong>
                    </div>
                    <Section label="Quantas horas você dormiu nas últimas 48h?">
                      <input
                        type="number"
                        min={0}
                        max={48}
                        step={0.5}
                        value={horasSono48h}
                        onChange={(e) => setHorasSono48h(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </Section>
                    <Section label={`Qualidade do sono: ${qualidadeSono}/5`}>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={qualidadeSono}
                        onChange={(e) => setQualidadeSono(Number(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>Péssima</span>
                        <span>Excelente</span>
                      </div>
                    </Section>
                    <Section label="Início previsto da jornada">
                      <input
                        type="time"
                        value={jornadaInicio}
                        onChange={(e) => setJornadaInicio(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </Section>
                  </div>
                )}

                {/* Step 3: Sintomas estruturados */}
                {step === 3 && (
                  <div className="space-y-5">
                    <h2 className="text-lg font-semibold text-slate-900">Sintomas percebidos</h2>
                    <p className="text-sm text-slate-500">
                      Para cada sintoma, indique a intensidade: 0 = nenhum, 1 = leve, 2 = moderado,
                      3 = grave.
                    </p>
                    {(
                      [
                        ['Fadiga física', fadiga_fisica, setFadigaFisica],
                        ['Fadiga mental', fadiga_mental, setFadigaMental],
                        [
                          'Dificuldade de concentração',
                          dificuldade_concentracao,
                          setDificuldadeConc,
                        ],
                        ['Sonolência diurna', sonolencia_diurna, setSonolenciaDiurna],
                        ['Irritabilidade', irritabilidade, setIrritab],
                      ] as [string, number, (v: number) => void][]
                    ).map(([label, val, setter]) => (
                      <Section
                        key={label}
                        label={`${label}: ${['Nenhum', 'Leve', 'Moderado', 'Grave'][val]}`}
                      >
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={1}
                          value={val}
                          onChange={(e) => setter(Number(e.target.value))}
                          className="w-full accent-orange-500"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                          <span>Nenhum</span>
                          <span>Leve</span>
                          <span>Moderado</span>
                          <span>Grave</span>
                        </div>
                      </Section>
                    ))}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={medsUlt12h === 1}
                          onChange={(e) => setMedsUlt12h(e.target.checked ? 1 : 0)}
                        />
                        Medicação nas últimas 12h
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={alcoolUlt12h === 1}
                          onChange={(e) => setAlcoolUlt12h(e.target.checked ? 1 : 0)}
                        />
                        Álcool nas últimas 12h
                      </label>
                    </div>
                    <Section label={`Risco autoavaliado: ${riscoAutoavaliado}/10`}>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={riscoAutoavaliado}
                        onChange={(e) => setRiscoAutoavaliado(Number(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                    </Section>
                    <Section label="Observações (opcional)">
                      <textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Fatores adicionais…"
                      />
                    </Section>
                  </div>
                )}

                {/* Step 4: Revisão + Declarações */}
                {step === 4 && (
                  <div className="space-y-5">
                    <h2 className="text-lg font-semibold text-slate-900">Revisão e declaração</h2>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1">
                      <p>
                        <span className="font-medium">Data:</span> {today}
                      </p>
                      <p>
                        <span className="font-medium">KSS:</span> {kss} — {KSS_LABELS[kss]}
                      </p>
                      <p>
                        <span className="font-medium">Dormiu às:</span> {horaDormiu} |{' '}
                        <span className="font-medium">Acordou às:</span> {horaAcordou} ({horasSono}
                        h)
                      </p>
                      <p>
                        <span className="font-medium">Sono últimas 48h:</span> {horasSono48h}h
                      </p>
                      <p>
                        <span className="font-medium">Qualidade do sono:</span> {qualidadeSono}/5
                      </p>
                      <p>
                        <span className="font-medium">Fadiga subjetiva:</span>{' '}
                        {subjectiveFatigueLevel}/10 |{' '}
                        <span className="font-medium">Sonolência:</span> {sleepinessLevel}/10
                      </p>
                      <p>
                        <span className="font-medium">Jornada prevista:</span> {jornadaInicio}
                      </p>
                      <p>
                        <span className="font-medium">Fadiga física:</span> {fadiga_fisica} |{' '}
                        <span className="font-medium">Mental:</span> {fadiga_mental} |{' '}
                        <span className="font-medium">Concentração:</span>{' '}
                        {dificuldade_concentracao}
                      </p>
                      <p>
                        <span className="font-medium">Sonolência diurna:</span> {sonolencia_diurna}{' '}
                        | <span className="font-medium">Irritabilidade:</span> {irritabilidade}
                      </p>
                      <p>
                        <span className="font-medium">Medicação:</span> {medsUlt12h ? 'Sim' : 'Não'}{' '}
                        | <span className="font-medium">Álcool:</span>{' '}
                        {alcoolUlt12h ? 'Sim' : 'Não'}
                      </p>
                      <p>
                        <span className="font-medium">Risco autoavaliado:</span> {riscoAutoavaliado}
                        /10
                      </p>
                    </div>

                    {/* Apto toggle */}
                    <Section label="Declaração de aptidão operacional">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setApto(1)}
                          className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${apto === 1 ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        >
                          ✅ Apto para operar
                        </button>
                        <button
                          type="button"
                          onClick={() => setApto(0)}
                          className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${apto === 0 ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        >
                          🚫 Inapto — necessário avaliação
                        </button>
                      </div>
                      {apto === 0 && (
                        <textarea
                          value={motivoInaptidao}
                          onChange={(e) => setMotivoInaptidao(e.target.value)}
                          placeholder="Descreva o motivo da inaptidão (obrigatório)"
                          rows={3}
                          className="mt-3 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                      )}
                    </Section>

                    {/* Aceites */}
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aceiteTermos}
                          onChange={(e) => setAceiteTermos(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          Declaro que as informações fornecidas são verídicas e que estou ciente das{' '}
                          <strong>responsabilidades operacionais</strong> associadas ao meu estado
                          de fadiga.
                        </span>
                      </label>
                      <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aceitePrivacidade}
                          onChange={(e) => setAceitePrivacidade(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          Aceito que estes dados sejam utilizados pelo sistema FRMS conforme a{' '}
                          <strong>política de privacidade</strong> da empresa.
                        </span>
                      </label>
                    </div>

                    <Button
                      onClick={submit}
                      loading={submitMutation.isPending}
                      disabled={!aceiteTermos || !aceitePrivacidade}
                      className="w-full"
                    >
                      Confirmar Fadiga Diária
                    </Button>
                  </div>
                )}

                {/* Navigation */}
                <div className="mt-6 flex items-center justify-between">
                  <Button
                    variant="secondary"
                    disabled={step === 1}
                    onClick={() => setStep((s) => Math.max(1, s - 1))}
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </Button>
                  {step < 4 && (
                    <Button onClick={() => setStep((s) => Math.min(4, s + 1))}>
                      Próximo
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Sidebar score */}
              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <ShieldAlert className="h-4 w-4" />
                    Estimativa instantânea
                  </div>
                  <div className="mt-3 text-3xl font-bold text-slate-900">{riscoLocal}</div>
                  <div className="mt-1 text-sm text-slate-500">Score de fadiga estimado</div>
                  <div className="mt-3">{badgeNivel(nivelLocal)}</div>
                  <div className="mt-3 overflow-hidden rounded-full bg-slate-100 h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${riscoLocal >= 80 ? 'bg-red-500' : riscoLocal >= 60 ? 'bg-orange-500' : riscoLocal >= 40 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                      style={{ width: `${riscoLocal}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                    {riscoLocal >= 60 ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    )}
                    <p>
                      {riscoLocal >= 80
                        ? 'Nível crítico. Considere revisão antes de operar.'
                        : riscoLocal >= 60
                          ? 'Nível elevado. Revisão FRAT recomendada.'
                          : riscoLocal >= 40
                            ? 'Nível moderado. Atenção redobrada.'
                            : 'Nível operacional adequado.'}
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
