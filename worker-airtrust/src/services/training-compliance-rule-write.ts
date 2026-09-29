export type TrainingComplianceRequirementWrite = {
  qualificacao_tipo_id: number;
  escopo: string;
  setor_id: number | null;
  funcao_id: number | null;
  funcionario_id: number | null;
  aeronave_modelo: string | null;
  condicao_id: number | null;
  justificativa: string | null;
  perfil_competencia: string | null;
  modalidade_requerida: string | null;
  fundamento_tipo: string | null;
  fundamento_documento: string | null;
  fundamento_item: string | null;
  validade_fonte: 'MODELO' | 'EVIDENCIA';
  obrigatoriedade: string;
  critico_operacional: number;
  origem: string;
  referencia_normativa: string | null;
  observacoes: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  prazo_inicial_dias: number | null;
  auto_matricular_ead: number;
};

async function columns(db: D1Database) {
  const { results } = await db
    .prepare("PRAGMA table_info('treinamento_requisitos')")
    .all<{ name: string }>();
  return new Set((results || []).map((row) => row.name));
}

function entries(data: TrainingComplianceRequirementWrite, cols: Set<string>) {
  const values: Array<[string, unknown]> = [
    ['qualificacao_tipo_id', data.qualificacao_tipo_id],
    ['escopo', data.escopo],
    ['setor_id', data.setor_id],
    ['funcao_id', data.funcao_id],
    ['funcionario_id', data.funcionario_id],
    ['obrigatoriedade', data.obrigatoriedade],
    ['critico_operacional', data.critico_operacional],
    ['origem', data.origem],
    ['referencia_normativa', data.referencia_normativa],
    ['observacoes', data.observacoes],
    ['vigencia_inicio', data.vigencia_inicio],
    ['vigencia_fim', data.vigencia_fim],
    ['prazo_inicial_dias', data.prazo_inicial_dias],
    ['auto_matricular_ead', data.auto_matricular_ead],
  ];
  if (cols.has('aeronave_modelo')) values.push(['aeronave_modelo', data.aeronave_modelo]);
  if (cols.has('condicao_id')) values.push(['condicao_id', data.condicao_id]);
  if (cols.has('justificativa')) values.push(['justificativa', data.justificativa]);
  if (cols.has('perfil_competencia')) values.push(['perfil_competencia', data.perfil_competencia]);
  if (cols.has('modalidade_requerida'))
    values.push(['modalidade_requerida', data.modalidade_requerida]);
  if (cols.has('fundamento_tipo')) values.push(['fundamento_tipo', data.fundamento_tipo]);
  if (cols.has('fundamento_documento'))
    values.push(['fundamento_documento', data.fundamento_documento]);
  if (cols.has('fundamento_item')) values.push(['fundamento_item', data.fundamento_item]);
  if (cols.has('validade_fonte')) values.push(['validade_fonte', data.validade_fonte]);
  return values;
}

export async function insertTrainingComplianceRequirement(
  db: D1Database,
  empresaId: number,
  data: TrainingComplianceRequirementWrite,
) {
  const cols = await columns(db);
  const pairs = entries(data, cols);
  const names = ['empresa_id', ...pairs.map(([k]) => k)];
  return db
    .prepare(
      `INSERT INTO treinamento_requisitos (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
    )
    .bind(empresaId, ...pairs.map(([, v]) => v))
    .run();
}

export async function updateTrainingComplianceRequirement(
  db: D1Database,
  empresaId: number,
  id: number,
  data: TrainingComplianceRequirementWrite,
) {
  const cols = await columns(db);
  const pairs = entries(data, cols);
  return db
    .prepare(
      `UPDATE treinamento_requisitos SET ${pairs.map(([k]) => `${k}=?`).join(',')},updated_at=datetime('now') WHERE id=? AND empresa_id=?`,
    )
    .bind(...pairs.map(([, v]) => v), id, empresaId)
    .run();
}
