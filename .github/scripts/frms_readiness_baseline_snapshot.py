from pathlib import Path
import hashlib
import json


def rep(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'expected {expected} anchor(s) in {path}, got {count}: {old[:140]!r}')
    p.write_text(text.replace(old, new, expected))

# Baseline is chronological: only sessions before the evaluated date may participate.
p = 'worker-airtrust/src/lib/frms/readiness-persistence.ts'
rep(p, 'excludeReferenceDate?: string', 'beforeReferenceDate?: string', expected=2)
rep(p, 'excludeReferenceDate || null', 'beforeReferenceDate || null', expected=4)
rep(p, 'AND (? IS NULL OR reference_date <> ?)', 'AND (? IS NULL OR reference_date < ?)', expected=2)
rep(
    p,
    'const sessions = await countReadinessBaselineSessions(db, empresaId, funcionarioId, excludeReferenceDate);',
    'const sessions = await countReadinessBaselineSessions(db, empresaId, funcionarioId, beforeReferenceDate);',
)

# Expose the immutable baseline snapshot/deltas with the saved assessment.
p = 'worker-airtrust/src/routes/frms-readiness.ts'
rep(
    p,
    '       baseline_sessions, baseline_ready, duration_ms, valid_trials,',
    '       baseline_sessions, baseline_ready, baseline_median_rt_ms, baseline_lapse_rate,\n       median_rt_delta_pct, lapse_rate_delta, duration_ms, valid_trials,',
)
rep(p, "  const excludeDate = c.req.query('date');", "  const beforeDate = c.req.query('date');")
rep(p, "  if (excludeDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(excludeDate)) {", "  if (beforeDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(beforeDate)) {")
rep(p, '    excludeDate || undefined,', '    beforeDate || undefined,')

# Frontend response contract carries snapshot data without using it as an unvalidated score weight.
p = 'src/react-app/hooks/useOperationalReadiness.ts'
rep(
    p,
    "  baselineReady: boolean;\n  warningSignals: string[];",
    "  baselineReady: boolean;\n  baselineMedianRtMs: number | null;\n  baselineLapseRate: number | null;\n  medianRtDeltaPct: number | null;\n  lapseRateDelta: number | null;\n  warningSignals: string[];",
)
rep(
    p,
    "  baseline_ready: number;\n  duration_ms: number;",
    "  baseline_ready: number;\n  baseline_median_rt_ms: number | null;\n  baseline_lapse_rate: number | null;\n  median_rt_delta_pct: number | null;\n  lapse_rate_delta: number | null;\n  duration_ms: number;",
)

# Document baseline snapshot semantics and preserve Schema V2 certificate hashes.
p = 'worker-airtrust/schema-v2/plans/frms-operational-readiness-0471.md'
rep(
    p,
    '- `frms_readiness_assessment`: one active tenant-scoped readiness assessment per employee/reference day, optionally linked to `frms_fadiga_checkin`; same-day re-evaluations soft-delete the previous assessment so the baseline is never double-counted;',
    '- `frms_readiness_assessment`: one active tenant-scoped readiness assessment per employee/reference day, optionally linked to `frms_fadiga_checkin`; same-day re-evaluations soft-delete the previous assessment so the baseline is never double-counted; each assessment snapshots the median reaction-time/lapse-rate baseline from up to the 5 valid sessions strictly before its reference date, plus current-vs-baseline deltas;',
)

p = 'docs/frms/OPERATIONAL_READINESS_PVT_V1.md'
rep(
    p,
    'O baseline individual usa avaliações anteriores válidas do próprio funcionário e do mesmo tenant. São necessárias 5 sessões anteriores antes de a comparação sair de `baseline_building`.',
    'O baseline individual usa avaliações anteriores válidas do próprio funcionário e do mesmo tenant. São necessárias 5 sessões anteriores antes de a comparação sair de `baseline_building`. O snapshot usa até as 5 sessões válidas mais recentes estritamente anteriores à data avaliada e registra mediana individual de tempo de reação, taxa de lapsos e os deltas atuais; esses deltas ficam observáveis/auditáveis, mas ainda não recebem peso adicional na classificação sem critério validado.',
)

change_path = Path('worker-airtrust/schema-v2/changes/0471_frms_operational_readiness.sql')
plan_path = Path('worker-airtrust/schema-v2/plans/frms-operational-readiness-0471.md')
manifest_path = Path('worker-airtrust/schema-v2/frms-operational-readiness-0471.json')
manifest = json.loads(manifest_path.read_text())
manifest['fileHash'] = hashlib.sha256(change_path.read_bytes()).hexdigest()
manifest['planHash'] = hashlib.sha256(plan_path.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

# Safety: canonical migration and Schema V2 change must remain byte-identical.
migration = Path('worker-airtrust/migrations/0471_frms_operational_readiness.sql').read_bytes()
change = change_path.read_bytes()
if migration != change:
    raise SystemExit('0471 migration and Schema V2 change diverged')
