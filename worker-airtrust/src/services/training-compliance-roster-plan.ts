/**
 * Tenant-scoped reconciliation between mandatory Compliance requirements and the
 * LMS execution roster. Absence of historical evidence is an enrollment reason;
 * mere applicability is not. Historical/terminal cycles are never deleted.
 */
import type { TrainingComplianceSnapshot } from '../routes/compliance-treinamentos';
import { trainingComplianceNeedsEnrollment } from './training-compliance-enrollment-policy';

export type RosterCourse = {
  id: number;
  qualificacao_tipo_id: number;
  ativo?: number;
  publicado?: number;
};
export type RosterEnrollment = {
  id: number;
  funcionario_id: number;
  curso_id: number;
  status: string;
  deleted_at: string | null;
  progresso_pct: number | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  qualificacao_historico_id: number | null;
  has_scorm: number;
  has_xapi: number;
  has_history: number;
  has_diagnostics: number;
  has_cycle_evidence: number;
};
export type RosterEnrollAction = {
  funcionarioId: number;
  cursoId: number;
  tipoId: number;
  existingId: number | null;
  regraId: number;
};
export type RosterRemoveAction = {
  matriculaId: number;
  funcionarioId: number;
  cursoId: number;
  motivo: 'EVIDENCIA_VALIDA' | 'SEM_REQUISITO';
};
export type RosterPlan = {
  enroll: RosterEnrollAction[];
  remove: RosterRemoveAction[];
  protectedCount: number;
  skippedAmbiguousCourses: number;
  skippedPendingEvidence: number;
  skippedManualModality: number;
  skippedPolicyOptOut: number;
};

export function rosterEnrollmentHasEvidence(row: RosterEnrollment): boolean {
  return Number(row.progresso_pct || 0) > 0 ||
    Boolean(row.data_inicio || row.data_conclusao || row.qualificacao_historico_id) ||
    Boolean(row.has_scorm || row.has_xapi || row.has_history || row.has_diagnostics || row.has_cycle_evidence);
}

export function buildTrainingComplianceRosterPlan(
  snapshot: Pick<TrainingComplianceSnapshot, 'people'>,
  courses: RosterCourse[],
  enrollments: RosterEnrollment[],
  keepStandaloneEnrollmentIds: Set<number> = new Set(),
): RosterPlan {
  const byType = new Map<number, number[]>();
  for (const course of courses) {
    if (course.ativo !== 1 || course.publicado !== 1) continue;
    const typeId = Number(course.qualificacao_tipo_id);
    byType.set(typeId, [...(byType.get(typeId) || []), Number(course.id)]);
  }
  const byPersonType = new Map<string, TrainingComplianceSnapshot['people'][number]['requisitos'][number]>();
  const ambiguousRequirementPairs = new Set<string>();
  for (const person of snapshot.people) {
    for (const req of person.requisitos) {
      if (req.obrigatoriedade === 'OBRIGATORIA') {
        const key = `${person.id}:${req.qualificacao_tipo_id}`;
        if (byPersonType.has(key)) ambiguousRequirementPairs.add(key);
        byPersonType.set(key, req);
      }
    }
  }
  const courseToType = new Map(courses.map(c => [Number(c.id), Number(c.qualificacao_tipo_id)]));
  const enrollmentsByPair = new Map<string, RosterEnrollment[]>();
  for (const row of enrollments) {
    const key = `${row.funcionario_id}:${row.curso_id}`;
    enrollmentsByPair.set(key, [...(enrollmentsByPair.get(key) || []), row]);
  }
  for (const rows of enrollmentsByPair.values()) {
    rows.sort((a, b) => Number(Boolean(a.deleted_at)) - Number(Boolean(b.deleted_at)) || b.id - a.id);
  }
  const plan: RosterPlan = {
    enroll: [], remove: [], protectedCount: 0,
    skippedAmbiguousCourses: 0, skippedPendingEvidence: 0, skippedManualModality: 0,
    skippedPolicyOptOut: 0,
  };

  for (const person of snapshot.people) {
    for (const req of person.requisitos) {
      if (req.obrigatoriedade !== 'OBRIGATORIA') continue;
      if (ambiguousRequirementPairs.has(`${person.id}:${req.qualificacao_tipo_id}`)) {
        plan.skippedAmbiguousCourses++;
        continue;
      }
      if (req.evidencia_pendente_validacao) {
        plan.skippedPendingEvidence++;
        continue;
      }
      if (req.modalidade_requerida !== 'EAD') {
        plan.skippedManualModality++;
        continue;
      }
      if (req.auto_matricular_ead !== 1) {
        plan.skippedPolicyOptOut++;
        continue;
      }
      if (!trainingComplianceNeedsEnrollment(req.status_compliance, req.dias_para_vencer)) continue;
      const candidateCourses = byType.get(Number(req.qualificacao_tipo_id)) || [];
      if (candidateCourses.length !== 1) {
        plan.skippedAmbiguousCourses++;
        continue;
      }
      const courseId = candidateCourses[0];
      const existing = enrollmentsByPair.get(`${person.id}:${courseId}`) || [];
      if (existing.some(row => !row.deleted_at &&
        ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(row.status).toUpperCase()))) continue;
      plan.enroll.push({
        funcionarioId: person.id,
        cursoId: courseId,
        tipoId: Number(req.qualificacao_tipo_id),
        existingId: existing[0]?.id || null,
        regraId: req.regra_id,
      });
    }
  }

  const activePeople = new Set(snapshot.people.map(person => Number(person.id)));
  for (const row of enrollments) {
    if (!activePeople.has(Number(row.funcionario_id)) || row.deleted_at) continue;
    if (String(row.status).toUpperCase() !== 'NAO_INICIADO') continue;
    if (keepStandaloneEnrollmentIds.has(row.id)) {
      plan.protectedCount++;
      continue;
    }
    if (rosterEnrollmentHasEvidence(row)) {
      plan.protectedCount++;
      continue;
    }
    const typeId = courseToType.get(Number(row.curso_id));
    // Unmapped courses are manual-review items, never auto-removed.
    if (!typeId) {
      plan.protectedCount++;
      continue;
    }
    const pairKey = `${row.funcionario_id}:${typeId}`;
    if (ambiguousRequirementPairs.has(pairKey)) {
      plan.protectedCount++;
      continue;
    }
    const req = byPersonType.get(pairKey);
    if (req?.evidencia_pendente_validacao) {
      plan.protectedCount++;
      continue;
    }
    if (req && (!['CONFORME', 'VENCENDO'].includes(req.status_compliance) ||
      trainingComplianceNeedsEnrollment(req.status_compliance, req.dias_para_vencer))) continue;
    plan.remove.push({
      matriculaId: row.id, funcionarioId: row.funcionario_id, cursoId: row.curso_id,
      motivo: req ? 'EVIDENCIA_VALIDA' : 'SEM_REQUISITO',
    });
  }
  plan.enroll.sort((a, b) => a.cursoId - b.cursoId || a.funcionarioId - b.funcionarioId);
  plan.remove.sort((a, b) => a.matriculaId - b.matriculaId);
  return plan;
}

/**
 * Fair, bounded traversal of a fresh Compliance roster preview.
 * Cursor orders actions only: it never grants applicability or authorization.
 * The plan is rebuilt and policy-checked for every tick. Do not persist IDs
 * of people outside the existing tenant-scoped cron state.
 */
export function selectTrainingComplianceRosterBatch(
  plan: RosterPlan,
  cursor: string | null,
  limit = 8,
): { batch: RosterPlan; cursorAfter: string | null; selectedCount: number; totalActions: number } {
  const padded = (id: number) => String(id).padStart(16, '0');
  const ordered = [
    ...plan.remove.map(action => ({
      key: `0:${padded(action.matriculaId)}`, kind: 'remove' as const, action,
    })),
    ...plan.enroll.map(action => ({
      key: `1:${padded(action.cursoId)}:${padded(action.funcionarioId)}`,
      kind: 'enroll' as const, action,
    })),
  ].sort((a, b) => a.key.localeCompare(b.key));
  const validCursor = typeof cursor === 'string' &&
    /^[01]:[0-9]{16}(?::[0-9]{16})?$/.test(cursor) ? cursor : null;
  let start = validCursor ? ordered.findIndex(item => item.key > validCursor) : 0;
  if (start < 0) start = 0;
  const size = Number.isFinite(limit) ? Math.min(20, Math.max(1, Math.trunc(limit))) : 8;
  const selected = [...ordered.slice(start), ...ordered.slice(0, start)].slice(0, size);
  const batch: RosterPlan = { ...plan, enroll: [], remove: [] };
  for (const item of selected) {
    if (item.kind === 'remove') batch.remove.push(item.action);
    else batch.enroll.push(item.action);
  }
  return {
    batch,
    cursorAfter: selected.at(-1)?.key ?? null,
    selectedCount: selected.length,
    totalActions: ordered.length,
  };
}
