from pathlib import Path

p = Path('src/react-app/pages/frms/OperationalVigilanceTest.tsx')
text = p.read_text()

def rep(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected one anchor, got {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)

rep(
    "  const rafRef = useRef<number | null>(null);\n  const finishedRef = useRef(false);",
    "  const rafRef = useRef<number | null>(null);\n  const stimulusRafRef = useRef<number | null>(null);\n  const finishedRef = useRef(false);",
)
rep(
    "    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);\n    waitingTimerRef.current = null;\n    responseTimerRef.current = null;\n    rafRef.current = null;",
    "    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);\n    if (stimulusRafRef.current != null) window.cancelAnimationFrame(stimulusRafRef.current);\n    waitingTimerRef.current = null;\n    responseTimerRef.current = null;\n    rafRef.current = null;\n    stimulusRafRef.current = null;",
)
old = """      const stimulusAt = performance.now();
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
"""
new = """      if (performance.now() - startedAtRef.current >= durationMs) {
        finish();
        return;
      }
      setPhase('stimulus');
      stimulusRafRef.current = window.requestAnimationFrame(() => {
        stimulusRafRef.current = null;
        if (finishedRef.current || startedAtRef.current == null) return;
        const stimulusAt = performance.now();
        stimulusAtRef.current = stimulusAt;
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
      });
"""
rep(old, new)
rep(
    "        onClick={respond}\n        className={`flex min-h-72",
    "        onPointerDown={(event) => {\n          event.preventDefault();\n          respond();\n        }}\n        onKeyDown={(event) => {\n          if (event.key !== 'Enter' && event.key !== ' ') return;\n          event.preventDefault();\n          respond();\n        }}\n        className={`flex min-h-72",
)
p.write_text(text)
