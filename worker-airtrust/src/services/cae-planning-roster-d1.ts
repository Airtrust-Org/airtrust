import {
  resolveRosterDayFromPublishedAllocations,
  type PublishedRosterAllocationRow,
  type ResolvedRosterDay,
} from './cae-planning-roster-state';

export type D1LikeStatement = {
  bind: (...values: unknown[]) => D1LikeStatement;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
};

export type D1LikeDatabase = {
  prepare: (sql: string) => D1LikeStatement;
};

/**
 * Lê a situação de escala na data diretamente das alocações da escala mensal PUBLICADA.
 *
 * Regras de segurança:
 * - tenant obrigatório em escalas_mensais.empresa_id;
 * - nunca lê funcionarios.quinzena;
 * - nunca persiste quinzena no planejamento como fonte operacional;
 * - mudanças posteriores na escala aparecem na próxima leitura/revalidação.
 */
export async function resolvePublishedRosterDayFromD1(params: {
  db: D1LikeDatabase;
  empresaId: number;
  employeeId: number;
  date: string;
}): Promise<ResolvedRosterDay> {
  const result = await params.db
    .prepare(
      `SELECT
         CAST(ea.id AS TEXT) AS allocation_id,
         CAST(ea.funcionario_id AS INTEGER) AS employee_id,
         ea.data_inicio AS date_start,
         ea.data_fim AS date_end,
         ea.aeronave_id AS aircraft_id,
         ea.funcao AS function_code,
         ea.situacao_tipo AS situation_type,
         est.bloqueia_alocacao AS situation_blocks_allocation,
         ea.quinzena_id AS fortnight_id,
         eq.numero AS fortnight_number,
         CAST(em.id AS TEXT) AS monthly_roster_id,
         em.status AS monthly_roster_status,
         COALESCE(CAST(ea.updated_at AS TEXT), CAST(em.updated_at AS TEXT)) AS source_revision
       FROM escala_alocacoes ea
       JOIN escalas_mensais em
         ON em.id = ea.escala_id
        AND em.empresa_id = ?
        AND em.deleted_at IS NULL
       LEFT JOIN escalas_quinzenas eq
         ON eq.id = ea.quinzena_id
        AND eq.deleted_at IS NULL
       LEFT JOIN escala_situacao_tipos est
         ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
        AND est.deleted_at IS NULL
       WHERE CAST(ea.funcionario_id AS INTEGER) = ?
         AND ea.deleted_at IS NULL
         AND COALESCE(LOWER(ea.status), '') != 'cancelado'
         AND LOWER(COALESCE(em.status, '')) = 'publicada'
         AND ea.data_inicio <= ?
         AND ea.data_fim >= ?
       ORDER BY ea.data_inicio, ea.data_fim, ea.id`,
    )
    .bind(params.empresaId, params.employeeId, params.date, params.date)
    .all<PublishedRosterAllocationRow>();

  return resolveRosterDayFromPublishedAllocations({
    employee_id: params.employeeId,
    date: params.date,
    allocations: result.results || [],
  });
}
