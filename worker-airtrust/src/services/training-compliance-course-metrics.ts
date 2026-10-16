type RequiredPerson = {
  id: number;
  requisitos: Array<{ obrigatoriedade: string; qualificacao_tipo_id: number }>;
};

type ActiveEnrollment = {
  funcionario_id: number;
  qualificacao_tipo_id?: number | null;
};

export function countActiveRequiredEnrollmentsByType(
  people: RequiredPerson[],
  enrollments: ActiveEnrollment[],
): Map<number, Set<number>> {
  const requiredPairs = new Set<string>();
  for (const person of people) {
    for (const req of person.requisitos) {
      if (req.obrigatoriedade === 'OBRIGATORIA') {
        requiredPairs.add(`${person.id}:${req.qualificacao_tipo_id}`);
      }
    }
  }

  const byType = new Map<number, Set<number>>();
  for (const enrollment of enrollments) {
    const typeId = Number(enrollment.qualificacao_tipo_id);
    const employeeId = Number(enrollment.funcionario_id);
    if (!typeId || !requiredPairs.has(`${employeeId}:${typeId}`)) continue;
    const employees = byType.get(typeId) || new Set<number>();
    employees.add(employeeId);
    byType.set(typeId, employees);
  }
  return byType;
}
