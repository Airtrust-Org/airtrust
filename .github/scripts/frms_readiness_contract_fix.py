from pathlib import Path


def rep(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"expected one anchor in {path}, got {text.count(old)}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Fix frontend metric contract names and make baseline explicitly exclude the current reference day.
p = 'src/react-app/pages/frms/FrmsCheckinFadiga.tsx'
rep(p, '  const { data: readinessBaseline } = useReadinessBaseline();', '  const { data: readinessBaseline } = useReadinessBaseline(today);')
rep(
    p,
    "vigilanceResult.summary.medianRtMs == null ? '-' : `${Math.round(vigilanceResult.summary.medianRtMs)} ms`",
    "vigilanceResult.summary.medianReactionTimeMs == null ? '-' : `${Math.round(vigilanceResult.summary.medianReactionTimeMs)} ms`",
)
rep(p, 'vigilanceResult.summary.lapseCount', 'vigilanceResult.summary.lapses')
rep(p, 'vigilanceResult.summary.falseStartCount', 'vigilanceResult.summary.falseStarts')

p = 'src/react-app/hooks/useOperationalReadiness.ts'
rep(
    p,
    "export function useReadinessBaseline() {\n  return useQuery({\n    queryKey: ['frms-readiness-baseline'],\n    queryFn: () => fetchJson<ReadinessBaseline>('/frms/readiness/baseline'),",
    "export function useReadinessBaseline(referenceDate?: string) {\n  return useQuery({\n    queryKey: ['frms-readiness-baseline', referenceDate || null],\n    queryFn: () =>\n      fetchJson<ReadinessBaseline>(\n        referenceDate\n          ? `/frms/readiness/baseline?date=${encodeURIComponent(referenceDate)}`\n          : '/frms/readiness/baseline',\n      ),",
)
rep(
    p,
    "      queryClient.invalidateQueries({ queryKey: ['frms-readiness-baseline'] });",
    "      queryClient.invalidateQueries({ queryKey: ['frms-readiness-baseline'] });",
)

p = 'worker-airtrust/src/routes/frms-readiness.ts'
rep(
    p,
    "  const sessions = await countReadinessBaselineSessions(c.env.DB, empresaId, funcionarioId);\n  return c.json({",
    "  const excludeDate = c.req.query('date');\n  if (excludeDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(excludeDate)) {\n    return c.json({ success: false, error: 'invalid_reference_date' }, 400);\n  }\n  const sessions = await countReadinessBaselineSessions(\n    c.env.DB,\n    empresaId,\n    funcionarioId,\n    excludeDate || undefined,\n  );\n  return c.json({",
)
