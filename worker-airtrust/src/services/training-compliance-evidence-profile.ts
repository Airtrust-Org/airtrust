import {
  trainingComplianceRuleApplicabilitySql,
  trainingComplianceRulePrioritySql,
} from './training-compliance-rule-engine';

async function tableExists(db: D1Database, table: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
    .bind(table)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function columnExists(db: D1Database, table: string, column: string): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const { results } = await db
    .prepare(`PRAGMA table_info('${table.replaceAll("'", "''")}')`)
    .all<{ name: string }>();
  return (results || []).some((row) => row.name === column);
}

export function normalizeTrainingComplianceEvidenceProfile(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized || null;
}
export async function resolveEffectiveTrainingComplianceProfile(
  db: D1Database,
  params: { empresaId: number; funcionarioId: number; qualificacaoTipoId: number },
): Promise<string | null> {
  if (!(await columnExists(db, 'treinamento_requisitos', 'perfil_competencia'))) return null;
  if (!(await tableExists(db, 'funcionarios'))) return null;

  const applicability = trainingComplianceRuleApplicabilitySql('tr', 'f');
  const priority = trainingComplianceRulePrioritySql('tr');
  try {
    const row = await db
      .prepare(
        `SELECT tr.perfil_competencia, tr.obrigatoriedade
           FROM funcionarios f
           JOIN treinamento_requisitos tr
             ON tr.empresa_id=f.empresa_id
            AND tr.qualificacao_tipo_id=?
          WHERE f.id=? AND f.empresa_id=? AND f.deleted_at IS NULL
            AND tr.ativo=1 AND tr.deleted_at IS NULL
            AND (tr.vigencia_inicio IS NULL OR date(tr.vigencia_inicio)<=date('now'))
            AND (tr.vigencia_fim IS NULL OR date(tr.vigencia_fim)>=date('now'))
            AND ${applicability}
          ORDER BY ${priority} DESC, tr.id DESC
          LIMIT 1`,
      )
      .bind(params.qualificacaoTipoId, params.funcionarioId, params.empresaId)
      .first<{ perfil_competencia: string | null; obrigatoriedade: string }>();
    if (!row || String(row.obrigatoriedade).toUpperCase() === 'NAO_APLICA') return null;
    return normalizeTrainingComplianceEvidenceProfile(row.perfil_competencia);
  } catch {
    // Rollout compatibility: an older/local schema can lack one of the V2
    // applicability support tables. In that case evidence remains unprofiled.
    return null;
  }
}

export async function listTrainingComplianceEvidenceProfilesForQualification(
  db: D1Database,
  params: { empresaId: number; qualificacaoTipoId: number },
): Promise<string[]> {
  if (!(await columnExists(db, 'treinamento_requisitos', 'perfil_competencia'))) return [];
  try {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT perfil_competencia
           FROM treinamento_requisitos
          WHERE empresa_id=? AND qualificacao_tipo_id=?
            AND ativo=1 AND deleted_at IS NULL
            AND perfil_competencia IS NOT NULL AND TRIM(perfil_competencia)<>''
            AND (vigencia_inicio IS NULL OR date(vigencia_inicio)<=date('now'))
            AND (vigencia_fim IS NULL OR date(vigencia_fim)>=date('now'))
          ORDER BY perfil_competencia ASC`,
      )
      .bind(params.empresaId, params.qualificacaoTipoId)
      .all<{ perfil_competencia: string }>();
    return [
      ...new Set(
        (results || [])
          .map((row) => normalizeTrainingComplianceEvidenceProfile(row.perfil_competencia))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
  } catch {
    return [];
  }
}

export async function readQualificationEvidenceProfile(
  db: D1Database,
  params: { empresaId: number; historicoId: number; funcionarioId: number },
): Promise<string | null> {
  if (!(await columnExists(db, 'qualificacoes_historico', 'perfil_competencia'))) return null;
  const row = await db
    .prepare(
      `SELECT perfil_competencia FROM qualificacoes_historico
        WHERE id=? AND empresa_id=? AND funcionario_id=? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(params.historicoId, params.empresaId, params.funcionarioId)
    .first<{ perfil_competencia: string | null }>();
  return normalizeTrainingComplianceEvidenceProfile(row?.perfil_competencia);
}

export async function stampQualificationEvidenceProfile(
  db: D1Database,
  params: {
    empresaId: number;
    historicoId: number;
    funcionarioId: number;
    qualificacaoTipoId: number;
    explicitProfile?: string | null;
  },
): Promise<string | null> {
  if (!(await columnExists(db, 'qualificacoes_historico', 'perfil_competencia'))) return null;
  const profile =
    normalizeTrainingComplianceEvidenceProfile(params.explicitProfile) ||
    (await resolveEffectiveTrainingComplianceProfile(db, params));
  if (!profile) return null;
  await db
    .prepare(
      `UPDATE qualificacoes_historico
          SET perfil_competencia=?, updated_at=datetime('now')
        WHERE id=? AND empresa_id=? AND funcionario_id=? AND deleted_at IS NULL`,
    )
    .bind(profile, params.historicoId, params.empresaId, params.funcionarioId)
    .run();
  return profile;
}
export async function stampLmsEnrollmentEvidenceProfile(
  db: D1Database,
  params: {
    empresaId: number;
    matriculaId: number;
    funcionarioId: number;
    qualificacaoTipoId: number | null;
  },
): Promise<string | null> {
  if (!params.qualificacaoTipoId) return null;
  if (!(await columnExists(db, 'lms_matriculas', 'perfil_competencia'))) return null;
  const profile = await resolveEffectiveTrainingComplianceProfile(db, {
    empresaId: params.empresaId,
    funcionarioId: params.funcionarioId,
    qualificacaoTipoId: params.qualificacaoTipoId,
  });
  await db
    .prepare(
      `UPDATE lms_matriculas
          SET perfil_competencia=?, updated_at=datetime('now')
        WHERE id=? AND empresa_id=? AND funcionario_id=? AND deleted_at IS NULL`,
    )
    .bind(profile, params.matriculaId, params.empresaId, params.funcionarioId)
    .run();
  return profile;
}

export async function readLmsEnrollmentEvidenceProfile(
  db: D1Database,
  params: { empresaId: number; matriculaId: number; funcionarioId: number },
): Promise<string | null> {
  if (!(await columnExists(db, 'lms_matriculas', 'perfil_competencia'))) return null;
  const row = await db
    .prepare(
      `SELECT perfil_competencia FROM lms_matriculas
        WHERE id=? AND empresa_id=? AND funcionario_id=? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(params.matriculaId, params.empresaId, params.funcionarioId)
    .first<{ perfil_competencia: string | null }>();
  return normalizeTrainingComplianceEvidenceProfile(row?.perfil_competencia);
}
