import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/react-app/components/Button';
import {
  summarizeVigilanceTrials,
  type VigilanceSummary,
  type VigilanceTrial,
  PVTB_V2_PROTOCOL,
} from './operationalReadiness';

type Phase = 'instructions' | 'waiting' | 'stimulus' | 'invalidated' | 'complete';

type TrialFeedback = {
  outcome: VigilanceTrial['outcome'];
  reactionTimeMs: number | null;
};

export type OperationalVigilanceResult = {
  summary: VigilanceSummary;
  trials: VigilanceTrial[];
};

type OperationalVigilanceTestProps = {
  durationMs?: number;
  onComplete: (result: OperationalVigilanceResult) => void;
  onCancel?: () => void;
  onRunningChange?: (running: boolean) => void;
};

function randomDelay(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function feedbackCopy(feedback: TrialFeedback): { value: string; helper: string; className: string } {
  if (feedback.outcome === 'false_start') {
    return {
      value: 'Antecipado',
      helper: 'Espere o contador amarelo aparecer.',
      className: 'text-white',
    };
  }
  if (feedback.outcome === 'missed') {
    return {
      value: 'Sem resposta',
      helper: 'Mantenha a atenção no retângulo vermelho.',
      className: 'text-white',
    };
  }
  const reactionTimeMs = feedback.reactionTimeMs == null ? '—' : `${feedback.reactionTimeMs} ms`;
  if (feedback.outcome === 'lapse') {
    return {
      value: reactionTimeMs,
      helper: 'Resposta lenta (≥ 500 ms).',
      className: 'text-amber-200',
    };
  }
  return {
    value: reactionTimeMs,
    helper: 'Tempo da última resposta.',
    className: 'text-white',
  };
}

export default function OperationalVigilanceTest({
  durationMs = PVTB_V2_PROTOCOL.defaultDurationMs,
  onComplete,
  onCancel,
  onRunningChange,
}: OperationalVigilanceTestProps) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [trialFeedback, setTrialFeedback] = useState<TrialFeedback | null>(null);
  // Yellow PVT-B counter: milliseconds since the current stimulus appeared.
  const [counterMs, setCounterMs] = useState(0);
  const trialsRef = useRef<VigilanceTrial[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const scheduledAtRef = useRef<number | null>(null);
  const stimulusAtRef = useRef<number | null>(null);
  const waitingTimerRef = useRef<number | null>(null);
  const responseTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const counterTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const stimulusRafRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const stopCounter = useCallback(() => {
    if (counterTimerRef.current != null) {
      window.clearInterval(counterTimerRef.current);
      counterTimerRef.current = null;
    }
  }, []);

  const cleanupTimers = useCallback(() => {
    if (waitingTimerRef.current != null) window.clearTimeout(waitingTimerRef.current);
    if (responseTimerRef.current != null) window.clearTimeout(responseTimerRef.current);
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    if (stimulusRafRef.current != null) window.cancelAnimationFrame(stimulusRafRef.current);
    stopCounter();
    waitingTimerRef.current = null;
    responseTimerRef.current = null;
    feedbackTimerRef.current = null;
    rafRef.current = null;
    stimulusRafRef.current = null;
  }, [stopCounter]);

  const showTrialFeedback = useCallback((feedback: TrialFeedback) => {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    setTrialFeedback(feedback);
    feedbackTimerRef.current = window.setTimeout(() => {
      setTrialFeedback(null);
      feedbackTimerRef.current = null;
    }, PVTB_V2_PROTOCOL.feedbackHoldMs);
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cleanupTimers();
    setTrialFeedback(null);
    setCounterMs(0);
    const actualDuration =
      startedAtRef.current == null ? durationMs : performance.now() - startedAtRef.current;
    // The sampling window remains the nominal PVT-B duration even when the last
    // stimulus was already visible at the boundary and is allowed to resolve.
    const measurementDuration = Math.min(durationMs, Math.round(actualDuration));
    const summary = summarizeVigilanceTrials(
      trialsRef.current,
      measurementDuration,
      PVTB_V2_PROTOCOL.version,
    );
    setPhase('complete');
    onRunningChange?.(false);
    onComplete({ summary, trials: trialsRef.current.map((trial) => ({ ...trial })) });
  }, [cleanupTimers, durationMs, onComplete, onRunningChange]);

  const scheduleNext = useCallback(() => {
    if (finishedRef.current || startedAtRef.current == null) return;
    const now = performance.now();
    if (now - startedAtRef.current >= durationMs) {
      finish();
      return;
    }

    setPhase('waiting');
    setCounterMs(0);
    stopCounter();
    stimulusAtRef.current = null;
    // PVT-B inter-stimulus interval: ~1 s feedback hold + random 0–3 s delay.
    const delay =
      PVTB_V2_PROTOCOL.feedbackHoldMs +
      randomDelay(PVTB_V2_PROTOCOL.minPostFeedbackDelayMs, PVTB_V2_PROTOCOL.maxPostFeedbackDelayMs);
    scheduledAtRef.current = now + delay;
    waitingTimerRef.current = window.setTimeout(() => {
      if (finishedRef.current || startedAtRef.current == null) return;
      if (performance.now() - startedAtRef.current >= durationMs) {
        finish();
        return;
      }
      setPhase('stimulus');
      setTrialFeedback(null);
      if (feedbackTimerRef.current != null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      stimulusRafRef.current = window.requestAnimationFrame(() => {
        stimulusRafRef.current = null;
        if (finishedRef.current || startedAtRef.current == null) return;
        const stimulusAt = performance.now();
        stimulusAtRef.current = stimulusAt;
        setCounterMs(0);
        // Yellow counter ticks up ~every 50 ms; it is display only. The reaction
        // time is always measured from performance.now() at the response.
        counterTimerRef.current = window.setInterval(() => {
          if (stimulusAtRef.current == null) {
            stopCounter();
            return;
          }
          setCounterMs(Math.round(performance.now() - stimulusAtRef.current));
        }, PVTB_V2_PROTOCOL.counterTickMs);
        responseTimerRef.current = window.setTimeout(() => {
          const currentStimulusAt = stimulusAtRef.current;
          if (currentStimulusAt == null) return;
          stopCounter();
          trialsRef.current.push({
            sequence: trialsRef.current.length + 1,
            scheduledAtMs: Math.round(
              (scheduledAtRef.current ?? currentStimulusAt) - (startedAtRef.current ?? 0),
            ),
            stimulusAtMs: Math.round(currentStimulusAt - (startedAtRef.current ?? 0)),
            responseAtMs: null,
            reactionTimeMs: PVTB_V2_PROTOCOL.responseWindowMs,
            outcome: 'lapse',
          });
          stimulusAtRef.current = null;
          showTrialFeedback({
            outcome: 'lapse',
            reactionTimeMs: PVTB_V2_PROTOCOL.responseWindowMs,
          });
          scheduleNext();
        }, PVTB_V2_PROTOCOL.responseWindowMs);
      });
    }, delay);
  }, [durationMs, finish, showTrialFeedback, stopCounter]);

  const start = useCallback(() => {
    cleanupTimers();
    trialsRef.current = [];
    finishedRef.current = false;
    setInvalidReason(null);
    setTrialFeedback(null);
    setCounterMs(0);
    startedAtRef.current = performance.now();
    onRunningChange?.(true);
    setElapsedMs(0);
    scheduleNext();
  }, [cleanupTimers, onRunningChange, scheduleNext]);

  const invalidate = useCallback(
    (reason: string) => {
      if (startedAtRef.current == null || finishedRef.current) return;
      finishedRef.current = true;
      cleanupTimers();
      trialsRef.current = [];
      startedAtRef.current = null;
      stimulusAtRef.current = null;
      scheduledAtRef.current = null;
      setTrialFeedback(null);
      setCounterMs(0);
      setInvalidReason(reason);
      setPhase('invalidated');
      onRunningChange?.(false);
    },
    [cleanupTimers, onRunningChange],
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        invalidate('A tela foi ocultada ou outro aplicativo foi aberto durante o teste.');
      }
    };
    const onBlur = () => invalidate('A janela perdeu o foco durante o teste.');
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [invalidate]);

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
      showTrialFeedback({ outcome: 'false_start', reactionTimeMs: 0 });
      scheduleNext();
      return;
    }

    if (responseTimerRef.current != null) window.clearTimeout(responseTimerRef.current);
    stopCounter();
    const reactionTimeMs = now - stimulusAtRef.current;
    const outcome: VigilanceTrial['outcome'] =
      reactionTimeMs < PVTB_V2_PROTOCOL.falseStartThresholdMs
        ? 'false_start'
        : reactionTimeMs >= PVTB_V2_PROTOCOL.lapseThresholdMs
          ? 'lapse'
          : 'response';
    const roundedReactionTimeMs = Math.round(reactionTimeMs);

    trialsRef.current.push({
      sequence: trialsRef.current.length + 1,
      scheduledAtMs: Math.round((scheduledAtRef.current ?? stimulusAtRef.current) - startedAtRef.current),
      stimulusAtMs: Math.round(stimulusAtRef.current - startedAtRef.current),
      responseAtMs: Math.round(now - startedAtRef.current),
      reactionTimeMs: roundedReactionTimeMs,
      outcome,
    });
    stimulusAtRef.current = null;
    showTrialFeedback({ outcome, reactionTimeMs: roundedReactionTimeMs });
    scheduleNext();
  }, [phase, scheduleNext, showTrialFeedback, stopCounter]);

  useEffect(() => {
    if (phase === 'instructions' || phase === 'complete' || startedAtRef.current == null) return;
    const tick = () => {
      if (startedAtRef.current == null || finishedRef.current) return;
      const nextElapsed = performance.now() - startedAtRef.current;
      setElapsedMs(Math.min(nextElapsed, durationMs));
      if (nextElapsed >= durationMs) {
        // Do not cut off a stimulus that was already presented inside the sampling
        // window. It may resolve by response or by the 30 s PVT-B lapse ceiling;
        // no new stimulus is scheduled after the boundary.
        if (phase === 'stimulus' && stimulusAtRef.current != null) return;
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

  const progress = useMemo(
    () => Math.min(100, Math.round((elapsedMs / durationMs) * 100)),
    [durationMs, elapsedMs],
  );
  const secondsRemaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
  const feedback = trialFeedback ? feedbackCopy(trialFeedback) : null;


  // Keep the stimulus surface mounted and at a fixed position throughout the
  // session. Replacing instructions with the test used to shift the viewport
  // precisely when the pilot needed to respond.
  const running = phase === 'waiting' || phase === 'stimulus';
  const finished = phase === 'complete';
  const interrupted = phase === 'invalidated';

  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-labelledby="vigilance-title"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Etapa objetiva</p>
        <h2 id="vigilance-title" className="mt-1 text-lg font-semibold text-slate-900">
          Teste breve de vigilância psicomotora (PVT-B)
        </h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Um retângulo com borda vermelha fica visível sobre fundo preto. Quando um contador amarelo
          aparecer dentro dele, toque ou clique o mais rápido possível. Não responda antes do contador aparecer.
          O teste complementa o check-in e não determina aptidão isoladamente.
        </p>
      </div>

      <div className="flex min-h-10 flex-wrap items-center gap-3">
        <Button
          onClick={start}
          disabled={running || finished}
        >
          {running ? 'Teste em andamento' : interrupted ? 'Reiniciar teste' : finished ? 'Teste concluído' : 'Iniciar teste'}
        </Button>
        {phase === 'instructions' && onCancel ? (
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        ) : null}
        <span className="text-sm text-slate-600" aria-live="polite">
          {running ? String(secondsRemaining) + 's restantes' : finished ? 'Concluído' : '60 segundos de atenção'}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-label={'Progresso ' + progress + '%'}>
        <div className="h-full bg-red-600 transition-[width]" style={{ width: String(progress) + '%' }} />
      </div>

      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          if (running) respond();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (running) respond();
        }}
        data-testid="pvtb-box"
        data-phase={phase}
        aria-disabled={!running}
        className="flex h-72 min-h-72 w-full items-center justify-center rounded-xl border border-slate-800 bg-black p-6 focus:outline-none focus:ring-4 focus:ring-red-200"
        aria-label={
          phase === 'stimulus'
            ? 'Contador em andamento; responda agora'
            : running
              ? 'Área do teste; aguarde o contador amarelo'
              : 'Área do teste pronta; pressione Iniciar teste para começar'
        }
      >
        <span
          data-testid="pvtb-stimulus-frame"
          className="flex min-h-28 w-80 max-w-[80%] items-center justify-center border-4 border-red-600 bg-black px-4"
        >
          {phase === 'stimulus' ? (
            <span
              data-testid="pvtb-counter"
              className="font-mono text-6xl font-bold tabular-nums text-yellow-300 drop-shadow"
              aria-live="off"
            >
              {counterMs}
            </span>
          ) : running && feedback ? (
            <span className="text-center" aria-live="polite">
              <span className={['block text-4xl font-bold tabular-nums', feedback.className].join(' ')}>
                {feedback.value}
              </span>
              <span className="mt-2 block text-xs font-medium text-slate-300">{feedback.helper}</span>
            </span>
          ) : null}
        </span>
      </button>

      <div className="min-h-10 text-center text-xs leading-5 text-slate-500" aria-live="polite">
        {interrupted ? (
          <div role="alert" className="text-amber-800">
            <strong>Teste interrompido.</strong> {invalidReason || 'O teste perdeu as condições necessárias de medição.'}
            {' '}Nenhum resultado parcial será usado. Reinicie quando puder manter esta tela ativa até o final.
          </div>
        ) : finished ? (
          <p className="text-emerald-800">Teste concluído. O resultado será enviado junto ao check-in.</p>
        ) : (
          <p>Responda assim que o estímulo aparecer. O tempo é medido em milissegundos.</p>
        )}
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-700">Protocolo e referência científica</summary>
        <p className="mt-2">
          Protocolo AirTrust {PVTB_V2_PROTOCOL.version}. Janela de amostragem: {Math.round(PVTB_V2_PROTOCOL.defaultDurationMs / 1000)} s;
          lapso: ≥ {PVTB_V2_PROTOCOL.lapseThresholdMs} ms; antecipação: &lt; {PVTB_V2_PROTOCOL.falseStartThresholdMs} ms;
          resposta ausente: lapso de {PVTB_V2_PROTOCOL.responseWindowMs / 1000} s.
          O backend revalida tempos e sequência; o baseline individual usa apenas sessões do mesmo protocolo.
        </p>
        <p className="mt-2">
          Mantenha esta aba em primeiro plano. Trocar de aba, ocultar a janela ou interromper a medição
          invalida a sessão. Implementação independente AirTrust do paradigma PVT-B.
        </p>
        <p className="mt-2">
          Referência científica: Psychomotor Vigilance Task (PVT) —{' '}
          <a
            href="https://www.nasa.gov/human-systems-integration-division/human-performance/fatigue-countermeasures-laboratory/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-700 underline"
          >
            NASA Ames Fatigue Countermeasures Laboratory
          </a>
          .
        </p>
      </details>
    </section>
  );
}
