import { Hono } from 'hono';
import { hasSchemaTable } from '../utils/db-schema';
import type { Env } from '../types';
import { ApiError } from '../middleware/error-handler';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { getEmployeeSectorAccess, type EmployeeSectorAccess } from '../services/employee-sector-access';
import { trainingComplianceNeedsEnrollment } from '../services/training-compliance-enrollment-policy';
import { canReuseMatriculaCycle, ensureMatriculaCycle, hasActiveMatriculaCycle, resetMatriculaForNewCycle, syncMatriculaCycleFromMatricula } from '../services/lms-matricula-cycle';
import { stampLmsEnrollmentEvidenceProfile } from '../services/training-compliance-evidence-profile';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import type { TrainingComplianceSnapshot } from './compliance-treinamentos';

export type LmsEnrollment = {
  id: number;
  funcionario_id: number;
  curso_id: number;
  curso_titulo: string;
  qualificacao_tipo_id: number | null;
  qualificacao_tipo_nome: string | null;
  qualificacao_tipo_codigo: string | null;
  funcionario_nome: string;
  status: string;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
};

export type ReconciliationDecision = {
  matricula_id: number;
  decisao: 'MANTER_AVULSA';
  observacoes: string | null;
  updated_at: string;
};

export async function loadReconciliationDecisions(
  db: D1Database,
  empresaId: number,
): Promise<Map<number, ReconciliationDecision>> {
  const map = new Map<number, ReconciliationDecision>();
  if (!(await hasSchemaTable(db, 'treinamento_matricula_reconciliacoes'))) return map;
  const { results } = await db
    .prepare(
      `SELECT matricula_id, decisao, observacoes, updated_at
         FROM treinamento_matricula_reconciliacoes
        WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL`,
    )
    .bind(empresaId)
    .all<ReconciliationDecision>();
  for (const row of results || []) map.set(Number(row.matricula_id), row);
  return map;
}



type ReconciliationDeps = {
  tableExists: (db: D1Database, table: string) => Promise<boolean>;
  buildSnapshot: (db: D1Database, companyId: number, access: EmployeeSectorAccess) => Promise<TrainingComplianceSnapshot>;
  loadLmsEnrollments: (db: D1Database, companyId: number) => Promise<LmsEnrollment[]>;
  loadReconciliationDecisions: (db: D1Database, companyId: number) => Promise<Map<number, ReconciliationDecision>>;
  isRequired: (snapshot: TrainingComplianceSnapshot, person: TrainingComplianceSnapshot['people'][number], typeId: number) => boolean;
};

const QSMS_SAFETY_MATRIX_CODES = new Set([
  'AUD_COMP', 'BRIGADA_INCENDIO', 'COD_ETICA', 'INTRO_SGQ', 'COL_SEL',
  'MUDA', 'INTEGRA', 'NR-05', 'NR06', 'NR-11', 'NR-12', 'NR-20',
  'NR-26', 'NR-35', 'PRIMEIROS_SOCORROS', 'REGRAS_OURO_PETROBRAS',
  'CRM_CORP', 'CRM_DIR_RBAC119', 'JUST_CULTURE', 'FOD', 'LOSA',
  'PPSP_SUP', 'PPSP', 'PRE', 'D2', 'STOP_WORK', 'FDM-MECANICO', 'BOWTIEXP',
]);

function asPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createTrainingComplianceReconciliationActions(deps: ReconciliationDeps) {
  const router = new Hono<{ Bindings: Env }>();
// Reconciliação operacional: o requisito vem da matriz, a pendência do histórico
// e a matrícula é apenas o ciclo de execução. A conclusão anterior permanece no
// histórico e nunca bloqueia uma nova matrícula de renovação.
router.post('/matricular-pendentes', requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  if (empresaId !== 6) throw new ApiError('Reconciliação exclusiva da Costa do Sol', 403);
  if (!(await deps.tableExists(db, 'airtrust_schema_changes_v2'))) {
    throw new ApiError('Matriz corrigida 0547 não comprovada no banco', 409);
  }
  const applied = await db.prepare(
    'SELECT change_id FROM airtrust_schema_changes_v2 WHERE change_id=? AND baseline_id=? LIMIT 1',
  ).bind('training-compliance-regras-ouro-corporate-0547', 'production-d1-baseline-v2-20260714')
    .first();
  if (!applied) throw new ApiError('Aplicar primeiro a matriz corrigida 0547', 409);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const aplicar = payload.aplicar === true;
  const requestedType = payload.qualificacao_tipo_id === undefined ? null : asPositiveInt(payload.qualificacao_tipo_id);
  if (payload.qualificacao_tipo_id !== undefined && !requestedType) {
    throw new ApiError('Modelo de qualificação inválido para matrícula', 400);
  }
  const limit = 40;
  const access = await getEmployeeSectorAccess(c, empresaId);
  const [snapshot, active, courses] = await Promise.all([
    deps.buildSnapshot(db, empresaId, access),
    deps.loadLmsEnrollments(db, empresaId),
    db.prepare(
      `SELECT c.id,c.qualificacao_tipo_id FROM lms_cursos c
         JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id
           AND qt.empresa_id=c.empresa_id AND qt.ativo=1 AND qt.deleted_at IS NULL
        WHERE c.empresa_id=? AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL
          AND UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD')
        ORDER BY c.id`,
    ).bind(empresaId).all<{ id: number; qualificacao_tipo_id: number }>(),
  ]);
  const byType = new Map<number, number[]>();
  for (const course of courses.results || []) {
    const key = Number(course.qualificacao_tipo_id);
    byType.set(key, [...(byType.get(key) || []), Number(course.id)]);
  }
  const activeKeys = new Set(active.filter(row => row.qualificacao_tipo_id != null)
    .map(row => `${row.funcionario_id}:${row.qualificacao_tipo_id}`));
  const pendentes: Array<{ funcionarioId: number; qualificacaoTipoId: number; cursoId: number }> = [];
  let semCursoUnico = 0;
  for (const person of snapshot.people) {
    for (const req of person.requisitos) {
      if (requestedType && Number(req.qualificacao_tipo_id) !== requestedType) continue;
      if (req.obrigatoriedade !== 'OBRIGATORIA' ||
          req.evidencia_pendente_validacao ||
          !trainingComplianceNeedsEnrollment(req.status_compliance, req.dias_para_vencer) ||
          (req.modalidade_requerida && req.modalidade_requerida !== 'EAD') ||
          activeKeys.has(`${person.id}:${req.qualificacao_tipo_id}`)) continue;
      const mapped = byType.get(Number(req.qualificacao_tipo_id)) || [];
      if (mapped.length !== 1) { semCursoUnico++; continue; }
      pendentes.push({ funcionarioId: person.id, qualificacaoTipoId: req.qualificacao_tipo_id, cursoId: mapped[0] });
    }
  }
  const total = pendentes.length;
  if (!aplicar) {
    return c.json({ success: true, data: {
      modo: 'PREVIEW', pendentes: total, sem_curso_unico: semCursoUnico,
      limite_por_lote: limit, matriculadas: 0,
    } });
  }
  if (!(await deps.tableExists(db, 'auditoria_avancada_v2'))) {
    throw new ApiError('Trilha de auditoria indisponível; matrícula bloqueada', 409);
  }
  let matriculadas = 0;
  let preservadas = 0;
  let falhas = 0;
  const audit = extrairUsuarioAuditoria(c);
  for (const pending of pendentes.slice(0, limit)) {
    try {
      const existing = await db.prepare(
        `SELECT id,status,deleted_at FROM lms_matriculas WHERE empresa_id=? AND curso_id=? AND funcionario_id=?
         ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id DESC LIMIT 1`,
      ).bind(empresaId, pending.cursoId, pending.funcionarioId)
        .first<{ id: number; status: string; deleted_at: string | null }>();
      if (hasActiveMatriculaCycle(existing)) { preservadas++; continue; }
      let id: number;
      if (existing) {
        if (!canReuseMatriculaCycle(existing)) { preservadas++; continue; }
        await resetMatriculaForNewCycle(db, {
          matriculaId: existing.id, empresaId, origin: 'AUTO_RENOVACAO',
          observacoes: 'Matrícula gerada por requisito pendente na matriz QSMS/SO (sem e-mail)',
        });
        id = existing.id;
      } else {
        const inserted = await db.prepare(
          `INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id,observacoes)
           VALUES (?,?,?,'Matrícula gerada por requisito pendente na matriz QSMS/SO (sem e-mail)')`,
        ).bind(empresaId, pending.cursoId, pending.funcionarioId).run();
        id = Number(inserted.meta.last_row_id);
        if (!id) throw new Error('LMS_ENROLLMENT_NOT_CREATED');
      }
      await ensureMatriculaCycle(db, { matriculaId: id, empresaId, origin: 'AUTO_RENOVACAO' });
      await stampLmsEnrollmentEvidenceProfile(db, {
        empresaId, matriculaId: id, funcionarioId: pending.funcionarioId,
        qualificacaoTipoId: pending.qualificacaoTipoId,
      });
      await registrarAuditoria({
        db, tabela: 'lms_matriculas', acao: existing ? 'UPDATE' : 'INSERT', registro_id: id,
        dados_anteriores: existing ? { status: existing.status, empresa_id: empresaId } : null,
        dados_novos: { status: 'NAO_INICIADO', empresa_id: empresaId, curso_id: pending.cursoId,
          motivo: 'REQUISITO_PENDENTE_QSMS_20261010' },
        ...audit,
      });
      matriculadas++;
    } catch (error) {
      falhas++;
      console.error('[compliance] Falha em ciclo de matrícula (sem dados pessoais)', {
        qualificacao_tipo_id: pending.qualificacaoTipoId,
        error: error instanceof Error ? error.name : 'Unknown',
      });
    }
  }
  return c.json({
    success: falhas === 0,
    data: { modo: 'APLICACAO', pendentes: total, matriculadas,
      preservadas, falhas, sem_curso_unico: semCursoUnico,
      restantes_estimadas: Math.max(0, total - matriculadas - preservadas) },
    ...(falhas ? { error: 'Reconciliação parcialmente aplicada; reexecute após resolver os bloqueios' } : {}),
  }, falhas ? 409 : 200);
});

router.post('/limpeza', requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  if (empresaId !== 6) throw new ApiError('Limpeza exclusiva da matriz Costa do Sol', 403);
  // A nova decisão de 10/10 torna Regras de Ouro obrigatória para toda a
  // empresa. Exigir a correção governada 0547 antes de cancelar qualquer LMS.
  if (!(await deps.tableExists(db, 'airtrust_schema_changes_v2'))) {
    throw new ApiError('Matriz corrigida 0547 ainda não comprovada no banco; limpeza bloqueada', 409);
  }
  const finalMatrix = await db.prepare(
    `SELECT change_id FROM airtrust_schema_changes_v2
      WHERE change_id=? AND baseline_id=? LIMIT 1`,
  ).bind('training-compliance-regras-ouro-corporate-0547', 'production-d1-baseline-v2-20260714')
    .first<{ change_id: string }>();
  if (!finalMatrix) {
    throw new ApiError('Matriz corrigida 0547 ainda não aplicada neste ambiente; limpeza bloqueada', 409);
  }
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawIds = payload.matricula_ids;
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > 100 ||
      rawIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new ApiError('Informe de 1 a 100 IDs de matrícula válidos', 400);
  }
  const ids = [...new Set(rawIds as number[])];
  const aplicar = payload.aplicar === true;
  const access = await getEmployeeSectorAccess(c, empresaId);
  const [snapshot, enrollments, decisions] = await Promise.all([
    deps.buildSnapshot(db, empresaId, access),
    deps.loadLmsEnrollments(db, empresaId),
    deps.loadReconciliationDecisions(db, empresaId),
  ]);
  const byId = new Map(enrollments.map((row) => [Number(row.id), row]));
  const peopleById = new Map(snapshot.people.map((p) => [Number(p.id), p]));
  const elegiveis: LmsEnrollment[] = [];
  const bloqueadas: Array<{ matricula_id: number; motivo: string }> = [];
  for (const id of ids) {
    const row = byId.get(id);
    const person = row ? peopleById.get(Number(row.funcionario_id)) : null;
    const code = String(row?.qualificacao_tipo_codigo || '').trim().toUpperCase();
    const status = String(row?.status || '').trim().toUpperCase();
    let motivo = '';
    if (!row || !person) motivo = 'MATRICULA_NAO_LOCALIZADA_NO_ESCOPO';
    else if (!QSMS_SAFETY_MATRIX_CODES.has(code)) motivo = 'FORA_DA_MATRIZ_OU_SEM_MODELO';
    else if (decisions.get(id)?.decisao === 'MANTER_AVULSA') motivo = 'DESIGNACAO_AVULSA_MANTIDA';
    else if (['CONCLUIDO', 'CONCLUIDA'].includes(status)) motivo = 'CONCLUSAO_HISTORICA_PRESERVADA';
    else if (!['NAO_INICIADO', 'EM_ANDAMENTO'].includes(status)) motivo = 'STATUS_REQUER_REVISAO';
    else {
      if (deps.isRequired(snapshot, person, Number(row.qualificacao_tipo_id))) {
        motivo = 'REQUISITO_OU_DESIGNACAO_ATIVA';
      }
    }
    if (motivo) bloqueadas.push({ matricula_id: id, motivo });
    else if (row) elegiveis.push(row);
  }
  // Falha fechada: um lote misto não pode cancelar parcialmente matrículas válidas.
  if (aplicar && bloqueadas.length) {
    return c.json({ success: false, error: 'Lote alterado ou contém matrículas protegidas', data: { bloqueadas } }, 409);
  }
  let canceladas = 0;
  if (aplicar && elegiveis.length) {
    // Escrita e auditoria são parte da mesma transação. Sem trilha central, não há limpeza.
    if (!(await deps.tableExists(db, 'auditoria_avancada_v2'))) {
      throw new ApiError('Auditoria governada indisponível; limpeza não executada', 409);
    }
    const actor = extrairUsuarioAuditoria(c);
    const statements = elegiveis.flatMap((row) => [
      db.prepare(
        `UPDATE lms_matriculas SET status='CANCELADO',deleted_at=datetime('now'),updated_at=datetime('now')
          WHERE id=? AND empresa_id=? AND deleted_at IS NULL
            AND UPPER(TRIM(COALESCE(status,'')))=?`,
      ).bind(row.id, empresaId, String(row.status || '').trim().toUpperCase()),
      db.prepare(
        `INSERT INTO auditoria_avancada_v2
           (tabela,acao,registro_id,dados_anteriores,dados_novos,usuario_id,ip_address,user_agent,origem,created_at)
         SELECT 'lms_matriculas','UPDATE',?,?,?,?,?,?,'api',datetime('now')
          WHERE changes()=1`,
      ).bind(
        String(row.id),
        JSON.stringify({ empresa_id: empresaId, status: row.status }),
        JSON.stringify({ empresa_id: empresaId, status: 'CANCELADO', motivo: 'Matriz QSMS/Segurança Operacional 0534 — matrícula sem requisito' }),
        actor.usuario_id || null,
        actor.ip_address || null,
        actor.user_agent || null,
      ),
    ]);
    const writes = await db.batch(statements);
    for (let i = 0; i < elegiveis.length; i += 1) {
      if (Number(writes[2 * i].meta?.changes || 0) !== 1) continue;
      canceladas += 1;
      await syncMatriculaCycleFromMatricula(db, { matriculaId: elegiveis[i].id });
    }
  }
  return c.json({
    success: true,
    data: {
      modo: aplicar ? 'APLICACAO' : 'PREVIEW',
      avaliadas: ids.length,
      elegiveis: elegiveis.map((row) => ({ matricula_id: row.id, status: row.status })),
      bloqueadas,
      canceladas,
    },
  });
});


  return router;
}
