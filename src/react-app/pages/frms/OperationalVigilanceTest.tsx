import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/react-app/components/Button';
import {
  summarizeVigilanceTrials,
  type VigilanceSummary,
  type VigilanceTrial,
  VIGILANCE_PROTOCOL,
} from './operationalReadiness';

type Phase = 'instructions' | 'waiting' | 'stimulus' | 'complete';

type OperationalVigilanceTestProps = {
  durationMs?: number;
  onComplete: (summary: VigilanceSummary) => void;
  onCancel?: () => void;
};

function randomDelay(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

export default function OperationalVigilanceTest({
  durationMs = VIGILANCE_PROTOCOL.defaultDurationMs,
  onComplete,
  onCancel,
}: OperationalVigilanceTestProps) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [elapsedMs, setElapsedMs] = useState(0);
  const trialsRef = useRef<VigilanceTrial[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const scheduledAtRef = useRef<number | null>(null);
  const stimulusAtRef = useRef<number | null>(null);
  const waitingTimerRef = useRef<number | null>(null);
  const responseTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const cleanupTimers = useCallback(() => {
    if (waitingTimerRef.current != null) window.clearTimeout(waitingTimerRef.current);
    if (responseTimerRef.current != null) window.clearTimeout(responseTimerRef.current);
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    waitingTimerRef.current = null;
    responseTimerRef.current = null;
    rafRef.current = null;
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cleanupTimers();
    const actualDuration = startedAtRef.current == null ? durationMs : performance.now() - startedAtRef.current;
    const summary = summarizeVigilanceTrials(trialsRef.current, Math.round(actualDuration));
    setPhase('complete');
    onComplete(summary);
  }, [cleanupTimers, durationMs, onComplete]);

  const scheduleNext = useCallback(() => {
    if (finishedRef.current || startedAtRef.current == null) return;
    const now = performance.now();
    if (now - startedAtRef.current >= durationMs) {
      finish();
      return;
    }

    setPhase('waiting');
    stimulusAtRef.current = null;
    const delay = randomDelay(VIGILANCE_PROTOCOL.minInterStimulusMs, VIGILANCE_PROTOCOL.maxInterStimulusMs);
    scheduledAtRef.current = now + delay;
    waitingTimerRef.current = window.setTimeout(() => {
      if (finishedRef.current || startedAtRef.current == null) return;
      const stimulusAt = performance.now();
      if (stimulusAt - startedAtRef.current >= durationMs) {
        finish();
        return;
      }
      stimulusAtRef.current = stimulusAt;
      setPhase('stimulus');
      responseTimerRef.current = window.setTimeout(() => {
        const currentStimulusAt = stimulusAtRef.current;
        if (currentStimulusAt == null) return;
        trialsRef.current.push({
          sequence: trialsRef.current.length + 1,
          scheduledAtMs: Math.round((scheduledAtRef.current ?? currentStimulusAt) - (startedAtRef.current ?? 0)),
          stimulusAtMs: Math.round(currentStimulusAt - (startedAtRef.current ?? 0)),
          responseAtMs: null,
          reactionTimeMs: null,
          outcome: 'missed',
        });
        stimulusAtRef.current = null;
        scheduleNext();
      }, VIGILANCE_PROTOCOL.responseWindowMs);
    }, delay);
  }, [durationMs, finish]);

  const start = useCallback(() => {
    cleanupTimers();
    trialsRef.current = [];
    finishedRef.current = false;
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    scheduleNext();
  }, [cleanupTimers, scheduleNext]);

  const respond = useCallback(() => {
    if (finishedRef.current || startedAtRef.current == null) return;
    const now = performance.now();

    if (phase !== 'stimulus' || stimulusAtRef.current == null) {
      trialsRef.current.push({
        sequence: trialsRef.current.length + 1,
        scheduledAtMs: Math.round((scheduledAtRef.current ?? now) - startedAtRef.current),
        stimulusAtMs: -1,
        responseAtMs: Math.round(now - startedAtRef.current),
        reactionTimeMs: 0,
        outcome: 'false_start',
      });
      if (waitingTimerRef.current != null) window.clearTimeout(waitingTimerRef.current);
      scheduleNext();
      return;
    }

    if (responseTimerRef.current != null) window.clearTimeout(responseTimerRef.current);
    const reactionTimeMs = now - stimulusAtRef.current;
    const outcome: VigilanceTrial['outcome'] =
      reactionTimeMs < VIGILANCE_PROTOCOL.falseStartThresholdMs
        ? 'false_start'
        : reactionTimeMs >= VIGILANCE_PROTOCOL.lapseThresholdMs
          ? 'lapse'
          : 'response';

    trialsRef.current.push({
      sequence: trialsRef.current.length + 1,
      scheduledAtMs: Math.round((scheduledAtRef.current ?? stimulusAtRef.current) - startedAtRef.current),
      stimulusAtMs: Math.round(stimulusAtRef.current - startedAtRef.current),
      responseAtMs: Math.round(now - startedAtRef.current),
      reactionTimeMs: Math.round(reactionTimeMs),
      outcome,
    });
    stimulusAtRef.current = null;
    scheduleNext();
  }, [phase, scheduleNext]);

  useEffect(() => {
    if (phase === 'instructions' || phase === 'complete' || startedAtRef.current == null) return;
    const tick = () => {
      if (startedAtRef.current == null || finishedRef.current) return;
      const nextElapsed = performance.now() - startedAtRef.current;
      setElapsedMs(nextElapsed);
      if (nextElapsed >= durationMs) {
        finish();
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [durationMs, finish, phase]);

  useEffect(() => cleanupTimers, [cleanupTimers]);

  const progress = useMemo(() => Math.min(100, Math.round((elapsedMs / durationMs) * 100)), [durationMs, elapsedMs]);
  const secondsRemaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));

  if (phase === 'instructions') {
    return (
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="vigilance-title">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Etapa objetiva</p>
          <h2 id="vigilance-title" className="mt-1 text-xl font-semibold text-slate-900">Teste breve de vigilância</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Toque ou clique apenas quando o círculo azul aparecer. Responda o mais rápido possível sem antecipar.
            O resultado complementa o check-in de fadiga e não determina aptidão para voo de forma isolada.
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Duração prevista: cerca de {Math.round(durationMs / 60_000)} minutos. Mantenha a tela ativa e evite conversar ou alternar de aplicativo durante o teste.
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={start}>Iniciar teste</Button>
          {onCancel ? <Button variant="secondary" onClick={onCancel}>Cancelar</Button> : null}
        </div>
      </section>
    );
  }

  if (phase === 'complete') {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">Teste concluído</p>
        <p className="mt-1 text-sm text-emerald-800">Os dados foram adicionados à avaliação de prontidão desta jornada.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>Teste em andamento</span>
        <span>{secondsRemaining}s restantes</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`Progresso ${progress}%`}>
        <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <button
        type="button"
        onClick={respond}
        className={`flex min-h-72 w-full items-center justify-center rounded-2xl border-2 transition-colors focus:outline-none focus:ring-4 focus:ring-blue-200 ${
          phase === 'stimulus'
            ? 'border-blue-600 bg-blue-50'
            : 'border-slate-200 bg-slate-50'
        }`}
        aria-label={phase === 'stimulus' ? 'Responder ao estímulo agora' : 'Área do teste; aguarde o estímulo'}
      >
        {phase === 'stimulus' ? (
          <span className="h-24 w-24 rounded-full bg-blue-600 shadow-lg" aria-hidden="true" />
        ) : (
          <span className="text-sm font-medium text-slate-400">Aguarde…</span>
        )}
      </button>
      <p className="text-center text-xs text-slate-500">Não toque antes do estímulo aparecer.</p>
    </section>
  );
}
