import { D1_MAX_LIST_BINDS, chunkByBindBudget, collectByBindChunks } from '../utils/d1-bind-chunks';

export type ParticipanteRow = {
  id: number;
  treinamento_id: number;
  funcionario_id: number;
  funcionario_nome: string | null;
  funcionario_guerra: string | null;
  funcionario_matricula: string | null;
  funcionario_email: string | null;
  funcionario_setor: string | null;
  funcionario_funcao: string | null;
  confirmado: number | null;
  presente: number | null;
  aprovado: number | null;
  nota: number | null;
  observacoes: string | null;
  qualificacao_historico_id: number | null;
  qualificacao_historico_status: string | null;
  status_participacao: string | null;
  resultado: string | null;
  conceito: string | null;
  data_conclusao_efetiva: string | null;
  concluido_em: string | null;
};

export type DiaRow = {
  id: number;
  treinamento_id: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  local: string | null;
  instrutor_id: number | null;
  instrutor_nome: string | null;
  simulador_id: number | null;
  aeronave_id: number | null;
  sessao_id: number | null;
  status: string;
  observacoes: string | null;
  presencas?: Array<{
    participante_id: number;
    funcionario_id: number;
    status: string;
    minutos_presentes: number | null;
    observacoes: string | null;
  }>;
};

export type InstrutorRow = {
  treinamento_id: number;
  funcionario_id: number;
  nome: string | null;
  guerra: string | null;
  papel: string;
  principal: number;
};

export async function loadParticipantesByTreinamento(
  db: D1Database,
  empresaId: number,
  treinamentoIds: number[],
  scopedSetorIds: number[] | null,
): Promise<Map<number, ParticipanteRow[]>> {
  const map = new Map<number, ParticipanteRow[]>();
  if (treinamentoIds.length === 0 || scopedSetorIds?.length === 0) return map;

  const setorChunks: Array<readonly number[] | null> =
    scopedSetorIds === null ? [null] : chunkByBindBudget(scopedSetorIds, 1 + D1_MAX_LIST_BINDS);

  for (const setorChunk of setorChunks) {
    const rows = await collectByBindChunks(
      treinamentoIds,
      1 + (setorChunk?.length || 0),
      async (treinamentoChunk) => {
        const placeholders = treinamentoChunk.map(() => '?').join(', ');
        const setorClause = setorChunk
          ? `AND f.setor_id IN (${setorChunk.map(() => '?').join(', ')})`
          : '';
        const query = `SELECT tp.id,
                              tp.treinamento_id,
                              tp.funcionario_id,
                              f.nome AS funcionario_nome,
                              f.guerra AS funcionario_guerra,
                              f.matricula AS funcionario_matricula,
                              f.email AS funcionario_email,
                              f.setor AS funcionario_setor,
                              f.funcao AS funcionario_funcao,
                              tp.confirmado,
                              tp.presente,
                              tp.aprovado,
                              tp.nota,
                              tp.observacoes,
                              tp.qualificacao_historico_id,
                              qh.status AS qualificacao_historico_status,
                              tp.status_participacao,
                              tp.resultado,
                              tp.conceito,
                              tp.data_conclusao_efetiva,
                              tp.concluido_em
                         FROM treinamentos_participantes tp
                         INNER JOIN treinamentos_planejados t ON t.id = tp.treinamento_id AND t.deleted_at IS NULL
                         LEFT JOIN funcionarios f ON f.id = tp.funcionario_id AND f.deleted_at IS NULL
                         LEFT JOIN qualificacoes_historico qh
                           ON qh.id = tp.qualificacao_historico_id
                          AND qh.empresa_id = t.empresa_id
                          AND qh.deleted_at IS NULL
                        WHERE t.empresa_id = ?
                          AND tp.treinamento_id IN (${placeholders})
                          ${setorClause}
                        ORDER BY COALESCE(f.nome, ''), tp.funcionario_id`;
        const result = await db
          .prepare(query)
          .bind(empresaId, ...treinamentoChunk, ...(setorChunk || []))
          .all<ParticipanteRow>();
        return result.results || [];
      },
    );

    for (const row of rows) {
      const treinamentoId = Number(row.treinamento_id);
      const current = map.get(treinamentoId) || [];
      current.push(row);
      map.set(treinamentoId, current);
    }
  }

  for (const participantes of map.values()) {
    participantes.sort((left, right) => {
      const byName = String(left.funcionario_nome || '').localeCompare(
        String(right.funcionario_nome || ''),
      );
      return byName || Number(left.funcionario_id) - Number(right.funcionario_id);
    });
  }

  return map;
}

export async function loadDiasByTreinamento(
  db: D1Database,
  empresaId: number,
  treinamentoIds: number[],
): Promise<Map<number, DiaRow[]>> {
  const map = new Map<number, DiaRow[]>();
  if (treinamentoIds.length === 0) return map;

  const rows = await collectByBindChunks(treinamentoIds, 2, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT td.id, td.treinamento_id, td.data, td.hora_inicio, td.hora_fim, td.local,
                td.instrutor_id, f.nome AS instrutor_nome, td.simulador_id, td.aeronave_id,
                td.sessao_id, td.status, td.observacoes
           FROM treinamentos_dias td
           INNER JOIN treinamentos_planejados t
             ON t.id = td.treinamento_id AND t.empresa_id = ? AND t.deleted_at IS NULL
           LEFT JOIN funcionarios f ON f.id = td.instrutor_id AND f.deleted_at IS NULL
          WHERE td.empresa_id = ? AND td.treinamento_id IN (${placeholders})
            AND td.deleted_at IS NULL
          ORDER BY td.data, td.hora_inicio, td.id`,
      )
      .bind(empresaId, empresaId, ...chunk)
      .all<DiaRow>();
    return result.results || [];
  });
  for (const row of rows) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }

  const fallbackRows = await collectByBindChunks(treinamentoIds, 1, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT t.id * -1 AS id, t.id AS treinamento_id,
                COALESCE(t.data_prevista, t.data_inicio, t.data_fim) AS data,
                COALESCE(t.hora_inicio, '08:00') AS hora_inicio,
                COALESCE(t.hora_fim, '17:00') AS hora_fim,
                t.local,
                t.instrutor_id,
                f.nome AS instrutor_nome,
                t.simulador_id,
                t.aeronave_id,
                t.sessao_id,
                CASE
                  WHEN UPPER(COALESCE(t.status, 'PLANEJADO')) = 'CANCELADO' THEN 'CANCELADO'
                  ELSE 'ATIVO'
                END AS status,
                t.observacoes
           FROM treinamentos_planejados t
           LEFT JOIN funcionarios f ON f.id = t.instrutor_id AND f.deleted_at IS NULL
          WHERE t.empresa_id = ? AND t.id IN (${placeholders})
            AND t.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
                FROM treinamentos_dias td
               WHERE td.treinamento_id = t.id
                 AND td.empresa_id = t.empresa_id
                 AND td.deleted_at IS NULL
            )
          ORDER BY data, hora_inicio, treinamento_id`,
      )
      .bind(empresaId, ...chunk)
      .all<DiaRow>();
    return result.results || [];
  });
  for (const row of fallbackRows) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }

  const presencas = await collectByBindChunks(treinamentoIds, 2, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT td.treinamento_id, pr.treinamento_dia_id, pr.participante_id,
                tp.funcionario_id, pr.status, pr.minutos_presentes, pr.observacoes
           FROM treinamentos_presencas pr
           INNER JOIN treinamentos_dias td
             ON td.id = pr.treinamento_dia_id AND td.empresa_id = ? AND td.deleted_at IS NULL
           INNER JOIN treinamentos_participantes tp
             ON tp.id = pr.participante_id AND tp.treinamento_id = td.treinamento_id
          WHERE pr.empresa_id = ? AND td.treinamento_id IN (${placeholders})`,
      )
      .bind(empresaId, empresaId, ...chunk)
      .all<{
        treinamento_id: number;
        treinamento_dia_id: number;
        participante_id: number;
        funcionario_id: number;
        status: string;
        minutos_presentes: number | null;
        observacoes: string | null;
      }>();
    return result.results || [];
  });
  const presencasByDia = new Map<number, NonNullable<DiaRow['presencas']>>();
  for (const row of presencas) {
    const current = presencasByDia.get(Number(row.treinamento_dia_id)) || [];
    current.push({
      participante_id: Number(row.participante_id),
      funcionario_id: Number(row.funcionario_id),
      status: row.status,
      minutos_presentes: row.minutos_presentes === null ? null : Number(row.minutos_presentes),
      observacoes: row.observacoes,
    });
    presencasByDia.set(Number(row.treinamento_dia_id), current);
  }
  for (const days of map.values()) {
    for (const day of days) {
      day.presencas = presencasByDia.get(Number(day.id)) || [];
    }
  }
  return map;
}

export async function loadInstrutoresByTreinamento(
  db: D1Database,
  empresaId: number,
  treinamentoIds: number[],
): Promise<Map<number, InstrutorRow[]>> {
  const map = new Map<number, InstrutorRow[]>();
  if (treinamentoIds.length === 0) return map;

  const rows = await collectByBindChunks(treinamentoIds, 2, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT ti.treinamento_id, ti.funcionario_id, f.nome, f.guerra, ti.papel, ti.principal
           FROM treinamentos_instrutores ti
           INNER JOIN treinamentos_planejados t
             ON t.id = ti.treinamento_id AND t.empresa_id = ? AND t.deleted_at IS NULL
           LEFT JOIN funcionarios f ON f.id = ti.funcionario_id AND f.deleted_at IS NULL
          WHERE ti.empresa_id = ? AND ti.treinamento_id IN (${placeholders})
          ORDER BY ti.principal DESC, COALESCE(f.nome, ''), ti.funcionario_id`,
      )
      .bind(empresaId, empresaId, ...chunk)
      .all<InstrutorRow>();
    return result.results || [];
  });
  for (const row of rows) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }

  const fallbackRows = await collectByBindChunks(treinamentoIds, 1, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT t.id AS treinamento_id, t.instrutor_id AS funcionario_id, f.nome, f.guerra,
                'INSTRUTOR' AS papel, 1 AS principal
           FROM treinamentos_planejados t
           LEFT JOIN funcionarios f ON f.id = t.instrutor_id AND f.deleted_at IS NULL
          WHERE t.empresa_id = ? AND t.id IN (${placeholders})
            AND t.deleted_at IS NULL
            AND t.instrutor_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
                FROM treinamentos_instrutores ti
               WHERE ti.treinamento_id = t.id
                 AND ti.empresa_id = t.empresa_id
            )
          ORDER BY COALESCE(f.nome, ''), t.instrutor_id`,
      )
      .bind(empresaId, ...chunk)
      .all<InstrutorRow>();
    return result.results || [];
  });
  for (const row of fallbackRows) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }
  return map;
}
