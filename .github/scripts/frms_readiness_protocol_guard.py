from pathlib import Path


def rep(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected one anchor in {path}, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

rep(
    'worker-airtrust/src/lib/frms/readiness.ts',
    "  scoringVersion: 'readiness-score-v1',\n  lapseThresholdMs: 500,",
    "  scoringVersion: 'readiness-score-v1',\n  defaultDurationMs: 180_000,\n  allowedDurationDriftMs: 15_000,\n  minimumTrials: 10,\n  lapseThresholdMs: 500,",
)

rep(
    'worker-airtrust/src/routes/frms-readiness.ts',
    "  duration_ms: z.number().int().min(30_000).max(15 * 60_000),\n  trials: z.array(trialSchema).min(1).max(300),",
    "  duration_ms: z\n    .number()\n    .int()\n    .min(READINESS_PROTOCOL.defaultDurationMs - READINESS_PROTOCOL.allowedDurationDriftMs)\n    .max(READINESS_PROTOCOL.defaultDurationMs + READINESS_PROTOCOL.allowedDurationDriftMs),\n  trials: z.array(trialSchema).min(READINESS_PROTOCOL.minimumTrials).max(300),",
)

p = Path('worker-airtrust/src/__tests__/routes/frms-readiness.test.ts')
text = p.read_text()
anchor = """const validTrial = {
  sequence: 1,
  scheduledAtMs: 1000,
  stimulusAtMs: 1100,
  responseAtMs: 1380,
  reactionTimeMs: 280,
  outcome: 'response',
};
"""
addition = anchor + """
const validTrials = Array.from({ length: 10 }, (_, index) => {
  const sequence = index + 1;
  const scheduledAtMs = sequence * 10_000;
  const stimulusAtMs = scheduledAtMs + 100;
  return {
    ...validTrial,
    sequence,
    scheduledAtMs,
    stimulusAtMs,
    responseAtMs: stimulusAtMs + 280,
  };
});
"""
if text.count(anchor) != 1:
    raise SystemExit('validTrial anchor missing')
text = text.replace(anchor, addition, 1)
if text.count('trials: [validTrial]') != 2:
    raise SystemExit(f'expected 2 valid trial payloads, got {text.count("trials: [validTrial]")}')
text = text.replace('trials: [validTrial]', 'trials: validTrials', 2)
p.write_text(text)
