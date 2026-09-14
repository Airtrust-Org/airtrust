import {
  countTrainingProgramModelRows,
  loadTrainingProgramModels,
  selectTrainingProgram,
  trainingProgramTablesAvailable,
  type TrainingProgram,
  type TrainingProgramType,
} from './training-programs';

export type SimulatorCurriculumCycleConfig = {
  qualification_type_id: number;
  total_cycles: number;
  base_year: number;
  base_cycle: number;
};

export type ResolvedSimulatorCurriculumModel = {
  id: number;
  qualificacao_tipo_id: number;
  codigo: string;
  codigo_canonico: string;
  nome: string;
  duracao_estimada: number | null;
  ordem_no_treinamento: number;
  modelo_aeronave: string | null;
  tipo_sessao_codigo: string | null;
};

export type ResolvedSimulatorCurriculum = {
  managed: true;
  reference_year: number;
  cycle: number;
  config: SimulatorCurriculumCycleConfig;
  models: ResolvedSimulatorCurriculumModel[];
  unresolved_items: number;
  program: TrainingProgram | null;
  program_id: number | null;
  program_type: TrainingProgramType | null;
};
const CONFIG_TABLE = 'simuladores_curriculos_voo_config';
const ITEMS_TABLE = 'simuladores_curriculos_voo_itens';

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first<{ name: string }>();
  return row?.name === tableName;
}

export function resolveAnnualCurriculumCycle(params: {
  referenceYear: number;
  baseYear: number;
  baseCycle: number;
  totalCycles: number;
}): number {
  const totalCycles = Math.max(1, Math.trunc(params.totalCycles));
  const baseCycle = Math.min(totalCycles, Math.max(1, Math.trunc(params.baseCycle)));
  const offset =
    (((Math.trunc(params.referenceYear) - Math.trunc(params.baseYear)) % totalCycles) +
      totalCycles) %
    totalCycles;
  return ((baseCycle - 1 + offset) % totalCycles) + 1;
}

export function curriculumReferenceYear(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1900 && value <= 9999 ? value : null;
  }
  const match = /^(\d{4})/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) && year >= 1900 && year <= 9999 ? year : null;
}
function cycleConfigFromProgram(program: TrainingProgram): SimulatorCurriculumCycleConfig {
  return {
    qualification_type_id: program.qualificacao_tipo_id,
    total_cycles: Math.max(1, program.total_ciclos),
    base_year: program.ano_base ?? new Date().getUTCFullYear(),
    base_cycle: program.ciclo_ano_base ?? 1,
  };
}

export async function loadSimulatorCurriculumCycleConfig(params: {
  db: D1Database;
  empresaId: number;
  qualificationTypeId: number;
  employeeId?: number | null;
  requestedProgramId?: number | null;
  requestedType?: TrainingProgramType | null;
}): Promise<SimulatorCurriculumCycleConfig | null> {
  if (await trainingProgramTablesAvailable(params.db)) {
    const program = await selectTrainingProgram({
      db: params.db,
      empresaId: params.empresaId,
      qualificationTypeId: params.qualificationTypeId,
      employeeId: params.employeeId,
      requestedProgramId: params.requestedProgramId,
      requestedType: params.requestedType,
    });
    if (program) return cycleConfigFromProgram(program);
  }
  if (!(await tableExists(params.db, CONFIG_TABLE))) return null;
  const row = await params.db
    .prepare(
      `SELECT qualificacao_tipo_id AS qualification_type_id,total_ciclos AS total_cycles,ano_base AS base_year,ciclo_ano_base AS base_cycle FROM simuladores_curriculos_voo_config WHERE empresa_id=? AND qualificacao_tipo_id=? AND ativo=1 AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(params.empresaId, params.qualificationTypeId)
    .first<SimulatorCurriculumCycleConfig>();
  if (!row) return null;
  return {
    qualification_type_id: Number(row.qualification_type_id),
    total_cycles: Number(row.total_cycles),
    base_year: Number(row.base_year),
    base_cycle: Number(row.base_cycle),
  };
}
export async function loadSimulatorCycleManagedQualificationIds(
  db: D1Database,
  empresaId: number,
): Promise<number[]> {
  if (await trainingProgramTablesAvailable(db)) {
    const rows = await db
      .prepare(
        `SELECT DISTINCT p.qualificacao_tipo_id FROM treinamento_programas p JOIN treinamento_programa_modelos pm ON pm.programa_id=p.id AND pm.empresa_id=p.empresa_id AND pm.deleted_at IS NULL WHERE p.empresa_id=? AND p.ativo=1 AND p.deleted_at IS NULL ORDER BY p.qualificacao_tipo_id`,
      )
      .bind(empresaId)
      .all<{ qualificacao_tipo_id: number }>();
    return (rows.results || [])
      .map((row) => Number(row.qualificacao_tipo_id))
      .filter((id) => Number.isInteger(id) && id > 0);
  }
  if (!(await tableExists(db, CONFIG_TABLE))) return [];
  const rows = await db
    .prepare(
      `SELECT qualificacao_tipo_id FROM simuladores_curriculos_voo_config WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL ORDER BY qualificacao_tipo_id`,
    )
    .bind(empresaId)
    .all<{ qualificacao_tipo_id: number }>();
  return (rows.results || [])
    .map((row) => Number(row.qualificacao_tipo_id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function loadProgramResolvedCurriculum(params: {
  db: D1Database;
  empresaId: number;
  qualificationTypeId: number;
  referenceYear: number;
  employeeId?: number | null;
  requestedProgramId?: number | null;
  requestedType?: TrainingProgramType | null;
}): Promise<ResolvedSimulatorCurriculum | null> {
  if (!(await trainingProgramTablesAvailable(params.db))) return null;
  const program = await selectTrainingProgram({
    db: params.db,
    empresaId: params.empresaId,
    qualificationTypeId: params.qualificationTypeId,
    employeeId: params.employeeId,
    requestedProgramId: params.requestedProgramId,
    requestedType: params.requestedType,
  });
  if (!program) return null;
  const config = cycleConfigFromProgram(program);
  const cycle =
    config.total_cycles > 1
      ? resolveAnnualCurriculumCycle({
          referenceYear: params.referenceYear,
          baseYear: config.base_year,
          baseCycle: config.base_cycle,
          totalCycles: config.total_cycles,
        })
      : 1;
  const expected = await countTrainingProgramModelRows({
    db: params.db,
    empresaId: params.empresaId,
    programId: program.id,
    cycle,
  });
  const programModels = await loadTrainingProgramModels({
    db: params.db,
    empresaId: params.empresaId,
    programId: program.id,
    cycle,
  });
  const models: ResolvedSimulatorCurriculumModel[] = programModels.map((row) => ({
    id: row.modelo_sessao_id,
    qualificacao_tipo_id: program.qualificacao_tipo_id,
    codigo: row.codigo_canonico,
    codigo_canonico: row.codigo_canonico,
    nome: row.nome,
    duracao_estimada: row.duracao_estimada,
    ordem_no_treinamento: row.ordem,
    modelo_aeronave: row.modelo_aeronave,
    tipo_sessao_codigo: row.tipo_sessao_codigo,
  }));
  return {
    managed: true,
    reference_year: params.referenceYear,
    cycle,
    config,
    models,
    unresolved_items: Math.max(0, expected - models.length),
    program,
    program_id: program.id,
    program_type: program.tipo_treinamento,
  };
}

export async function loadResolvedSimulatorCurriculum(params: {
  db: D1Database;
  empresaId: number;
  qualificationTypeId: number;
  referenceYear: number;
  employeeId?: number | null;
  requestedProgramId?: number | null;
  requestedType?: TrainingProgramType | null;
}): Promise<ResolvedSimulatorCurriculum | null> {
  const programResolved = await loadProgramResolvedCurriculum(params);
  if (programResolved) return programResolved;
  const config = await loadSimulatorCurriculumCycleConfig(params);
  if (!config) return null;
  if (!(await tableExists(params.db, ITEMS_TABLE))) {
    const cycle = resolveAnnualCurriculumCycle({
      referenceYear: params.referenceYear,
      baseYear: config.base_year,
      baseCycle: config.base_cycle,
      totalCycles: config.total_cycles,
    });
    return {
      managed: true,
      reference_year: params.referenceYear,
      cycle,
      config,
      models: [],
      unresolved_items: 1,
      program: null,
      program_id: null,
      program_type: null,
    };
  }
  const cycle = resolveAnnualCurriculumCycle({
    referenceYear: params.referenceYear,
    baseYear: config.base_year,
    baseCycle: config.base_cycle,
    totalCycles: config.total_cycles,
  });
  const expectedRow = await params.db
    .prepare(
      `SELECT COUNT(*) AS total FROM simuladores_curriculos_voo_itens WHERE empresa_id=? AND qualificacao_tipo_id=? AND ciclo=? AND deleted_at IS NULL`,
    )
    .bind(params.empresaId, params.qualificationTypeId, cycle)
    .first<{ total: number }>();
  const expected = Number(expectedRow?.total || 0);
  const hasVersioning = await tableExists(params.db, 'modelos_sessao_versionamento');
  const sql = hasVersioning
    ? `SELECT ms.id,i.qualificacao_tipo_id,msv.codigo_canonico AS codigo,msv.codigo_canonico,ms.nome,ms.duracao_estimada,i.ordem AS ordem_no_treinamento,ms.modelo_aeronave,ts.codigo AS tipo_sessao_codigo
         FROM simuladores_curriculos_voo_itens i
         INNER JOIN modelos_sessao_versionamento msv ON msv.empresa_id=i.empresa_id AND msv.codigo_canonico=i.codigo_canonico AND msv.is_current=1
         INNER JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=i.empresa_id AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
         LEFT JOIN tipos_sessao ts ON ts.id=ms.tipo_sessao_id AND ts.empresa_id=ms.empresa_id AND ts.deleted_at IS NULL
        WHERE i.empresa_id=? AND i.qualificacao_tipo_id=? AND i.ciclo=? AND i.deleted_at IS NULL
        ORDER BY i.ordem,ms.id`
    : `SELECT ms.id,i.qualificacao_tipo_id,COALESCE(NULLIF(TRIM(i.codigo_canonico),''),ms.codigo) AS codigo,COALESCE(NULLIF(TRIM(i.codigo_canonico),''),ms.codigo) AS codigo_canonico,ms.nome,ms.duracao_estimada,i.ordem AS ordem_no_treinamento,ms.modelo_aeronave,ts.codigo AS tipo_sessao_codigo
         FROM simuladores_curriculos_voo_itens i
         INNER JOIN modelos_sessao ms ON ms.id=i.modelo_sessao_id AND ms.empresa_id=i.empresa_id AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
         LEFT JOIN tipos_sessao ts ON ts.id=ms.tipo_sessao_id AND ts.empresa_id=ms.empresa_id AND ts.deleted_at IS NULL
        WHERE i.empresa_id=? AND i.qualificacao_tipo_id=? AND i.ciclo=? AND i.deleted_at IS NULL
        ORDER BY i.ordem,ms.id`;
  const rows = await params.db
    .prepare(sql)
    .bind(params.empresaId, params.qualificationTypeId, cycle)
    .all<ResolvedSimulatorCurriculumModel>();
  const models = (rows.results || []).map((row) => ({
    ...row,
    id: Number(row.id),
    qualificacao_tipo_id: Number(row.qualificacao_tipo_id),
    ordem_no_treinamento: Number(row.ordem_no_treinamento),
    duracao_estimada: row.duracao_estimada == null ? null : Number(row.duracao_estimada),
  }));
  return {
    managed: true,
    reference_year: params.referenceYear,
    cycle,
    config,
    models,
    unresolved_items: Math.max(0, expected - models.length),
    program: null,
    program_id: null,
    program_type: null,
  };
}
