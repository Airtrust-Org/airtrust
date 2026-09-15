export type TrainingProgramType = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

export type TrainingProgram = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  codigo: string;
  nome: string;
  tipo_treinamento: TrainingProgramType;
  carga_horaria: number | null;
  validade_meses: number | null;
  uso_unico: number;
  total_ciclos: number;
  ano_base: number | null;
  ciclo_ano_base: number | null;
  proximo_programa_id: number | null;
  ativo: number;
};

export type TrainingProgramModel = {
  id: number;
  programa_id: number;
  ciclo: number;
  modelo_sessao_id: number;
  codigo_canonico: string;
  ordem: number;
  nome: string;
  duracao_estimada: number | null;
  modelo_aeronave: string | null;
  tipo_sessao_codigo: string | null;
};

const PROGRAMS_TABLE = 'treinamento_programas';
const PROGRAM_MODELS_TABLE = 'treinamento_programa_modelos';

export async function trainingProgramTableExists(
  db: D1Database,
  tableName: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(tableName)
    .first<{ name: string }>();
  return row?.name === tableName;
}
export async function trainingProgramTablesAvailable(db: D1Database): Promise<boolean> {
  return (
    (await trainingProgramTableExists(db, PROGRAMS_TABLE)) &&
    (await trainingProgramTableExists(db, PROGRAM_MODELS_TABLE))
  );
}

function normalizeProgram(row: TrainingProgram): TrainingProgram {
  return {
    ...row,
    id: Number(row.id),
    empresa_id: Number(row.empresa_id),
    qualificacao_tipo_id: Number(row.qualificacao_tipo_id),
    carga_horaria: row.carga_horaria == null ? null : Number(row.carga_horaria),
    validade_meses: row.validade_meses == null ? null : Number(row.validade_meses),
    uso_unico: Number(row.uso_unico || 0),
    total_ciclos: Math.max(1, Number(row.total_ciclos || 1)),
    ano_base: row.ano_base == null ? null : Number(row.ano_base),
    ciclo_ano_base: row.ciclo_ano_base == null ? null : Number(row.ciclo_ano_base),
    proximo_programa_id: row.proximo_programa_id == null ? null : Number(row.proximo_programa_id),
    ativo: Number(row.ativo ?? 1),
  };
}

export async function listTrainingPrograms(params: {
  db: D1Database;
  empresaId: number;
  qualificationTypeId?: number;
  activeOnly?: boolean;
}): Promise<TrainingProgram[]> {
  if (!(await trainingProgramTableExists(params.db, PROGRAMS_TABLE))) return [];
  const filters = ['empresa_id = ?', 'deleted_at IS NULL'];
  const binds: unknown[] = [params.empresaId];
  if (params.qualificationTypeId) {
    filters.push('qualificacao_tipo_id = ?');
    binds.push(params.qualificationTypeId);
  }
  if (params.activeOnly !== false) filters.push('ativo = 1');
  const rows = await params.db
    .prepare(
      `SELECT id,empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,carga_horaria,validade_meses,uso_unico,total_ciclos,ano_base,ciclo_ano_base,proximo_programa_id,ativo FROM treinamento_programas WHERE ${filters.join(' AND ')} ORDER BY qualificacao_tipo_id, CASE tipo_treinamento WHEN 'INICIAL' THEN 1 WHEN 'RECORRENTE' THEN 2 WHEN 'SEMESTRAL' THEN 3 ELSE 9 END, id`,
    )
    .bind(...binds)
    .all<TrainingProgram>();
  return (rows.results || []).map(normalizeProgram);
}
export async function employeeHasCompletedQualification(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  qualificationTypeId: number;
}): Promise<boolean> {
  const row = await params.db
    .prepare(
      `SELECT id FROM qualificacoes_historico
        WHERE empresa_id=? AND funcionario_id=? AND qualificacao_id=?
          AND deleted_at IS NULL
          AND data_conclusao IS NOT NULL
          AND date(data_conclusao) <= date('now')
          AND (
            UPPER(TRIM(COALESCE(status,''))) IN ('CONCLUIDA','CONCLUIDO','RENOVADA','VALIDA','VÁLIDA','VENCIDA','PROXIMA_VENCIMENTO','VENCENDO','VENCENDO_30')
            OR TRIM(COALESCE(status,'')) = ''
          )
        ORDER BY date(data_conclusao) DESC,id DESC LIMIT 1`,
    )
    .bind(params.empresaId, params.employeeId, params.qualificationTypeId)
    .first<{ id: number }>();
  return Boolean(row?.id);
}

export async function selectTrainingProgram(params: {
  db: D1Database;
  empresaId: number;
  qualificationTypeId: number;
  employeeId?: number | null;
  requestedProgramId?: number | null;
  requestedType?: TrainingProgramType | null;
}): Promise<TrainingProgram | null> {
  const programs = await listTrainingPrograms({
    db: params.db,
    empresaId: params.empresaId,
    qualificationTypeId: params.qualificationTypeId,
  });
  if (!programs.length) return null;
  if (params.requestedProgramId) {
    return programs.find((program) => program.id === Number(params.requestedProgramId)) || null;
  }
  if (params.requestedType) {
    return programs.find((program) => program.tipo_treinamento === params.requestedType) || null;
  }
  if (params.employeeId) {
    const completed = await employeeHasCompletedQualification({
      db: params.db,
      empresaId: params.empresaId,
      employeeId: Number(params.employeeId),
      qualificationTypeId: params.qualificationTypeId,
    });
    const preferred = completed ? 'RECORRENTE' : 'INICIAL';
    const matched = programs.find((program) => program.tipo_treinamento === preferred);
    if (matched) return matched;
  }
  return (
    programs.find((program) => program.tipo_treinamento === 'RECORRENTE') ||
    programs.find((program) => program.tipo_treinamento === 'SEMESTRAL') ||
    programs.find((program) => program.tipo_treinamento === 'INICIAL') ||
    programs[0]
  );
}

export async function loadTrainingProgramByModel(params: {
  db: D1Database;
  empresaId: number;
  modelSessionId: number;
}): Promise<TrainingProgram | null> {
  if (!(await trainingProgramTablesAvailable(params.db))) return null;
  const row = await params.db
    .prepare(
      `SELECT p.id,p.empresa_id,p.qualificacao_tipo_id,p.codigo,p.nome,p.tipo_treinamento,
              p.carga_horaria,p.validade_meses,p.uso_unico,p.total_ciclos,p.ano_base,
              p.ciclo_ano_base,p.proximo_programa_id,p.ativo
         FROM treinamento_programa_modelos pm
         JOIN treinamento_programas p
           ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
          AND p.deleted_at IS NULL AND p.ativo=1
         JOIN modelos_sessao_versionamento msv
           ON msv.empresa_id=pm.empresa_id
          AND msv.codigo_canonico=pm.codigo_canonico
          AND msv.is_current=1
        WHERE pm.empresa_id=? AND msv.modelo_id=? AND pm.deleted_at IS NULL
        ORDER BY CASE p.tipo_treinamento
          WHEN 'INICIAL' THEN 1 WHEN 'RECORRENTE' THEN 2 WHEN 'SEMESTRAL' THEN 3 ELSE 9 END,
          p.id LIMIT 1`,
    )
    .bind(params.empresaId, params.modelSessionId)
    .first<TrainingProgram>();
  return row ? normalizeProgram(row) : null;
}
export async function loadTrainingProgramModels(params: {
  db: D1Database;
  empresaId: number;
  programId: number;
  cycle: number;
}): Promise<TrainingProgramModel[]> {
  if (!(await trainingProgramTablesAvailable(params.db))) return [];
  const rows = await params.db
    .prepare(
      `SELECT pm.id,pm.programa_id,pm.ciclo,msv.modelo_id AS modelo_sessao_id,pm.codigo_canonico,pm.ordem,ms.nome,ms.duracao_estimada,ms.modelo_aeronave,ts.codigo AS tipo_sessao_codigo FROM treinamento_programa_modelos pm JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1 JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=pm.empresa_id AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1 LEFT JOIN tipos_sessao ts ON ts.id=ms.tipo_sessao_id AND ts.empresa_id=ms.empresa_id AND ts.deleted_at IS NULL WHERE pm.empresa_id=? AND pm.programa_id=? AND pm.ciclo=? AND pm.deleted_at IS NULL ORDER BY pm.ordem,ms.id`,
    )
    .bind(params.empresaId, params.programId, params.cycle)
    .all<TrainingProgramModel>();
  return (rows.results || []).map((row) => ({
    ...row,
    id: Number(row.id),
    programa_id: Number(row.programa_id),
    ciclo: Number(row.ciclo),
    modelo_sessao_id: Number(row.modelo_sessao_id),
    ordem: Number(row.ordem),
    duracao_estimada: row.duracao_estimada == null ? null : Number(row.duracao_estimada),
  }));
}

export async function countTrainingProgramModelRows(params: {
  db: D1Database;
  empresaId: number;
  programId: number;
  cycle: number;
}): Promise<number> {
  if (!(await trainingProgramTableExists(params.db, PROGRAM_MODELS_TABLE))) return 0;
  const row = await params.db
    .prepare(
      `SELECT COUNT(*) AS total FROM treinamento_programa_modelos WHERE empresa_id=? AND programa_id=? AND ciclo=? AND deleted_at IS NULL`,
    )
    .bind(params.empresaId, params.programId, params.cycle)
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

export async function resolveProgramForHistoryType(params: {
  db: D1Database;
  empresaId: number;
  qualificationTypeId: number;
  trainingType: string | null | undefined;
}): Promise<TrainingProgram | null> {
  const normalized = String(params.trainingType || '')
    .trim()
    .toUpperCase();
  const mapped: TrainingProgramType | null =
    normalized === 'PERIODICO' || normalized === 'PERIÓDICO'
      ? 'RECORRENTE'
      : ['INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO'].includes(normalized)
        ? (normalized as TrainingProgramType)
        : null;
  if (!mapped) return null;
  return selectTrainingProgram({
    db: params.db,
    empresaId: params.empresaId,
    qualificationTypeId: params.qualificationTypeId,
    requestedType: mapped,
  });
}
