/**
 * SIMULADORES — acesso a dados da fase "participantes + fichas" do PUT /sessoes/:id.
 *
 * Só SQL: nenhuma regra de negócio aqui (ver services/simuladores/session-participants).
 */

export interface SessaoAtualRow {
  tipo_sessao?: string | null;
  instrutor_id?: number | string | null;
  data?: string | null;
  template_id?: number | string | null;
  simulador_id?: string | number | null;
}

export interface ParticipanteAtualRow {
  funcionario_id: number | string;
  funcao: string | null;
}

export interface FichaManobraInsert {
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  ordem: number;
  tripulante: string;
}

export async function findSessaoAtual(
  db: D1Database,
  sessaoId: string,
): Promise<SessaoAtualRow | null> {
  return db
    .prepare('SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL')
    .bind(sessaoId)
    .first<SessaoAtualRow>();
}

export async function listParticipantesAtivos(
  db: D1Database,
  sessaoId: string,
): Promise<ParticipanteAtualRow[]> {
  const rows = await db
    .prepare(
      'SELECT funcionario_id, funcao FROM sessoes_participantes WHERE sessao_id=? AND deleted_at IS NULL',
    )
    .bind(sessaoId)
    .all<ParticipanteAtualRow>();
  return rows.results || [];
}

/** Apaga (soft) as fichas vivas do aluno na sessão; o EXISTS garante que a sessão é do tenant. */
export async function softDeleteFichasDoAluno(
  db: D1Database,
  sessaoId: string,
  alunoId: number | string,
  empresaId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE fichas_sessao
          SET deleted_at=datetime('now')
        WHERE agendamento_slot_id=?
          AND colaborador_id_aluno=?
          AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1
              FROM simulador_agendamentos sa
             WHERE sa.id = fichas_sessao.agendamento_slot_id
               AND sa.empresa_id = ?
               AND sa.deleted_at IS NULL
          )`,
    )
    .bind(sessaoId, alunoId, empresaId)
    .run();
}

export async function softDeleteParticipantesDaSessao(
  db: D1Database,
  sessaoId: string,
  empresaId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessoes_participantes AS sp
          SET deleted_at=datetime('now')
        WHERE sp.sessao_id=?
          AND sp.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
              FROM simulador_agendamentos sa
             WHERE sa.id = sp.sessao_id
               AND sa.empresa_id = ?
               AND sa.deleted_at IS NULL
          )`,
    )
    .bind(sessaoId, empresaId)
    .run();
}

export async function insertParticipanteConfirmado(
  db: D1Database,
  input: { uuid: string; sessaoId: string; funcionarioId: string | number; funcao: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
           VALUES (?, ?, ?, ?, 'CONFIRMADO')`,
    )
    .bind(input.uuid, input.sessaoId, input.funcionarioId, input.funcao)
    .run();
}

export async function existeFichaViva(
  db: D1Database,
  sessaoId: string,
  alunoId: string | number,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT id FROM fichas_sessao WHERE agendamento_slot_id=? AND colaborador_id_aluno=? AND deleted_at IS NULL',
    )
    .bind(sessaoId, alunoId)
    .first();
  return Boolean(row);
}

/** tipo_aeronave de qualquer ficha viva da sessão (referência para fichas novas). */
export async function findTipoAeronaveDeFichaDaSessao(
  db: D1Database,
  sessaoId: string,
  empresaId: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      'SELECT tipo_aeronave FROM fichas_sessao WHERE agendamento_slot_id=? AND empresa_id=? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(sessaoId, empresaId)
    .first<{ tipo_aeronave: string | null }>();
  return row?.tipo_aeronave || null;
}

export async function insertFichaPendente(
  db: D1Database,
  input: {
    uuid: string;
    sessaoId: string;
    alunoId: string | number;
    instrutorId: string | number | null;
    tipoSessao: string;
    tipoAeronave: string | null;
    dataSessao: string;
    empresaId: number;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO fichas_sessao (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, empresa_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?)`,
    )
    .bind(
      input.uuid,
      input.sessaoId,
      input.alunoId,
      input.instrutorId,
      input.tipoSessao,
      input.tipoAeronave,
      input.dataSessao,
      input.empresaId,
    )
    .run();
  return Number(result.meta.last_row_id);
}

export async function findModeloIdDoTenant(
  db: D1Database,
  modeloId: string | number,
  empresaId: number,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT id
                 FROM modelos_sessao
                WHERE id = ?
                  AND empresa_id = ?
                  AND deleted_at IS NULL
                LIMIT 1`,
    )
    .bind(modeloId, empresaId)
    .first<{ id: number }>();
  return row ? Number(row.id) : null;
}

export async function findModeloIdPorTipoEAeronave(
  db: D1Database,
  input: { empresaId: number; tipoSessaoCodigo: string; tipoAeronave: string | null },
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT ms.id FROM modelos_sessao ms
                 INNER JOIN tipos_sessao ts
                   ON ms.tipo_sessao_id = ts.id
                  AND ts.empresa_id = ?
                  AND ts.deleted_at IS NULL
                 WHERE ts.codigo = ?
                   AND ms.modelo_aeronave = ?
                   AND ms.empresa_id = ?
                   AND ms.deleted_at IS NULL
                 LIMIT 1`,
    )
    .bind(input.empresaId, input.tipoSessaoCodigo, input.tipoAeronave, input.empresaId)
    .first<{ id: number }>();
  return row ? Number(row.id) : null;
}

export async function listManobrasDoModelo(
  db: D1Database,
  empresaId: number,
  modeloId: number,
): Promise<unknown[]> {
  const rows = await db
    .prepare(
      `SELECT m.codigo, m.nome, COALESCE(m.nome, m.descricao) AS descricao, m.categoria,
                      msm.ordem, msm.observacoes, COALESCE(msm.tripulante, 'AB') as tripulante
                 FROM modelos_sessao_manobras msm
                 INNER JOIN manobras m
                   ON m.id = msm.manobra_id
                  AND m.empresa_id = ?
                  AND m.deleted_at IS NULL
                 WHERE msm.modelo_id = ? AND msm.deleted_at IS NULL
                 ORDER BY msm.ordem ASC`,
    )
    .bind(empresaId, modeloId)
    .all();
  return rows.results || [];
}

/** Insere as manobras da ficha em lotes de 100 para respeitar os limites do D1. */
export async function insertFichaManobras(
  db: D1Database,
  fichaId: number,
  manobras: FichaManobraInsert[],
): Promise<void> {
  const insertStmt = db.prepare(
    `INSERT INTO fichas_sessao_manobras (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, resultado, observacoes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '')`,
  );
  const statements = manobras.map((m) =>
    insertStmt.bind(
      fichaId,
      m.codigo,
      m.nome || m.descricao || '',
      m.descricao || '',
      m.categoria || 'GERAL',
      m.ordem,
      m.tripulante || 'AB',
    ),
  );
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }
}
