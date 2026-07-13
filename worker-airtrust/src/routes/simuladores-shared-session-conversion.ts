import { fichasSessaoManobrasHasEmpresaId, getSimuladorModeloAeronave } from './simuladores-shared';
import type { NormalizedSharedSessionRequest } from './simuladores-shared-session-logic';
import { isProtectedFichaStatus, prepareStatement, runStatement } from './simuladores-shared-session-helpers';
import { getSimuladorAgendamentosColumns } from './simuladores-shared-session-validation';
import type { ModeloSessaoMapRow } from './simuladores-shared-session-validation';
import { assertModeloSessaoTemManobras, loadFichaManobrasForModelo } from './simuladores-shared-session-fichas';

/**
 * Converts an existing PLANNED, evidence-free simple session into a shared
 * session in place — reusing the same `simulador_agendamentos` row and its
 * first participant rather than creating a new session. This is deliberately
 * a separate code path from `buildSharedSessionCreatePlan` (brand-new
 * session) and `updateSharedSessionStructureTransactional` (diff against an
 * already-shared session): neither of those can safely express "flip
 * modo_compartilhado while reusing exactly one pre-existing participant."
 */

export type SimpleSessionForConversion = {
  id: number;
  empresa_id: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  simulador_id: number | null;
  instrutor_id: number;
  status: string | null;
  modo_compartilhado: number;
};

export async function loadSimpleSessionForConversion(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
): Promise<SimpleSessionForConversion | null> {
  const sessao = await db
    .prepare(
      `SELECT id, empresa_id, data, hora_inicio, hora_fim, simulador_id, instrutor_id, status,
              COALESCE(modo_compartilhado, 0) AS modo_compartilhado
       FROM simulador_agendamentos
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL`,
    )
    .bind(sessaoId, empresaId)
    .first<SimpleSessionForConversion>();
  return sessao || null;
}

/**
 * Broader than `isProtectedFichaStatus`: that helper only catches the final
 * resolved statuses (APROVADO/NAO_APROVADO/CONCLUIDA). A ficha that only the
 * student has signed sits in AGUARDANDO_ASSINATURA_INSTRUTOR — not "final",
 * but very much "evidence of execution" that must block a conversion. Mirrors
 * the effective-status derivation already used by GET /sessoes/:id/fichas.
 */
function fichaHasConversionBlockingEvidence(ficha: {
  status?: unknown;
  assinatura_aluno_timestamp?: unknown;
  assinatura_instrutor_timestamp?: unknown;
  assinatura_tripulante?: unknown;
  assinatura_instrutor?: unknown;
  resultado_final?: unknown;
}): boolean {
  if (isProtectedFichaStatus(ficha.status)) return true;
  if (ficha.assinatura_aluno_timestamp || ficha.assinatura_instrutor_timestamp) return true;
  if (Number(ficha.assinatura_tripulante) === 1 || Number(ficha.assinatura_instrutor) === 1) return true;
  const resultado = String(ficha.resultado_final || '').trim().toUpperCase();
  if (resultado && resultado !== 'PENDENTE') return true;
  const status = String(ficha.status || '')
    .trim()
    .toUpperCase();
  if (status && status !== 'AVALIACAO_PENDENTE' && status !== 'ABERTA') return true;
  return false;
}

/**
 * simulador_agendamentos.status uses the masculine canonical vocabulary
 * (AGENDADO/EM_ANDAMENTO/CONCLUIDO/CANCELADO — see
 * src/react-app/types/simuladores.ts isSameStatus), with legacy lowercase
 * and near-synonym rows ("agendado", "realizado") still present in older
 * data. Stripping a single trailing O/A mirrors isSameStatus's own
 * masculine/feminine normalization so this stays consistent with how the
 * rest of the app already compares session status.
 */
const BLOCKING_SESSION_STATUSES = new Set(
  ['EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO', 'REALIZADO'].map((value) => value.replace(/[OA]$/, '')),
);

function isBlockingSessionStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/[OA]$/, '');
  return BLOCKING_SESSION_STATUSES.has(normalized);
}

/**
 * Backend is the sole authority for whether a conversion is safe. Throws a
 * descriptive error (mapped to 409 by the route) when the session already
 * has any evidence of having happened — started, concluded, a signed or
 * concluded ficha, a registered result. A merely-planned session with no
 * fichas, or only untouched AVALIACAO_PENDENTE fichas, is convertible.
 */
export async function assertSimpleSessionConvertible(
  db: D1Database,
  empresaId: number,
  sessao: SimpleSessionForConversion,
): Promise<void> {
  if (isBlockingSessionStatus(sessao.status)) {
    throw new Error('Sessão precisa estar ativa e planejada para ser convertida em compartilhada');
  }

  const fichas = await db
    .prepare(
      `SELECT status, assinatura_aluno_timestamp, assinatura_instrutor_timestamp,
              assinatura_tripulante, assinatura_instrutor, resultado_final
       FROM fichas_sessao
       WHERE agendamento_slot_id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL`,
    )
    .bind(sessao.id, empresaId)
    .all<{
      status: string | null;
      assinatura_aluno_timestamp: string | null;
      assinatura_instrutor_timestamp: string | null;
      assinatura_tripulante: number | null;
      assinatura_instrutor: number | null;
      resultado_final: string | null;
    }>();

  if ((fichas.results || []).some(fichaHasConversionBlockingEvidence)) {
    throw new Error(
      'Sessão possui ficha com evidência de execução (assinatura ou resultado) e não pode ser convertida em compartilhada',
    );
  }
}

export type ConversionResult = {
  newParticipantFuncionarioIds: number[];
};

/**
 * Builds and executes the atomic conversion batch: flips modo_compartilhado,
 * reuses the session's existing participant row(s), inserts any additional
 * participant the shared model requires, and creates segments/atribuições/
 * fichas exactly like a brand-new shared session would — all in one
 * `db.batch()`, which D1 runs as a single transaction (all-or-nothing).
 *
 * Preconditions the caller must already have satisfied:
 *  - assertSimpleSessionConvertible (no evidence)
 *  - validateAndNormalizeSharedSessionRequest (payload shape)
 *  - assertEntityOwnership / assertNoExternalConflicts (tenant + schedule)
 *  - every funcionario_id already on the session (sessoes_participantes)
 *    is still present in payload.participantes — enforced below as a hard
 *    guard so a conversion request can never silently drop a participant.
 */
export async function convertSimpleSessionToSharedTransactional(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
): Promise<ConversionResult> {
  const existingParticipants = await db
    .prepare(
      `SELECT funcionario_id
       FROM sessoes_participantes
       WHERE sessao_id = ?
         AND deleted_at IS NULL
       ORDER BY id ASC`,
    )
    .bind(sessaoId)
    .all<{ funcionario_id: number }>();

  const existingIds = (existingParticipants.results || []).map((row) => Number(row.funcionario_id));
  const desiredIds = payload.participantes.map((item) => item.funcionario_id);

  for (const existingId of existingIds) {
    if (!desiredIds.includes(existingId)) {
      throw new Error('A conversão não pode remover participantes já vinculados à sessão original');
    }
  }

  const columns = await getSimuladorAgendamentosColumns(db);
  if (!columns.has('modo_compartilhado')) {
    throw new Error('Coluna modo_compartilhado ausente no schema atual');
  }

  const simulatorModel = await getSimuladorModeloAeronave(db, payload.simulador_id, empresaId);
  const primaryAssignment = payload.atribuicoes_planejadas[0] || null;
  const primaryModel = primaryAssignment?.modelo_sessao_id
    ? modelosMap.get(Number(primaryAssignment.modelo_sessao_id))
    : null;
  const durationMinutes = payload.segmentos.reduce(
    (sum, segmento) => sum + Number(segmento.duracao_minutos || 0),
    0,
  );

  const statements: D1PreparedStatement[] = [
    prepareStatement(
      db,
      `UPDATE simulador_agendamentos
       SET modo_compartilhado = 1,
           duracao_minutos = ?,
           tipo_sessao = ?,
           template_id = ?,
           updated_at = datetime('now')
       WHERE id = ?
         AND empresa_id = ?
         AND COALESCE(modo_compartilhado, 0) = 0`,
      durationMinutes,
      primaryModel?.tipo_sessao_codigo || primaryModel?.codigo || 'SHARED',
      primaryModel?.id || null,
      sessaoId,
      empresaId,
    ),
  ];

  type ParticipantRef = { expr: string; binds: unknown[] };
  const participantRefByFuncionario = new Map<number, ParticipantRef>();
  const newParticipantFuncionarioIds: number[] = [];

  for (const [index, participante] of payload.participantes.entries()) {
    if (existingIds.includes(participante.funcionario_id)) {
      statements.push(
        prepareStatement(
          db,
          `UPDATE sessoes_participantes
           SET funcao = ?, status = 'CONFIRMADO', updated_at = datetime('now')
           WHERE sessao_id = ?
             AND funcionario_id = ?
             AND deleted_at IS NULL`,
          index === 0 ? 'PIC' : 'SIC',
          sessaoId,
          participante.funcionario_id,
        ),
      );
      participantRefByFuncionario.set(participante.funcionario_id, {
        expr:
          '(SELECT id FROM sessoes_participantes WHERE sessao_id = ? AND funcionario_id = ? AND deleted_at IS NULL LIMIT 1)',
        binds: [sessaoId, participante.funcionario_id],
      });
    } else {
      const participantUuid = crypto.randomUUID();
      newParticipantFuncionarioIds.push(participante.funcionario_id);
      statements.push(
        prepareStatement(
          db,
          `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
           VALUES (?, ?, ?, ?, 'CONFIRMADO')`,
          participantUuid,
          sessaoId,
          participante.funcionario_id,
          index === 0 ? 'PIC' : 'SIC',
        ),
      );
      participantRefByFuncionario.set(participante.funcionario_id, {
        expr: '(SELECT id FROM sessoes_participantes WHERE uuid = ?)',
        binds: [participantUuid],
      });
    }
  }

  const assignmentUuidByKey = new Map<string, string>();
  for (const assignmentPlan of payload.atribuicoes_planejadas) {
    const atribuicaoUuid = crypto.randomUUID();
    assignmentUuidByKey.set(assignmentPlan.assignment_key, atribuicaoUuid);
    const participantRef = participantRefByFuncionario.get(assignmentPlan.funcionario_id);
    if (!participantRef) {
      throw new Error(`Participante ${assignmentPlan.funcionario_id} não pertence à sessão`);
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO simulador_atribuicoes_curriculares
             (uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status)
           VALUES (?, ?, ?, ${participantRef.expr}, ?, ?, ?, ?, 'ATIVA')`,
        )
        .bind(
          atribuicaoUuid,
          empresaId,
          sessaoId,
          ...participantRef.binds,
          assignmentPlan.treinamento_planejado_id || null,
          assignmentPlan.modelo_sessao_id,
          assignmentPlan.gera_ficha ? 1 : 0,
          assignmentPlan.carga_horaria_total_minutos,
        ),
    );
  }

  for (const segmento of payload.segmentos) {
    const segmentoUuid = crypto.randomUUID();
    const legacyAssignmentKey = segmento.curricular_assignment_keys[0] || null;
    const legacyAssignmentUuid = legacyAssignmentKey
      ? assignmentUuidByKey.get(legacyAssignmentKey) || null
      : null;

    statements.push(
      db
        .prepare(
          `INSERT INTO simulador_agendamento_segmentos
             (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, finalidade_codigo, finalidade_titulo, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ${legacyAssignmentUuid ? '(SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?)' : 'NULL'}, ?, ?, 'ATIVO')`,
        )
        .bind(
          segmentoUuid,
          empresaId,
          sessaoId,
          segmento.ordem,
          segmento.inicio,
          segmento.fim,
          segmento.duracao_minutos,
          ...(legacyAssignmentUuid ? [legacyAssignmentUuid] : []),
          segmento.finalidade_codigo,
          segmento.finalidade_titulo,
        ),
    );

    for (const participanteCurricular of segmento.participantes.filter((item) => item.cumpre_treinamento)) {
      if (!participanteCurricular.assignment_key) continue;
      const assignmentUuid = assignmentUuidByKey.get(participanteCurricular.assignment_key);
      if (!assignmentUuid) continue;

      const segmentoAtribuicaoUuid = crypto.randomUUID();
      statements.push(
        db
          .prepare(
            `INSERT INTO simulador_segmento_atribuicoes
               (uuid, empresa_id, segmento_id, atribuicao_curricular_id, status, gera_ficha)
             VALUES (?, ?, (SELECT id FROM simulador_agendamento_segmentos WHERE uuid = ?), (SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?), 'PLANEJADA', ?)`,
          )
          .bind(
            segmentoAtribuicaoUuid,
            empresaId,
            segmentoUuid,
            assignmentUuid,
            participanteCurricular.gera_ficha ? 1 : 0,
          ),
      );
    }

    for (const funcao of segmento.participantes) {
      const participantRef = participantRefByFuncionario.get(funcao.funcionario_id);
      if (!participantRef) {
        throw new Error(`Participante ${funcao.funcionario_id} não pertence à sessão`);
      }
      const assignmentUuid = funcao.assignment_key ? assignmentUuidByKey.get(funcao.assignment_key) || null : null;

      statements.push(
        db
          .prepare(
            `INSERT INTO simulador_segmento_participantes
               (uuid, empresa_id, segmento_id, participante_id, funcao, duracao_minutos, atribuicao_curricular_id)
             VALUES (?, ?, (SELECT id FROM simulador_agendamento_segmentos WHERE uuid = ?), ${participantRef.expr}, ?, ?, ${assignmentUuid ? '(SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?)' : 'NULL'})`,
          )
          .bind(
            crypto.randomUUID(),
            empresaId,
            segmentoUuid,
            ...participantRef.binds,
            funcao.funcao,
            segmento.duracao_minutos,
            ...(assignmentUuid ? [assignmentUuid] : []),
          ),
      );
    }
  }

  for (const assignmentPlan of payload.atribuicoes_planejadas) {
    if (!assignmentPlan.gera_ficha || !assignmentPlan.modelo_sessao_id) {
      continue;
    }

    const fichaUuid = crypto.randomUUID();
    const modelo = modelosMap.get(Number(assignmentPlan.modelo_sessao_id));

    statements.push(
      db
        .prepare(
          `INSERT INTO fichas_sessao
             (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id, atribuicao_curricular_id, segmento_atribuicao_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?, (SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?), NULL)`,
        )
        .bind(
          fichaUuid,
          sessaoId,
          assignmentPlan.funcionario_id,
          payload.instrutor_id,
          modelo?.codigo || primaryModel?.codigo || 'SHARED',
          simulatorModel,
          payload.data,
          assignmentPlan.modelo_sessao_id,
          empresaId,
          assignmentUuidByKey.get(assignmentPlan.assignment_key),
        ),
    );

    const manobras = await loadFichaManobrasForModelo(db, Number(assignmentPlan.modelo_sessao_id));
    assertModeloSessaoTemManobras(Number(assignmentPlan.modelo_sessao_id), manobras);
    const hasFichaEmpresaId = await fichasSessaoManobrasHasEmpresaId(db);
    for (const manobra of manobras) {
      statements.push(
        db
          .prepare(
            hasFichaEmpresaId
              ? `INSERT INTO fichas_sessao_manobras
                   (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, empresa_id)
                 VALUES ((SELECT id FROM fichas_sessao WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?)`
              : `INSERT INTO fichas_sessao_manobras
                   (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante)
                 VALUES ((SELECT id FROM fichas_sessao WHERE uuid = ?), ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            fichaUuid,
            manobra.codigo,
            manobra.nome,
            manobra.descricao || manobra.nome,
            manobra.categoria || 'GERAL',
            manobra.ordem,
            manobra.tripulante || 'AB',
            ...(hasFichaEmpresaId ? [empresaId] : []),
          ),
      );
    }
  }

  // Any ficha the simple session already had (necessarily evidence-free —
  // assertSimpleSessionConvertible already ran) is superseded by the new
  // per-segment fichas above; simple-session fichas never carry a
  // segmento_atribuicao_id, so this only ever touches pre-conversion rows.
  statements.push(
    prepareStatement(
      db,
      `UPDATE fichas_sessao
       SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE agendamento_slot_id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
         AND segmento_atribuicao_id IS NULL`,
      sessaoId,
      empresaId,
    ),
  );

  await db.batch(statements);

  return { newParticipantFuncionarioIds };
}

/**
 * Compensating cleanup for the sequential (non-batched) qualification-
 * creation phase that runs after the atomic conversion batch has already
 * committed — mirrors cleanupFailedSharedCreate's role for POST, but must
 * NOT delete the pre-existing agendamento or its original participant.
 */
export async function cleanupFailedSharedConversion(
  db: D1Database,
  sessaoId: number,
  newParticipantFuncionarioIds: number[] = [],
): Promise<void> {
  await runStatement(
    db,
    'DELETE FROM simulador_segmento_atribuicoes WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ?)',
    sessaoId,
  );
  await runStatement(
    db,
    'DELETE FROM simulador_segmento_participantes WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ?)',
    sessaoId,
  );
  await runStatement(db, 'DELETE FROM simulador_agendamento_segmentos WHERE agendamento_id = ?', sessaoId);
  await runStatement(
    db,
    'DELETE FROM fichas_sessao_manobras WHERE ficha_id IN (SELECT id FROM fichas_sessao WHERE agendamento_slot_id = ? AND segmento_atribuicao_id IS NOT NULL)',
    sessaoId,
  );
  await runStatement(
    db,
    'DELETE FROM fichas_sessao WHERE agendamento_slot_id = ? AND segmento_atribuicao_id IS NOT NULL',
    sessaoId,
  );
  await runStatement(db, 'DELETE FROM simulador_atribuicoes_curriculares WHERE agendamento_id = ?', sessaoId);
  for (const funcionarioId of newParticipantFuncionarioIds) {
    await runStatement(
      db,
      'DELETE FROM sessoes_participantes WHERE sessao_id = ? AND funcionario_id = ? AND deleted_at IS NULL',
      sessaoId,
      funcionarioId,
    );
  }
  await runStatement(
    db,
    "UPDATE simulador_agendamentos SET modo_compartilhado = 0, updated_at = datetime('now') WHERE id = ?",
    sessaoId,
  );
}
