import { ApiError } from '../../middleware/error-handler';

export type EligibleFlightCrewMember = {
  id: number;
  nome: string;
  nome_guerra: string;
  matricula: string | null;
  funcao_codigo: 'PIC' | 'SIC';
  funcao_nome: string;
};

function normalizeModel(value: string | null | undefined): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  if (normalized.includes('AW139')) return 'AW139';
  if (normalized.includes('SK76') || normalized.includes('S76')) return 'SK76';
  return normalized;
}

function modelAliases(value: string | null | undefined): string[] {
  const normalized = normalizeModel(value);
  if (!normalized) return [];
  return normalized === 'SK76' ? ['SK76', 'S76'] : [normalized];
}

const sqlNormalizedModel = (expression: string) =>
  `UPPER(REPLACE(REPLACE(TRIM(COALESCE(${expression}, '')), ' ', ''), '-', ''))`;
const roleCodeSql = `CASE
  WHEN UPPER(COALESCE(fn.codigo, '')) = 'PIC'
    OR UPPER(COALESCE(f.funcao, '')) IN ('PIC', 'COMANDANTE')
    OR UPPER(COALESCE(f.cargo, '')) IN ('PIC', 'COMANDANTE') THEN 'PIC'
  WHEN UPPER(COALESCE(fn.codigo, '')) = 'SIC'
    OR UPPER(COALESCE(f.funcao, '')) IN ('SIC', 'COPILOTO', '1º OFICIAL', '1° OFICIAL', '1O OFICIAL', 'PRIMEIRO OFICIAL')
    OR UPPER(COALESCE(f.cargo, '')) IN ('SIC', 'COPILOTO', '1º OFICIAL', '1° OFICIAL', '1O OFICIAL', 'PRIMEIRO OFICIAL') THEN 'SIC'
  ELSE NULL END`;

export async function listEligibleFlightCrew(
  db: D1Database,
  empresaId: number,
  aeronaveId: number,
): Promise<EligibleFlightCrewMember[]> {
  const aircraft = await db
    .prepare(
      `SELECT id, modelo FROM aeronaves
      WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) IN ('ATIVO', 'ATIVA')
      LIMIT 1`,
    )
    .bind(aeronaveId, empresaId)
    .first<{ id: number; modelo: string | null }>();

  if (!aircraft) {
    throw new ApiError('Aeronave invalida para a empresa', 400, 'CONTROLE_VOOS_INVALID_CATALOG');
  }
  const aliases = modelAliases(aircraft.modelo);
  if (aliases.length === 0) {
    throw new ApiError(
      'Modelo da aeronave nao identificado',
      409,
      'CONTROLE_VOOS_CREW_AIRCRAFT_MODEL_UNKNOWN',
    );
  }

  const funcionarioColumns = await db
    .prepare('PRAGMA table_info(funcionarios)')
    .all<{ name: string }>();
  const hasNomeGuerra = (funcionarioColumns.results || []).some((column) => column.name === 'guerra');
  const nomeGuerraSql = hasNomeGuerra
    ? `COALESCE(NULLIF(TRIM(f.guerra), ''), f.nome)`
    : 'f.nome';

  const placeholders = aliases.map(() => '?').join(', ');
  const physicalModel = sqlNormalizedModel('af.modelo');
  const catalogModel = sqlNormalizedModel('COALESCE(ma.codigo, ma.modelo, ma.nome)');
  const legacyModel = sqlNormalizedModel('f.aeronave');

  const rows = await db
    .prepare(
      `SELECT DISTINCT f.id, f.nome, ${nomeGuerraSql} AS nome_guerra, f.matricula,
            ${roleCodeSql} AS funcao_codigo,
            COALESCE(NULLIF(TRIM(fn.nome), ''), NULLIF(TRIM(f.funcao), ''), NULLIF(TRIM(f.cargo), '')) AS funcao_nome
       FROM funcionarios f
       LEFT JOIN funcoes fn
         ON fn.id = f.funcao_id AND fn.empresa_id = f.empresa_id
        AND fn.deleted_at IS NULL AND COALESCE(fn.ativo, 1) = 1
      WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
        AND ${roleCodeSql} IN ('PIC', 'SIC')
        AND (
          EXISTS (
            SELECT 1 FROM funcionarios_aeronaves fa
            JOIN aeronaves af
              ON af.id = fa.aeronave_id AND af.empresa_id = f.empresa_id AND af.deleted_at IS NULL
            WHERE fa.funcionario_id = f.id AND fa.deleted_at IS NULL AND COALESCE(fa.ativo, 1) = 1
              AND (fa.data_fim IS NULL OR date(fa.data_fim) >= date('now'))
              AND ${physicalModel} IN (${placeholders})
          )
          OR EXISTS (
            SELECT 1 FROM modelos_aeronave ma
            WHERE ma.empresa_id = f.empresa_id AND ma.deleted_at IS NULL
              AND instr(
                ',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',',
                ',' || CAST(ma.id AS TEXT) || ','
              ) > 0
              AND ${catalogModel} IN (${placeholders})
          )
          OR ${legacyModel} IN (${placeholders})
        )
      ORDER BY CASE WHEN ${roleCodeSql} = 'PIC' THEN 0 ELSE 1 END, f.nome`,
    )
    .bind(empresaId, ...aliases, ...aliases, ...aliases)
    .all<EligibleFlightCrewMember>();

  return (rows.results || []).map((row) => ({
    id: Number(row.id),
    nome: String(row.nome || '').trim(),
    nome_guerra: String(row.nome_guerra || row.nome || '').trim(),
    matricula: row.matricula ? String(row.matricula) : null,
    funcao_codigo: row.funcao_codigo,
    funcao_nome: String(
      row.funcao_nome || (row.funcao_codigo === 'PIC' ? 'Comandante' : 'Copiloto'),
    ),
  }));
}

export async function assertFlightCrewAssignment(
  db: D1Database,
  empresaId: number,
  aeronaveId: number,
  picFuncionarioId: number,
  sicFuncionarioId: number,
): Promise<void> {
  if (picFuncionarioId === sicFuncionarioId) {
    throw new ApiError(
      'PIC e SIC devem ser tripulantes diferentes',
      400,
      'CONTROLE_VOOS_CREW_DUPLICATE',
    );
  }
  const eligible = await listEligibleFlightCrew(db, empresaId, aeronaveId);
  const pic = eligible.find((member) => member.id === picFuncionarioId);
  const sic = eligible.find((member) => member.id === sicFuncionarioId);
  if (!pic || pic.funcao_codigo !== 'PIC') {
    throw new ApiError(
      'PIC deve ser um comandante habilitado na aeronave',
      400,
      'CONTROLE_VOOS_CREW_PIC_INELIGIBLE',
    );
  }
  if (!sic || !['PIC', 'SIC'].includes(sic.funcao_codigo)) {
    throw new ApiError(
      'SIC deve ser comandante ou copiloto habilitado na aeronave',
      400,
      'CONTROLE_VOOS_CREW_SIC_INELIGIBLE',
    );
  }
}
