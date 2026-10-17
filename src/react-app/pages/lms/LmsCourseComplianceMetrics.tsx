import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';
import type { LmsCurso } from '@/react-app/hooks/useLms';

export type ComplianceRow = {
  qualificacao_tipo_id: number;
  pessoas: number;
  conformes: number;
  vencendo: number;
  matriculados: number;
  concluidos: number;
  compliance_pct: number;
};

export function useLmsCourseCompliance(enabled = true) {
  return useQuery({
    queryKey: ['training-compliance', 'trainings', null, null, ''],
    queryFn: async (): Promise<ComplianceRow[]> => {
      const response = await fetchWithAuth('/api/compliance-treinamentos/treinamentos');
      if (!response.ok) throw new Error('Não foi possível carregar os indicadores de compliance');
      const json = await response.json() as { success?: boolean; data?: ComplianceRow[] };
      if (json.success === false || !Array.isArray(json.data)) {
        throw new Error('Resposta inválida do compliance de treinamentos');
      }
      return json.data;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function getLmsCourseCompliance(
  curso: Pick<LmsCurso, 'qualificacao_tipo_id'>,
  rows: ComplianceRow[] | undefined,
) {
  if (!rows || !curso.qualificacao_tipo_id) return null;
  const row = rows.find((item) => item.qualificacao_tipo_id === curso.qualificacao_tipo_id);
  if (!row) return null;
  return {
    obrigatorios: row.pessoas,
    matriculados: row.matriculados,
    concluidos: row.concluidos,
    compliance: row.compliance_pct,
  };
}

export function LmsCourseComplianceMetrics({
  curso,
  rows,
  compact = false,
}: {
  curso: Pick<LmsCurso, 'qualificacao_tipo_id'>;
  rows: ComplianceRow[] | undefined;
  compact?: boolean;
}) {
  const metrics = getLmsCourseCompliance(curso, rows);
  if (!metrics) {
    return <span className="text-xs text-slate-500">Compliance: não aplicável ou indisponível</span>;
  }
  return (
    <div className={compact ? 'text-xs text-slate-600 dark:text-slate-300' : 'text-sm text-slate-700 dark:text-slate-200'}>
      <span>Obrigatórios: {metrics.obrigatorios}</span>
      <span> · Matriculados: {metrics.matriculados}</span>
      <span> · Concluídos: {metrics.concluidos}</span>
      <span> · Compliance: {metrics.compliance.toLocaleString('pt-BR')}%</span>
    </div>
  );
}

/** Shows the canonical required-person count only when the course has a matching compliance row. */
export function LmsCourseMandatoryPill({
  curso,
  rows,
}: {
  curso: Pick<LmsCurso, 'qualificacao_tipo_id'>;
  rows: ComplianceRow[] | undefined;
}) {
  const count = getLmsCourseCompliance(curso, rows)?.obrigatorios;
  if (count == null || !Number.isFinite(count) || count < 0) return null;
  return (
    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      Obrigatórios: {count}
    </span>
  );
}
