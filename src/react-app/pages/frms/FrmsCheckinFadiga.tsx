import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
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

// ── sono mapping ──────────────────────────────────────────────────────────────

type SonoOpcao = 'menos4' | 'ate5' | 'ate6' | 'ate8' | 'mais8';

const SONO_OPCOES: { key: SonoOpcao; label: string; horas: number }[] = [
  { key: 'menos4', label: '< 4h', horas: 3.5 },
  { key: 'ate5',   label: '4–5h', horas: 4.5 },
  { key: 'ate6',   label: '5–6h', horas: 5.5 },
  { key: 'ate8',   label: '6–8h', horas: 7 },
  { key: 'mais8',  label: '> 8h', horas: 8.5 },
];

const SONO_CRITICO: SonoOpcao[] = ['menos4'];
const SONO_ATENCAO: SonoOpcao[] = ['ate5'];
const SONO_MENOR_5H: SonoOpcao[] = ['menos4', 'ate5'];

// ── fadiga mapping ────────────────────────────────────────────────────────────

const FADIGA_OPCOES: { nivel: number; label: string; sublabel: string }[] = [
  { nivel: 1, label: '1 Normal',   sublabel: 'Descansado, sem fadiga' },
  { nivel: 2, label: '2 Leve',     sublabel: 'Levemente cansado' },
  { nivel: 3, label: '3 Moderada', sublabel: 'Cansado, mas operacional' },
  { nivel: 4, label: '4 Alta',     sublabel: 'Fadiga significativa' },
  { nivel: 5, label: '5 Extrema',  sublabel: 'Incapaz de operar com segurança' },
];

const FADIGA_TO_SUBJECTIVE: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 8, 5: 10 };
const FADIGA_TO_KSS: Record<number, number> = { 1: 2, 2: 4, 3: 5, 4: 7, 5: 9 };

// ── risco local estimado ──────────────────────────────────────────────────────

function calcRiscoLocal(sonoOpcao: SonoOpcao | null, fadigaNivel: number | null, fitForDuty: boolean): number {
  const sonoRisco: Record<SonoOpcao, number> = {
    menos4: 45, ate5: 28, ate6: 15, ate8: 5, mais8: 0,
  };
  const fadigaRisco: Record<number, number> = { 1: 0, 2: 10, 3: 25, 4: 40, 5: 60 };
  const s = sonoOpcao ? sonoRisco[sonoOpcao] : 0;
  const f = fadigaNivel ? fadigaRisco[fadigaNivel] ?? 0 : 0;
  const d = fitForDuty ? 0 : 20;
  return Math.min(100, s + f + d);
}

// ── HistóricoTab ──────────────────────────────────────────────────────────────

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

// ── PainelGestorTab ───────────────────────────────────────────────────────────

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

// ── formulário principal ──────────────────────────────────────────────────────

export default function FrmsCheckinFadiga() {
  const navigate = useNavigate();
  const today = getTodayLocalKey();
  const { isAdmin, isGestor } = usePermissions();
  const canViewTeam = isAdmin || isGestor;

  type TabType = 'form' | 'historico' | 'gestor';
  const [activeTab, setActiveTab] = useState<TabType>('form');

  const [sonoOpcao, setSonoOpcao] = useState<SonoOpcao | null>(null);
  const [wakeTime, setWakeTime] = useState('');
  const [fadigaNivel, setFadigaNivel] = useState<number | null>(null);
  const [fitForDuty, setFitForDuty] = useState<boolean | null>(null);
  const [observacao, setObservacao] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false);

  const { data: existente, refetch } = useCheckinHoje();
  const submitMutation = useSubmitCheckin();

  const sonoHoras = sonoOpcao ? SONO_OPCOES.find((o) => o.key === sonoOpcao)?.horas ?? null : null;

  const showObservacao =
    fitForDuty === false ||
    (fadigaNivel !== null && fadigaNivel >= 4) ||
    (sonoOpcao !== null && SONO_MENOR_5H.includes(sonoOpcao));

  const riscoLocal = calcRiscoLocal(sonoOpcao, fadigaNivel, fitForDuty ?? true);
  const nivelLocal =
    riscoLocal >= 80 ? 'VERMELHO' : riscoLocal >= 60 ? 'LARANJA' : riscoLocal >= 40 ? 'AMARELO' : 'VERDE';

  const canSubmit =
    sonoOpcao !== null &&
    wakeTime !== '' &&
    fadigaNivel !== null &&
    fitForDuty !== null &&
    aceiteTermos &&
    aceitePrivacidade &&
    !(fitForDuty === false && !observacao.trim());

  const submit = async () => {
    if (!canSubmit) {
      if (fitForDuty === false && !observacao.trim()) {
        toast.error('Informe o motivo da inaptidão no campo de observações');
      } else {
        toast.error('Preencha todos os campos obrigatórios');
      }
      return;
    }

    const subjectiveFatigueLevel = FADIGA_TO_SUBJECTIVE[fadigaNivel!];
    const kssScore = FADIGA_TO_KSS[fadigaNivel!];

    try {
      const result = await submitMutation.mutateAsync({
        reference_date: today,
        data_checkin: today,
        hora_acordou: wakeTime,
        wake_time: wakeTime,
        horas_sono_24h: sonoHoras!,
        subjective_fatigue_level: subjectiveFatigueLevel,
        sleepiness_level: subjectiveFatigueLevel,
        kss_score: kssScore,
        fit_for_duty: fitForDuty!,
        motivo_inaptidao: fitForDuty === false ? observacao.trim() : undefined,
        free_text_notes: fitForDuty !== false && showObservacao && observacao.trim()
          ? observacao.trim()
          : undefined,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
        aceite_termos: true,
        aceite_privacidade: true,
      });

      toast.success('Check-in de fadiga registrado com sucesso');
      await refetch();

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
          subtitle="Registro rápido para apoiar o gerenciamento de risco de fadiga."
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
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 space-y-1">
              <p>Se houver fadiga significativa, informe também sua coordenação conforme procedimento da empresa.</p>
              <p className="text-sky-700">
                Este registro não remove automaticamente você da escala; ele sinaliza revisão operacional.
              </p>
            </div>

            {existente && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Check-in de hoje já registrado. Você pode atualizar e reenviar.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              {/* Formulário */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">

                {/* 1 — Sono */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    1. Sono nas últimas 24h
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SONO_OPCOES.map((op) => {
                      const isCritico = SONO_CRITICO.includes(op.key);
                      const isAtencao = SONO_ATENCAO.includes(op.key);
                      const selected = sonoOpcao === op.key;
                      return (
                        <button
                          key={op.key}
                          type="button"
                          onClick={() => setSonoOpcao(op.key)}
                          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                            selected
                              ? isCritico
                                ? 'border-red-400 bg-red-100 text-red-700'
                                : isAtencao
                                  ? 'border-amber-400 bg-amber-100 text-amber-700'
                                  : 'border-blue-400 bg-blue-100 text-blue-700'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {op.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2 — Wake time */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    2. Horário em que acordou
                  </p>
                  <input
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    className="w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 3 — Fadiga */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">3. Fadiga agora</p>
                  <div className="space-y-2">
                    {FADIGA_OPCOES.map((op) => {
                      const selected = fadigaNivel === op.nivel;
                      const isCritico = op.nivel === 5;
                      const isAtencao = op.nivel === 4;
                      return (
                        <button
                          key={op.nivel}
                          type="button"
                          onClick={() => setFadigaNivel(op.nivel)}
                          className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                            selected
                              ? isCritico
                                ? 'border-red-400 bg-red-50 text-red-800'
                                : isAtencao
                                  ? 'border-amber-400 bg-amber-50 text-amber-800'
                                  : 'border-blue-400 bg-blue-50 text-blue-800'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-semibold">{op.label}</span>
                          <span className="ml-2 text-xs opacity-70">{op.sublabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4 — Condição segura */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    4. Condição segura para cumprir a escala?
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFitForDuty(true)}
                      className={`flex-1 rounded-xl border py-3 text-sm font-medium transition ${
                        fitForDuty === true
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setFitForDuty(false)}
                      className={`flex-1 rounded-xl border py-3 text-sm font-medium transition ${
                        fitForDuty === false
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Não
                    </button>
                  </div>
                </div>

                {/* Observação condicional */}
                {showObservacao && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800">
                      {fitForDuty === false
                        ? 'Motivo da inaptidão (obrigatório)'
                        : 'Observação rápida (opcional)'}
                    </p>
                    <textarea
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      rows={3}
                      placeholder={
                        fitForDuty === false
                          ? 'Descreva o motivo…'
                          : 'Fatores que contribuem para o estado de fadiga…'
                      }
                      className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        fitForDuty === false
                          ? 'border-red-200 bg-red-50 focus:ring-red-400'
                          : 'border-slate-200 focus:ring-blue-500'
                      }`}
                    />
                  </div>
                )}

                {/* Aceites */}
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={aceiteTermos}
                      onChange={(e) => setAceiteTermos(e.target.checked)}
                      className="mt-0.5 shrink-0"
                    />
                    <span>
                      Declaro que as informações fornecidas são verídicas e estou ciente das{' '}
                      <strong>responsabilidades operacionais</strong> associadas ao meu estado de fadiga.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={aceitePrivacidade}
                      onChange={(e) => setAceitePrivacidade(e.target.checked)}
                      className="mt-0.5 shrink-0"
                    />
                    <span>
                      Aceito que estes dados sejam utilizados pelo FRMS conforme a{' '}
                      <strong>política de privacidade</strong> da empresa.
                    </span>
                  </label>
                </div>

                <Button
                  onClick={submit}
                  loading={submitMutation.isPending}
                  disabled={!canSubmit}
                  className="w-full"
                >
                  Confirmar Fadiga Diária
                </Button>
              </div>

              {/* Sidebar */}
              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <ShieldAlert className="h-4 w-4" />
                    Estimativa
                  </div>
                  <div className="mt-3 text-3xl font-bold text-slate-900">{riscoLocal}</div>
                  <div className="mt-1 text-sm text-slate-500">Score estimado</div>
                  <div className="mt-3">{badgeNivel(nivelLocal)}</div>
                  <div className="mt-3 overflow-hidden rounded-full bg-slate-100 h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        riscoLocal >= 80
                          ? 'bg-red-500'
                          : riscoLocal >= 60
                            ? 'bg-orange-500'
                            : riscoLocal >= 40
                              ? 'bg-amber-400'
                              : 'bg-emerald-500'
                      }`}
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
