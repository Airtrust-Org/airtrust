import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import OperationalVigilanceTest, { type OperationalVigilanceResult } from './OperationalVigilanceTest';
import {
  useReadinessBaseline,
  useReadinessToday,
  useSubmitReadiness,
} from '@/react-app/hooks/useOperationalReadiness';
import { useSubmitFrmsMaintenanceCheckin } from '@/react-app/hooks/useFrmsOperationalAccess';

function localTodayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const SLEEP_OPTIONS = [
  { hours: 3.5, label: 'Menos de 4 horas' },
  { hours: 4, label: 'Entre 4 e 5 horas' },
  { hours: 5, label: 'Entre 5 e 6 horas' },
  { hours: 6, label: 'Entre 6 e 7 horas' },
  { hours: 7, label: 'Entre 7 e 8 horas' },
  { hours: 8, label: '8 horas ou mais' },
] as const;
const QUALITY_OPTIONS = [
  { value: 5, label: 'Excelente' },
  { value: 4, label: 'Boa' },
  { value: 3, label: 'Regular' },
  { value: 2, label: 'Ruim' },
  { value: 1, label: 'Péssima' },
] as const;
const KSS_OPTIONS = [
  'Extremamente alerta',
  'Muito alerta',
  'Alerta',
  'Mais alerta do que sonolento',
  'Nem alerta nem sonolento',
  'Alguns sinais de sonolência',
  'Sonolento, sem esforço para permanecer acordado',
  'Sonolento, com esforço para permanecer acordado',
  'Extremamente sonolento',
] as const;

function optionClass(selected: boolean, risk = false): string {
  if (selected) {
    return risk
      ? 'border-orange-400 bg-orange-50 text-orange-800 ring-1 ring-orange-200'
      : 'border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200';
  }
  return 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
}

export default function FrmsMaintenanceCheckin() {
  const today = localTodayIso();
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [wakeTime, setWakeTime] = useState('');
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [kssScore, setKssScore] = useState<number | null>(null);
  const [fitForDuty, setFitForDuty] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [truthAccepted, setTruthAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [vigilance, setVigilance] = useState<OperationalVigilanceResult | null>(null);
  const [saved, setSaved] = useState<{
    risk: string;
    recommendation: string;
    review: boolean;
  } | null>(null);

  const checkin = useSubmitFrmsMaintenanceCheckin();
  const readiness = useSubmitReadiness();
  const { data: baseline } = useReadinessBaseline(today);
  const { data: readinessToday } = useReadinessToday(today);

  const missing = useMemo(() => {
    const values: string[] = [];
    if (sleepHours == null) values.push('horas de sono');
    if (!/^\d{2}:\d{2}$/.test(wakeTime)) values.push('hora em que acordou');
    if (sleepQuality == null) values.push('qualidade do sono');
    if (kssScore == null) values.push('KSS');
    if (!vigilance) values.push('teste de prontidão');
    if (fitForDuty == null) values.push('condição para a jornada');
    if (fitForDuty === false && !notes.trim()) values.push('motivo para revisão');
    if (!truthAccepted) values.push('declaração de veracidade');
    if (!privacyAccepted) values.push('aceite de privacidade');
    return values;
  }, [fitForDuty, kssScore, notes, privacyAccepted, sleepHours, sleepQuality, truthAccepted, vigilance, wakeTime]);

  const submit = async () => {
    if (missing.length > 0 || sleepHours == null || sleepQuality == null || kssScore == null || fitForDuty == null || !vigilance) {
      toast.error('Complete os itens obrigatórios antes de enviar.');
      return;
    }

    try {
      const result = await checkin.mutateAsync({
        reference_date: today,
        wake_time: wakeTime,
        sleep_hours_24h: sleepHours,
        sleep_quality: sleepQuality,
        kss_score: kssScore,
        fit_for_duty: fitForDuty,
        notes: notes.trim() || undefined,
      });

      await readiness.mutateAsync({
        reference_date: today,
        duration_ms: vigilance.summary.durationMs,
        trials: vigilance.trials,
        protocol_version: vigilance.summary.protocolVersion,
      });

      setSaved({
        risk: result.checkin.computed_risk_level,
        recommendation: result.checkin.recommendation,
        review: result.checkin.requires_operational_review === 1,
      });
      toast.success('Fadiga diária e teste de prontidão registrados.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o check-in.');
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Wrench className="h-4 w-4" /> FRMS · Manutenção
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Minha fadiga hoje</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Check-in para Mecânicos e Inspetores. Mede descanso, sonolência percebida e prontidão objetiva antes da jornada de manutenção.
          </p>
        </header>

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
          Esta é uma ferramenta de gerenciamento de risco operacional. O resultado não é diagnóstico médico nem decisão automática de aptidão.
        </div>

        {saved ? (
          <section className={`rounded-xl border p-4 ${saved.review ? 'border-orange-200 bg-orange-50 text-orange-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <p className="font-bold">Registro concluído</p>
                <p className="mt-1 text-sm">{saved.recommendation}</p>
                {saved.review ? <p className="mt-2 text-xs font-semibold">A Gestão de Manutenção receberá a sinalização para revisão.</p> : null}
              </div>
            </div>
          </section>
        ) : null}

        {missing.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-bold">{missing.length} item(ns) pendente(s):</span> {missing.slice(0, 4).join(', ')}{missing.length > 4 ? '…' : ''}
          </div>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="font-bold text-slate-950 dark:text-white">1. Sono e recuperação</h2>
          <p className="mt-1 text-xs text-slate-500">Informe o sono total nas últimas 24 horas, incluindo cochilos.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {SLEEP_OPTIONS.map((option) => (
              <button key={option.hours} type="button" onClick={() => setSleepHours(option.hours)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${optionClass(sleepHours === option.hours, option.hours < 6)}`}>
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Hora em que acordou</span>
              <input type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Qualidade do sono</p>
              <div className="grid grid-cols-2 gap-2">
                {QUALITY_OPTIONS.map((option) => (
                  <button key={option.value} type="button" onClick={() => setSleepQuality(option.value)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${optionClass(sleepQuality === option.value, option.value <= 2)}`}>
                    {option.value} · {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="font-bold text-slate-950 dark:text-white">2. Sonolência agora · KSS</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {KSS_OPTIONS.map((label, index) => {
              const value = index + 1;
              return (
                <button key={value} type="button" onClick={() => setKssScore(value)} className={`min-h-14 rounded-lg border px-3 py-2 text-left text-sm ${optionClass(kssScore === value, value >= 7)}`}>
                  <span className="font-bold">{value}</span> · {label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="font-bold text-slate-950 dark:text-white">3. Teste de prontidão</h2>
          <p className="mt-1 text-xs text-slate-500">É o mesmo teste breve de atenção e tempo de reação utilizado no FRMS de voo, com baseline individual.</p>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            {baseline?.ready
              ? `Baseline disponível (${baseline.sessions} sessões anteriores).`
              : `Baseline em formação (${baseline?.sessions ?? 0}/${baseline?.minimum_sessions ?? 5}).`}
            {readinessToday ? ' Já existe avaliação hoje; um novo teste substituirá a avaliação ativa do dia.' : ''}
          </div>
          <div className="mt-4">
            {vigilance ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-bold">Teste concluído</p>
                <p className="mt-1 text-xs">Mediana: {vigilance.summary.medianReactionTimeMs == null ? '—' : `${Math.round(vigilance.summary.medianReactionTimeMs)} ms`} · Lapsos: {vigilance.summary.lapses} · Antecipações: {vigilance.summary.falseStarts}</p>
                <Button variant="secondary" onClick={() => setVigilance(null)} className="mt-3">Refazer</Button>
              </div>
            ) : (
              <OperationalVigilanceTest onComplete={setVigilance} />
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="font-bold text-slate-950 dark:text-white">4. Condição para a jornada de manutenção</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Você se sente em condição segura para iniciar suas atividades?</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setFitForDuty(true)} className={`min-h-12 rounded-lg border px-4 py-3 text-sm font-semibold ${optionClass(fitForDuty === true)}`}>Sim, consigo iniciar com segurança</button>
            <button type="button" onClick={() => setFitForDuty(false)} className={`min-h-12 rounded-lg border px-4 py-3 text-sm font-semibold ${optionClass(fitForDuty === false, true)}`}>Não / preciso falar com a Gestão de Manutenção</button>
          </div>
          <label className="mt-4 grid gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {fitForDuty === false ? 'Explique brevemente o motivo para revisão' : 'Observação (opcional)'}
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </label>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={truthAccepted} onChange={(event) => setTruthAccepted(event.target.checked)} className="mt-0.5 h-5 w-5" />
            As informações refletem meu estado atual e foram fornecidas de forma verdadeira.
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} className="mt-0.5 h-5 w-5" />
            Aceito o uso destes dados no FRMS conforme a política de privacidade da empresa.
          </label>
        </section>

        <Button onClick={submit} disabled={missing.length > 0 || checkin.isPending || readiness.isPending} loading={checkin.isPending || readiness.isPending} className="min-h-12 w-full text-base">
          Confirmar check-in de manutenção
        </Button>
      </div>
    </AppLayout>
  );
}
