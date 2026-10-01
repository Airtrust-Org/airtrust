import {
  trainingComplianceRuleApplicabilitySql,
  trainingComplianceRulePrioritySql,
} from './training-compliance-rule-engine';
import { hasSchemaColumn, hasSchemaTable } from '../utils/db-schema';

const tableExists = hasSchemaTable;
const columnExists = hasSchemaColumn;

const QUALIFICATION_EVIDENCE_PROFILES_TABLE = 'qualificacoes_historico_perfis_competencia';

export function normalizeTrainingComplianceEvidenceProfile(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized || null;
}

export async function buildQualificationEvidenceProfileSql(
  db: D1Database,
  qualificationHistoryColumns: ReadonlySet<string>,
): Promise<{ select: string; joins: string; available: boolean }> {
  const hasScalarProfile = qualificationHistoryColumns.has('perfil_competencia');
  const lmsProfileReady =
    qualificationHistoryColumns.has('lms_matricula_id') &&
    (await columnExists(db, 'lms_matriculas', 'perfil_competencia'));
  const multiProfileReady = await tableExists(db, QUALIFICATION_EVIDENCE_PROFILES_TABLE);
  const scalarSelect = hasScalarProfile
    ? lmsProfileReady
      ? 'COALESCE(qh.perfil_competencia, lm_profile.perfil_competencia)'
      : 'qh.perfil_competencia'
    : lmsProfileReady
      ? 'lm_profile.perfil_competencia'
      : 'NULL';
  const joins = [
    multiProfileReady
      ? 'LEFT JOIN qualificacoes_historico_perfis_competencia qhp ON qhp.historico_id=qh.id AND qhp.empresa_id=f.empresa_id AND qhp.deleted_at IS NULL'
      : '',
    lmsProfileReady
      ? 'LEFT JOIN lms_matriculas lm_profile ON lm_profile.id=qh.lms_matricula_id AND lm_profile.empresa_id=f.empresa_id AND lm_profile.deleted_at IS NULL'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    select: multiProfileReady ? `COALESCE(qhp.perfil_competencia, ${scalarSelect})` : scalarSelect,
    joins,
    available: multiProfileReady || hasScalarProfile || lmsProfileReady,
  };
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

export async function qualificationEvidenceSupportsMultipleProfiles(
  db: D1Database,
): Promise<boolean> {
  return tableExists(db, QUALIFICATION_EVIDENCE_PROFILES_TABLE);
}

export async function readQualificationEvidenceProfiles(
  db: D1Database,
  params: { empresaId: number; historicoId: number; funcionarioId: number },
): Promise<string[]> {
  if (await qualificationEvidenceSupportsMultipleProfiles(db)) {
    const { results } = await db
      .prepare(
        `SELECT qhp.perfil_competencia
           FROM qualificacoes_historico_perfis_competencia qhp
           JOIN qualificacoes_historico qh
             ON qh.id=qhp.historico_id
            AND qh.empresa_id=qhp.empresa_id
            AND qh.deleted_at IS NULL
          WHERE qhp.empresa_id=? AND qhp.historico_id=? AND qh.funcionario_id=?
            AND qhp.deleted_at IS NULL
          ORDER BY qhp.id ASC`,
      )
      .bind(params.empresaId, params.historicoId, params.funcionarioId)
      .all<{ perfil_competencia: string }>();
    const profiles = [
      ...new Set(
        (results || [])
          .map((row) => normalizeTrainingComplianceEvidenceProfile(row.perfil_competencia))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (profiles.length > 0) return profiles;
  }
  if (!(await columnExists(db, 'qualificacoes_historico', 'perfil_competencia'))) return [];
  const row = await db
    .prepare(
      `SELECT perfil_competencia FROM qualificacoes_historico
        WHERE id=? AND empresa_id=? AND funcionario_id=? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(params.historicoId, params.empresaId, params.funcionarioId)
    .first<{ perfil_competencia: string | null }>();
  const profile = normalizeTrainingComplianceEvidenceProfile(row?.perfil_competencia);
  return profile ? [profile] : [];
}

export async function readQualificationEvidenceProfile(
  db: D1Database,
  params: { empresaId: number; historicoId: number; funcionarioId: number },
): Promise<string | null> {
  return (await readQualificationEvidenceProfiles(db, params))[0] || null;
}

export async function replaceQualificationEvidenceProfiles(
  db: D1Database,
  params: { empresaId: number; historicoId: number; funcionarioId: number; profiles: unknown[] },
): Promise<string[]> {
  const profiles = [
    ...new Set(
      params.profiles
        .map(normalizeTrainingComplianceEvidenceProfile)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (!(await columnExists(db, 'qualificacoes_historico', 'perfil_competencia'))) return [];
  const multiProfile = await qualificationEvidenceSupportsMultipleProfiles(db);
  if (profiles.length > 1 && !multiProfile) {
    throw new Error('EVIDENCE_MULTI_PROFILE_SCHEMA_REQUIRED');
  }
  const primaryProfile = profiles[0] || null;
  const scalarUpdate = db
    .prepare(
      `UPDATE qualificacoes_historico
          SET perfil_competencia=?, updated_at=datetime('now')
        WHERE id=? AND empresa_id=? AND funcionario_id=? AND deleted_at IS NULL`,
    )
    .bind(primaryProfile, params.historicoId, params.empresaId, params.funcionarioId);
  if (!multiProfile) {
    const update = await scalarUpdate.run();
    return Number(update.meta.changes || 0) === 1 ? profiles : [];
  }

  const statements = [
    scalarUpdate,
    db
      .prepare(
        `UPDATE qualificacoes_historico_perfis_competencia
            SET deleted_at=datetime('now'), updated_at=datetime('now')
          WHERE empresa_id=? AND historico_id=? AND deleted_at IS NULL`,
      )
      .bind(params.empresaId, params.historicoId),
    ...profiles.map((profile) =>
      db
        .prepare(
          `INSERT INTO qualificacoes_historico_perfis_competencia
             (empresa_id,historico_id,perfil_competencia,created_at,updated_at)
           VALUES (?,?,?,datetime('now'),datetime('now'))`,
        )
        .bind(params.empresaId, params.historicoId, profile),
    ),
  ];
  const [update] = await db.batch(statements);
  return Number(update?.meta.changes || 0) === 1 ? profiles : [];
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
