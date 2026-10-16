type Requirement = {
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string | null;
  qualificacao_tipo_codigo: string | null;
  obrigatoriedade: string;
  status_compliance: string;
};

type Person = { id: number; requisitos: Requirement[] };
type Enrollment = { funcionario_id: number; qualificacao_tipo_id: number | null };

export function summarizeTrainingComplianceCourses(
  people: Person[],
  activeEnrollments: Enrollment[],
) {
  const rows = new Map<number, {
    qualificacao_tipo_id: number;
    qualificacao_tipo_nome: string | null;
    qualificacao_tipo_codigo: string | null;
    pessoas: number;
    conformes: number;
    vencendo: number;
    vencidos: number;
    nao_realizados: number;
    em_andamento: number;
  }>();
  const requiredPairs = new Set<string>();

  for (const person of people) {
    for (const req of person.requisitos) {
      if (req.obrigatoriedade !== 'OBRIGATORIA') continue;
      requiredPairs.add(`${person.id}:${req.qualificacao_tipo_id}`);
      const row = rows.get(req.qualificacao_tipo_id) || {
        qualificacao_tipo_id: req.qualificacao_tipo_id,
        qualificacao_tipo_nome: req.qualificacao_tipo_nome,
        qualificacao_tipo_codigo: req.qualificacao_tipo_codigo,
        pessoas: 0,
        conformes: 0,
        vencendo: 0,
        vencidos: 0,
        nao_realizados: 0,
        em_andamento: 0,
      };
      row.pessoas++;
      if (req.status_compliance === 'CONFORME') row.conformes++;
      if (req.status_compliance === 'VENCENDO') { row.conformes++; row.vencendo++; }
      if (req.status_compliance === 'VENCIDO') row.vencidos++;
      if (req.status_compliance === 'NAO_REALIZADO') row.nao_realizados++;
      if (req.status_compliance === 'EM_ANDAMENTO') row.em_andamento++;
      rows.set(req.qualificacao_tipo_id, row);
    }
  }

  const enrolledByType = new Map<number, Set<number>>();
  for (const enrollment of activeEnrollments) {
    const typeId = Number(enrollment.qualificacao_tipo_id);
    const employeeId = Number(enrollment.funcionario_id);
    if (!typeId || !requiredPairs.has(`${employeeId}:${typeId}`)) continue;
    const employees = enrolledByType.get(typeId) || new Set<number>();
    employees.add(employeeId);
    enrolledByType.set(typeId, employees);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      matriculados: enrolledByType.get(row.qualificacao_tipo_id)?.size ?? 0,
      concluidos: Math.max(0, row.conformes - row.vencendo),
      compliance_pct: row.pessoas > 0 ? Math.round((row.conformes / row.pessoas) * 1000) / 10 : 100,
    }))
    .sort((a, b) => String(a.qualificacao_tipo_nome || '').localeCompare(
      String(b.qualificacao_tipo_nome || ''), 'pt-BR',
    ));
}
