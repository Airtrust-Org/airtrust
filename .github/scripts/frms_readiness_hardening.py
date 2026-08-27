from pathlib import Path


def rep(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"expected one anchor in {path}, got {text.count(old)}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# Same-day re-evaluation: exclude current day from baseline and soft-delete prior active assessment.
p = "worker-airtrust/src/lib/frms/readiness-persistence.ts"
rep(
    p,
    "export async function countReadinessBaselineSessions(\n  db: D1Database,\n  empresaId: number,\n  funcionarioId: number,\n): Promise<number> {\n  const row = await db\n    .prepare(\n      `SELECT COUNT(*) AS total\n         FROM frms_readiness_assessment\n        WHERE empresa_id = ?\n          AND funcionario_id = ?\n          AND deleted_at IS NULL`,\n    )\n    .bind(empresaId, funcionarioId)\n",
    "export async function countReadinessBaselineSessions(\n  db: D1Database,\n  empresaId: number,\n  funcionarioId: number,\n  excludeReferenceDate?: string,\n): Promise<number> {\n  const row = await db\n    .prepare(\n      `SELECT COUNT(*) AS total\n         FROM frms_readiness_assessment\n        WHERE empresa_id = ?\n          AND funcionario_id = ?\n          AND deleted_at IS NULL\n          AND (? IS NULL OR reference_date <> ?)`,\n    )\n    .bind(empresaId, funcionarioId, excludeReferenceDate || null, excludeReferenceDate || null)\n",
)
rep(
    p,
    "  if (existing?.id) throw new Error('readiness_already_submitted');\n\n  const baselineSessions = await countReadinessBaselineSessions(db, input.empresaId, input.funcionarioId);\n",
    "  const baselineSessions = await countReadinessBaselineSessions(\n    db,\n    input.empresaId,\n    input.funcionarioId,\n    input.referenceDate,\n  );\n",
)
rep(
    p,
    "  const statements: D1PreparedStatement[] = [\n    db\n      .prepare(\n        `INSERT INTO frms_readiness_assessment (",
    "  const statements: D1PreparedStatement[] = [];\n\n  if (existing?.id) {\n    statements.push(\n      db\n        .prepare(\n          `UPDATE frms_readiness_assessment\n              SET deleted_at = ?, updated_at = ?\n            WHERE id = ? AND empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL`,\n        )\n        .bind(now, now, existing.id, input.empresaId, input.funcionarioId),\n    );\n  }\n\n  statements.push(\n    db\n      .prepare(\n        `INSERT INTO frms_readiness_assessment (",
)
rep(
    p,
    "        now,\n        now,\n      ),\n  ];\n\n  for (const trial of input.trials) {",
    "        now,\n        now,\n      ),\n  );\n\n  for (const trial of input.trials) {",
)

# Backend route: one source for baseline minimum and same-day replacement is supported.
p = "worker-airtrust/src/routes/frms-readiness.ts"
rep(
    p,
    "import {\n  countReadinessBaselineSessions,\n  persistReadinessAssessment,\n} from '../lib/frms/readiness-persistence';\n",
    "import {\n  countReadinessBaselineSessions,\n  persistReadinessAssessment,\n} from '../lib/frms/readiness-persistence';\nimport { READINESS_PROTOCOL } from '../lib/frms/readiness';\n",
)
rep(
    p,
    "      minimum_sessions: 5,\n      ready: sessions >= 5,\n",
    "      minimum_sessions: READINESS_PROTOCOL.minimumBaselineSessions,\n      ready: sessions >= READINESS_PROTOCOL.minimumBaselineSessions,\n",
)
rep(
    p,
    "    if (code === 'readiness_already_submitted') {\n      return c.json({ success: false, error: code }, 409);\n    }\n",
    "",
)

# Cognitive test invalidation on visibility/focus loss.
p = "src/react-app/pages/frms/OperationalVigilanceTest.tsx"
rep(p, "type Phase = 'instructions' | 'waiting' | 'stimulus' | 'complete';", "type Phase = 'instructions' | 'waiting' | 'stimulus' | 'invalidated' | 'complete';")
rep(p, "  const [elapsedMs, setElapsedMs] = useState(0);\n", "  const [elapsedMs, setElapsedMs] = useState(0);\n  const [invalidReason, setInvalidReason] = useState<string | null>(null);\n")
rep(
    p,
    "  const start = useCallback(() => {\n    cleanupTimers();\n    trialsRef.current = [];\n    finishedRef.current = false;\n",
    "  const start = useCallback(() => {\n    cleanupTimers();\n    trialsRef.current = [];\n    finishedRef.current = false;\n    setInvalidReason(null);\n",
)
anchor = "  const respond = useCallback(() => {"
insert = """  const invalidate = useCallback((reason: string) => {
    if (startedAtRef.current == null || finishedRef.current) return;
    finishedRef.current = true;
    cleanupTimers();
    trialsRef.current = [];
    startedAtRef.current = null;
    stimulusAtRef.current = null;
    scheduledAtRef.current = null;
    setInvalidReason(reason);
    setPhase('invalidated');
  }, [cleanupTimers]);

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

""" + anchor
rep(p, anchor, insert)
rep(
    p,
    "  if (phase === 'complete') {",
    """  if (phase === 'invalidated') {
    return (
      <section className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-5" role="alert">
        <div>
          <p className="font-semibold text-amber-900">Teste interrompido</p>
          <p className="mt-1 text-sm text-amber-800">{invalidReason || 'O teste perdeu as condições necessárias de medição.'}</p>
          <p className="mt-2 text-xs text-amber-700">Nenhum resultado parcial será usado. Reinicie quando puder manter esta tela ativa até o final.</p>
        </div>
        <Button onClick={start}>Reiniciar teste</Button>
      </section>
    );
  }

  if (phase === 'complete') {""",
)
rep(
    p,
    "Os dados foram adicionados à avaliação de prontidão desta jornada.",
    "O resultado está pronto para ser enviado junto com o check-in desta jornada.",
)

# Check-in: baseline status and safe same-day update handling.
p = "src/react-app/pages/frms/FrmsCheckinFadiga.tsx"
rep(
    p,
    "import { useSubmitReadiness } from '@/react-app/hooks/useOperationalReadiness';",
    "import { useReadinessBaseline, useReadinessToday, useSubmitReadiness } from '@/react-app/hooks/useOperationalReadiness';",
)
rep(
    p,
    "  const submitMutation = useSubmitCheckin();\n  const readinessMutation = useSubmitReadiness();\n",
    "  const submitMutation = useSubmitCheckin();\n  const readinessMutation = useSubmitReadiness();\n  const { data: readinessBaseline } = useReadinessBaseline();\n  const { data: readinessToday } = useReadinessToday(today);\n",
)
rep(p, "    if (submitMutation.isPending) return;", "    if (submitMutation.isPending || readinessMutation.isPending) return;")
old = """              <FormCard
                label="Bloco 3 - Atenção e tempo de reação"
                hint="Teste breve objetivo para complementar sono, KSS e sua autoavaliação. O resultado não determina aptidão isoladamente."
              >
                {vigilanceResult ? ("""
new = """              <FormCard
                label="Bloco 3 - Atenção e tempo de reação"
                hint="Teste breve objetivo para complementar sono, KSS e sua autoavaliação. O resultado não determina aptidão isoladamente."
              >
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {readinessBaseline?.ready
                    ? `Baseline individual disponível (${readinessBaseline.sessions} sessões anteriores).`
                    : `Baseline individual em formação (${readinessBaseline?.sessions ?? 0}/${readinessBaseline?.minimum_sessions ?? 5} sessões anteriores).`}
                  {readinessToday ? ' Já existe uma avaliação salva hoje; um novo teste substituirá a avaliação ativa de hoje sem contar duas vezes no baseline.' : ''}
                </div>
                {vigilanceResult ? ("""
rep(p, old, new)

# Schema plan documents active-row replacement semantics.
p = "worker-airtrust/schema-v2/plans/frms-operational-readiness-0471.md"
rep(
    p,
    "- `frms_readiness_assessment`: one tenant-scoped readiness assessment per employee/reference day, optionally linked to `frms_fadiga_checkin`;",
    "- `frms_readiness_assessment`: one active tenant-scoped readiness assessment per employee/reference day, optionally linked to `frms_fadiga_checkin`; same-day re-evaluations soft-delete the previous assessment so the baseline is never double-counted;",
)
