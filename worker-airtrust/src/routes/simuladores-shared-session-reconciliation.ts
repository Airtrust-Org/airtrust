import { fichasSessaoManobrasHasEmpresaId, getSimuladorModeloAeronave } from './simuladores-shared';
import { createSharedAssignmentKey } from './simuladores-shared-session-logic';
import type { NormalizedSharedSessionRequest } from './simuladores-shared-session-logic';
import { isProtectedFichaStatus, prepareStatement } from './simuladores-shared-session-helpers';
import { getSimuladorAgendamentosColumns } from './simuladores-shared-session-validation';
import type { ModeloSessaoMapRow } from './simuladores-shared-session-validation';
import { assertModeloSessaoTemManobras, loadFichaManobrasForModelo } from './simuladores-shared-session-fichas';
import type { LoadedSharedDetail } from './simuladores-shared-session-detail';

export type SharedPersistenceContext = {
  participanteIds: number[];
  atribuicaoIds: number[];
  segmentoIds: number[];
  segmentoAtribuicaoIds: number[];
  segmentoParticipanteIds: number[];
  fichaIds: number[];
};

type SharedBatchPlan = {
  sessaoId: number | null;
  sessaoUuid: string;
  persistence: SharedPersistenceContext;
  statements: D1PreparedStatement[];
};

/**
 * Builds the insert-only batch plan for a brand-new shared session. Editing an
 * existing shared session goes through `updateSharedSessionStructureTransactional`
 * instead, which reconciles in place rather than rebuilding the structure.
 */
async function buildSharedSessionCreatePlan(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
): Promise<SharedBatchPlan> {
  const columns = await getSimuladorAgendamentosColumns(db);
  const modoCompartilhadoSupported = columns.has('modo_compartilhado');
  const tipoDispositivoSupported = columns.has('tipo_dispositivo');
  const aeronaveIdSupported = columns.has('aeronave_id');

  const sessaoUuid = crypto.randomUUID();
  const simulatorModel = await getSimuladorModeloAeronave(db, payload.simulador_id, empresaId);

  const primaryParticipant = payload.participantes[0];
  const primaryAssignment = payload.atribuicoes_planejadas[0] || null;
  const primaryModel = primaryAssignment?.modelo_sessao_id
    ? modelosMap.get(Number(primaryAssignment.modelo_sessao_id))
    : null;
  const durationMinutes =
    payload.segmentos.reduce((sum, segmento) => sum + Number(segmento.duracao_minutos || 0), 0);

  const persistence: SharedPersistenceContext = {
    participanteIds: [],
    atribuicaoIds: [],
    segmentoIds: [],
    segmentoAtribuicaoIds: [],
    segmentoParticipanteIds: [],
    fichaIds: [],
  };

  const statements: D1PreparedStatement[] = [];
  const sessionIdExpr = '(SELECT id FROM simulador_agendamentos WHERE uuid = ?)';
  const sessionIdBinds = [sessaoUuid];

  const fields = [
    'uuid',
    'simulador_id',
    ...(aeronaveIdSupported ? ['aeronave_id'] : []),
    'funcionario_id',
    'data',
    'hora_inicio',
    'hora_fim',
    'duracao_minutos',
    'instrutor_id',
    'tipo_sessao',
    ...(tipoDispositivoSupported ? ['tipo_dispositivo'] : []),
    'template_id',
    'status',
    'observacoes',
    'nome',
    'empresa_id',
    ...(modoCompartilhadoSupported ? ['modo_compartilhado'] : []),
  ];

  statements.push(
    prepareStatement(
      db,
      `INSERT INTO simulador_agendamentos (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      sessaoUuid,
      payload.simulador_id,
      ...(aeronaveIdSupported ? [null] : []),
      primaryParticipant.funcionario_id,
      payload.data,
      payload.hora_inicio,
      payload.hora_fim,
      durationMinutes,
      payload.instrutor_id,
      primaryModel?.tipo_sessao_codigo || primaryModel?.codigo || 'SHARED',
      ...(tipoDispositivoSupported ? ['SIMULADOR'] : []),
      primaryModel?.id || null,
      'AGENDADO',
      payload.observacoes || null,
      payload.tema_sessao || 'Sessão compartilhada',
      empresaId,
      ...(modoCompartilhadoSupported ? [1] : []),
    ),
  );

  const participantUuidByFuncionario = new Map<number, string>();
  const assignmentUuidByKey = new Map<string, string>();

  for (const [index, participante] of payload.participantes.entries()) {
    const participantUuid = crypto.randomUUID();
    participantUuidByFuncionario.set(participante.funcionario_id, participantUuid);
    persistence.participanteIds.push(index + 1);

    statements.push(
      prepareStatement(
        db,
        `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
         VALUES (?, ${sessionIdExpr}, ?, ?, 'CONFIRMADO')`,
        participantUuid,
        ...sessionIdBinds,
        participante.funcionario_id,
        index === 0 ? 'PIC' : 'SIC',
      ),
    );
  }

  for (const assignmentPlan of payload.atribuicoes_planejadas) {
    const atribuicaoUuid = crypto.randomUUID();
    assignmentUuidByKey.set(assignmentPlan.assignment_key, atribuicaoUuid);
    persistence.atribuicaoIds.push(persistence.atribuicaoIds.length + 1);

    statements.push(
      db
        .prepare(
          `INSERT INTO simulador_atribuicoes_curriculares
             (uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status)
           VALUES (?, ?, ${sessionIdExpr}, (SELECT id FROM sessoes_participantes WHERE uuid = ?), ?, ?, ?, ?, 'ATIVA')`,
        )
        .bind(
          atribuicaoUuid,
          empresaId,
          ...sessionIdBinds,
          participantUuidByFuncionario.get(assignmentPlan.funcionario_id),
          assignmentPlan.treinamento_planejado_id || null,
          assignmentPlan.modelo_sessao_id || null,
          assignmentPlan.gera_ficha ? 1 : 0,
          assignmentPlan.carga_horaria_total_minutos,
        ),
    );
  }

  for (const segmento of payload.segmentos) {
    const segmentoUuid = crypto.randomUUID();
    persistence.segmentoIds.push(persistence.segmentoIds.length + 1);
    const legacyAssignmentKey = segmento.curricular_assignment_keys[0] || null;

    if (legacyAssignmentKey) {
      statements.push(
        db
          .prepare(
            `INSERT INTO simulador_agendamento_segmentos
               (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, finalidade_codigo, finalidade_titulo, status)
             VALUES (?, ?, ${sessionIdExpr}, ?, ?, ?, ?, (SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?), ?, ?, 'ATIVO')`,
          )
          .bind(
            segmentoUuid,
            empresaId,
            ...sessionIdBinds,
            segmento.ordem,
            segmento.inicio,
            segmento.fim,
            segmento.duracao_minutos,
            assignmentUuidByKey.get(legacyAssignmentKey) || null,
            segmento.finalidade_codigo,
            segmento.finalidade_titulo,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO simulador_agendamento_segmentos
               (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, finalidade_codigo, finalidade_titulo, status)
             VALUES (?, ?, ${sessionIdExpr}, ?, ?, ?, ?, NULL, ?, ?, 'ATIVO')`,
          )
          .bind(
            segmentoUuid,
            empresaId,
            ...sessionIdBinds,
            segmento.ordem,
            segmento.inicio,
            segmento.fim,
            segmento.duracao_minutos,
            segmento.finalidade_codigo,
            segmento.finalidade_titulo,
          ),
      );
    }

    for (const participanteCurricular of segmento.participantes.filter((participante) => participante.cumpre_treinamento)) {
      if (!participanteCurricular.assignment_key) continue;
      const assignmentUuid = assignmentUuidByKey.get(participanteCurricular.assignment_key);
      if (!assignmentUuid) continue;
      const segmentoAtribuicaoUuid = crypto.randomUUID();
      persistence.segmentoAtribuicaoIds.push(persistence.segmentoAtribuicaoIds.length + 1);
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
      persistence.segmentoParticipanteIds.push(persistence.segmentoParticipanteIds.length + 1);
      const assignmentUuid = funcao.assignment_key
        ? assignmentUuidByKey.get(funcao.assignment_key) || null
        : null;

      if (assignmentUuid) {
        statements.push(
          db
            .prepare(
              `INSERT INTO simulador_segmento_participantes
                 (uuid, empresa_id, segmento_id, participante_id, funcao, duracao_minutos, atribuicao_curricular_id)
               VALUES (?, ?, (SELECT id FROM simulador_agendamento_segmentos WHERE uuid = ?), (SELECT id FROM sessoes_participantes WHERE uuid = ?), ?, ?, (SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?))`,
            )
            .bind(
              crypto.randomUUID(),
              empresaId,
              segmentoUuid,
              participantUuidByFuncionario.get(funcao.funcionario_id),
              funcao.funcao,
              segmento.duracao_minutos,
              assignmentUuid,
            ),
        );
      } else {
        statements.push(
          db
            .prepare(
              `INSERT INTO simulador_segmento_participantes
                 (uuid, empresa_id, segmento_id, participante_id, funcao, duracao_minutos, atribuicao_curricular_id)
               VALUES (?, ?, (SELECT id FROM simulador_agendamento_segmentos WHERE uuid = ?), (SELECT id FROM sessoes_participantes WHERE uuid = ?), ?, ?, NULL)`,
            )
            .bind(
              crypto.randomUUID(),
              empresaId,
              segmentoUuid,
              participantUuidByFuncionario.get(funcao.funcionario_id),
              funcao.funcao,
              segmento.duracao_minutos,
            ),
        );
      }
    }
  }

  for (const assignmentPlan of payload.atribuicoes_planejadas) {
    if (!assignmentPlan.gera_ficha || !assignmentPlan.modelo_sessao_id) {
      continue;
    }

    const fichaUuid = crypto.randomUUID();
    const modelo = modelosMap.get(Number(assignmentPlan.modelo_sessao_id));
    persistence.fichaIds.push(persistence.fichaIds.length + 1);

    statements.push(
      db
        .prepare(
          `INSERT INTO fichas_sessao
             (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id, atribuicao_curricular_id, segmento_atribuicao_id)
           VALUES (?, ${sessionIdExpr}, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?, (SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?), NULL)`,
        )
        .bind(
          fichaUuid,
          ...sessionIdBinds,
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

  return {
    sessaoId: null,
    sessaoUuid,
    persistence,
    statements,
  };
}

export async function createSharedSessionStructureTransactional(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
): Promise<{ sessaoId: number; persistence: SharedPersistenceContext }> {
  const plan = await buildSharedSessionCreatePlan(db, empresaId, payload, modelosMap);
  await db.batch(plan.statements);

  const sessaoId =
    plan.sessaoId ||
    Number(
      (
        await db
          .prepare('SELECT id FROM simulador_agendamentos WHERE uuid = ? LIMIT 1')
          .bind(plan.sessaoUuid)
          .first<{ id: number }>()
      )?.id || 0,
    );

  if (!sessaoId) {
    throw new Error('Sessão compartilhada criada sem id resolvido');
  }

  return { sessaoId, persistence: plan.persistence };
}

function buildSharedCurrentState(current: LoadedSharedDetail) {
  const participantIdByFuncionario = new Map<number, number>(
    (current.participantes || []).map((participante: any) => [
      Number(participante.funcionario_id),
      Number(participante.id),
    ]),
  );

  const assignmentByKey = new Map<
    string,
    {
      id: number;
      funcionario_id: number;
      modelo_sessao_id: number | null;
      gera_ficha: boolean;
    }
  >();

  for (const atribuicao of current.atribuicoes || []) {
    if (!atribuicao?.modelo_sessao_id) {
      continue;
    }
    assignmentByKey.set(
      createSharedAssignmentKey(
        Number(atribuicao.funcionario_id),
        Number(atribuicao.modelo_sessao_id),
      ),
      {
        id: Number(atribuicao.id),
        funcionario_id: Number(atribuicao.funcionario_id),
        modelo_sessao_id: Number(atribuicao.modelo_sessao_id),
        gera_ficha: Number(atribuicao.gera_ficha ?? 0) === 1,
      },
    );
  }

  const segmentById = new Map<number, any>(
    (current.segmentos || []).map((segmento: any) => [Number(segmento.id), segmento]),
  );

  const segmentParticipantByKey = new Map<string, any>();
  for (const segmento of current.segmentos || []) {
    for (const participante of segmento.participantes || []) {
      segmentParticipantByKey.set(
        `${Number(segmento.id)}:${Number(participante.funcionario_id)}`,
        participante,
      );
    }
  }

  const linkByKey = new Map<string, any>();
  for (const segmento of current.segmentos || []) {
    for (const link of segmento.atribuicoes_curriculares || []) {
      linkByKey.set(`${Number(segmento.id)}:${String(link.assignment_key || '')}`, link);
    }
  }

  const fichasByLinkId = new Map<number, any[]>();
  const fichasByAssignmentId = new Map<number, any[]>();
  const protectedLegacyAssignmentIds = new Set<number>();

  for (const ficha of current.fichas || []) {
    const atribuicaoCurricularId = Number((ficha as any).atribuicao_curricular_id || 0);
    if (atribuicaoCurricularId > 0) {
      const currentItems = fichasByAssignmentId.get(atribuicaoCurricularId) || [];
      currentItems.push(ficha);
      fichasByAssignmentId.set(atribuicaoCurricularId, currentItems);
    }

    const segmentoAtribuicaoId = Number((ficha as any).segmento_atribuicao_id || 0);
    if (segmentoAtribuicaoId > 0) {
      const currentItems = fichasByLinkId.get(segmentoAtribuicaoId) || [];
      currentItems.push(ficha);
      fichasByLinkId.set(segmentoAtribuicaoId, currentItems);
      continue;
    }

    if (
      isProtectedFichaStatus((ficha as any).status) &&
      Number((ficha as any).atribuicao_curricular_id || 0) > 0
    ) {
      protectedLegacyAssignmentIds.add(Number((ficha as any).atribuicao_curricular_id));
    }
  }

  return {
    participantIdByFuncionario,
    assignmentByKey,
    segmentById,
    segmentParticipantByKey,
    linkByKey,
    fichasByLinkId,
    fichasByAssignmentId,
    protectedLegacyAssignmentIds,
  };
}

function assertSharedParticipantsUnchanged(
  payload: NormalizedSharedSessionRequest,
  current: LoadedSharedDetail,
) {
  const currentIds = (current.participantes || [])
    .map((participante: any) => Number(participante.funcionario_id))
    .sort((left, right) => left - right);
  const desiredIds = payload.participantes
    .map((participante) => Number(participante.funcionario_id))
    .sort((left, right) => left - right);

  if (JSON.stringify(currentIds) !== JSON.stringify(desiredIds)) {
    throw new Error('Participantes físicos da sessão compartilhada não podem ser alterados nesta edição');
  }
}

function assertProtectedSharedEditCompatibility(
  payload: NormalizedSharedSessionRequest,
  current: LoadedSharedDetail,
) {
  const state = buildSharedCurrentState(current);
  if (state.protectedLegacyAssignmentIds.size > 0) {
    throw new Error('Sessão compartilhada com ficha legada concluída não pode ser editada com segurança');
  }

  const desiredSegmentsById = new Map<number, NormalizedSharedSessionRequest['segmentos'][number]>(
    payload.segmentos
      .filter((segmento) => Number(segmento.id || 0) > 0)
      .map((segmento) => [Number(segmento.id), segmento]),
  );

  for (const segmentoAtual of current.segmentos || []) {
    const currentProtected = (segmentoAtual.atribuicoes_curriculares || []).some((link: any) => {
      const fichas = state.fichasByLinkId.get(Number(link.id)) || [];
      return (
        String(link.status || '').toUpperCase() === 'CUMPRIDA' ||
        fichas.some((ficha) => isProtectedFichaStatus((ficha as any).status))
      );
    });

    if (!currentProtected) {
      continue;
    }

    const desired = desiredSegmentsById.get(Number(segmentoAtual.id));
    if (!desired) {
      throw new Error('Segmento concluído não pode ser removido');
    }

    if (
      desired.inicio !== segmentoAtual.inicio ||
      desired.fim !== segmentoAtual.fim ||
      String(desired.finalidade_codigo || 'OUTRO') !== String(segmentoAtual.finalidade_codigo || 'OUTRO') ||
      Number(desired.modelo_sessao_id || 0) !== Number(segmentoAtual.modelo_sessao_id || 0)
    ) {
      throw new Error('Segmento concluído não pode ter horário, finalidade ou modelo alterados');
    }

    const desiredSignature = JSON.stringify(
      [...desired.participantes]
        .map((participante) => ({
          funcionario_id: Number(participante.funcionario_id),
          funcao: participante.funcao,
          cumpre_treinamento: Boolean(participante.cumpre_treinamento),
          gera_ficha: Boolean(participante.gera_ficha),
          modelo_sessao_id: Number(participante.modelo_sessao_id || desired.modelo_sessao_id || 0) || null,
        }))
        .sort((left, right) => left.funcionario_id - right.funcionario_id),
    );

    const currentSignature = JSON.stringify(
      [...(segmentoAtual.participantes || [])]
        .map((participante: any) => ({
          funcionario_id: Number(participante.funcionario_id),
          funcao: String(participante.funcao || 'PF').toUpperCase(),
          cumpre_treinamento: Boolean(participante.cumpre_treinamento),
          gera_ficha: Boolean(participante.gera_ficha),
          modelo_sessao_id: Number(participante.modelo_sessao_id || 0) || null,
        }))
        .sort((left, right) => left.funcionario_id - right.funcionario_id),
    );

    if (desiredSignature !== currentSignature) {
      throw new Error('Segmento concluído não pode ter tripulação ou vínculo curricular alterados');
    }
  }
}

export async function updateSharedSessionStructureTransactional(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
  current: LoadedSharedDetail,
): Promise<void> {
  assertSharedParticipantsUnchanged(payload, current);
  assertProtectedSharedEditCompatibility(payload, current);

  const state = buildSharedCurrentState(current);
  const simulatorModel = await getSimuladorModeloAeronave(db, payload.simulador_id, empresaId);
  const primaryParticipant = payload.participantes[0];
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
       SET data = ?,
           hora_inicio = ?,
           hora_fim = ?,
           duracao_minutos = ?,
           simulador_id = ?,
           instrutor_id = ?,
           funcionario_id = ?,
           tipo_sessao = ?,
           template_id = ?,
           nome = ?,
           observacoes = ?,
           updated_at = datetime('now')
       WHERE id = ?
         AND empresa_id = ?`,
      payload.data,
      payload.hora_inicio,
      payload.hora_fim,
      durationMinutes,
      payload.simulador_id,
      payload.instrutor_id,
      primaryParticipant.funcionario_id,
      primaryModel?.tipo_sessao_codigo || primaryModel?.codigo || 'SHARED',
      primaryModel?.id || null,
      payload.tema_sessao || 'Sessão compartilhada',
      payload.observacoes || null,
      sessaoId,
      empresaId,
    ),
  ];

  for (const [index, participante] of payload.participantes.entries()) {
    const participantId = state.participantIdByFuncionario.get(participante.funcionario_id);
    if (!participantId) {
      throw new Error(`Participante ${participante.funcionario_id} não pertence à sessão compartilhada`);
    }
    statements.push(
      prepareStatement(
        db,
        "UPDATE sessoes_participantes SET funcao = ?, status = 'CONFIRMADO' WHERE id = ? AND deleted_at IS NULL",
        index === 0 ? 'PIC' : 'SIC',
        participantId,
      ),
    );
  }

  const desiredAssignmentKeys = new Set(payload.atribuicoes_planejadas.map((item) => item.assignment_key));
  const newAssignmentUuidByKey = new Map<string, string>();
  const processedFichaAssignments = new Set<string>();

  for (const assignmentPlan of payload.atribuicoes_planejadas) {
    const existingAssignment = state.assignmentByKey.get(assignmentPlan.assignment_key);
    if (existingAssignment) {
      statements.push(
        prepareStatement(
          db,
          `UPDATE simulador_atribuicoes_curriculares
           SET treinamento_planejado_id = ?,
               modelo_sessao_id = ?,
               gera_ficha = ?,
               carga_horaria_total_minutos = ?,
               status = 'ATIVA',
               deleted_at = NULL,
               updated_at = datetime('now')
           WHERE id = ?
             AND empresa_id = ?`,
          assignmentPlan.treinamento_planejado_id || null,
          assignmentPlan.modelo_sessao_id,
          assignmentPlan.gera_ficha ? 1 : 0,
          assignmentPlan.carga_horaria_total_minutos,
          existingAssignment.id,
          empresaId,
        ),
      );
      continue;
    }

    const participantId = state.participantIdByFuncionario.get(assignmentPlan.funcionario_id);
    if (!participantId) {
      throw new Error(`Participante ${assignmentPlan.funcionario_id} não pertence à sessão compartilhada`);
    }

    const assignmentUuid = crypto.randomUUID();
    newAssignmentUuidByKey.set(assignmentPlan.assignment_key, assignmentUuid);
    statements.push(
      prepareStatement(
        db,
        `INSERT INTO simulador_atribuicoes_curriculares
           (uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVA')`,
        assignmentUuid,
        empresaId,
        sessaoId,
        participantId,
        assignmentPlan.treinamento_planejado_id || null,
        assignmentPlan.modelo_sessao_id,
        assignmentPlan.gera_ficha ? 1 : 0,
        assignmentPlan.carga_horaria_total_minutos,
      ),
    );
  }

  const segmentRefByIdentity = new Map<
    string,
    { existingId: number | null; uuid: string | null; segmento: NormalizedSharedSessionRequest['segmentos'][number] }
  >();
  const desiredExistingSegmentIds = new Set<number>();

  for (const segmento of payload.segmentos) {
    const identity = Number(segmento.id || 0) > 0 ? `existing:${Number(segmento.id)}` : `new:${segmento.ordem}`;
    const existingId = Number(segmento.id || 0) > 0 ? Number(segmento.id) : null;
    if (existingId && !state.segmentById.has(existingId)) {
      throw new Error(`Segmento ${existingId} não pertence à sessão compartilhada`);
    }

    if (existingId) {
      desiredExistingSegmentIds.add(existingId);
    }

    const assignmentKey = segmento.curricular_assignment_keys[0] || null;
    const existingAssignment = assignmentKey ? state.assignmentByKey.get(assignmentKey) : null;
    const newAssignmentUuid = assignmentKey ? newAssignmentUuidByKey.get(assignmentKey) || null : null;
    const legacyAssignmentExpr = existingAssignment
      ? '?'
      : newAssignmentUuid
        ? '(SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?)'
        : 'NULL';
    const legacyAssignmentBinds = existingAssignment
      ? [existingAssignment.id]
      : newAssignmentUuid
        ? [newAssignmentUuid]
        : [];

    if (existingId) {
      statements.push(
        prepareStatement(
          db,
          `UPDATE simulador_agendamento_segmentos
           SET ordem = ?,
               inicio = ?,
               fim = ?,
               duracao_minutos = ?,
               atribuicao_curricular_id = ${legacyAssignmentExpr},
               finalidade_codigo = ?,
               finalidade_titulo = ?,
               status = 'ATIVO',
               deleted_at = NULL,
               updated_at = datetime('now')
           WHERE id = ?
             AND agendamento_id = ?
             AND empresa_id = ?`,
          segmento.ordem,
          segmento.inicio,
          segmento.fim,
          segmento.duracao_minutos,
          ...legacyAssignmentBinds,
          segmento.finalidade_codigo,
          segmento.finalidade_titulo,
          existingId,
          sessaoId,
          empresaId,
        ),
      );
      segmentRefByIdentity.set(identity, { existingId, uuid: null, segmento });
      continue;
    }

    const segmentUuid = crypto.randomUUID();
    statements.push(
      prepareStatement(
        db,
        `INSERT INTO simulador_agendamento_segmentos
           (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, finalidade_codigo, finalidade_titulo, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ${legacyAssignmentExpr}, ?, ?, 'ATIVO')`,
        segmentUuid,
        empresaId,
        sessaoId,
        segmento.ordem,
        segmento.inicio,
        segmento.fim,
        segmento.duracao_minutos,
        ...legacyAssignmentBinds,
        segmento.finalidade_codigo,
        segmento.finalidade_titulo,
      ),
    );
    segmentRefByIdentity.set(identity, { existingId: null, uuid: segmentUuid, segmento });
  }

  for (const segmentoAtual of current.segmentos || []) {
    const segmentoId = Number(segmentoAtual.id);
    if (desiredExistingSegmentIds.has(segmentoId)) {
      continue;
    }

    const protectedSegment = (segmentoAtual.atribuicoes_curriculares || []).some((link: any) => {
      const fichas = state.fichasByLinkId.get(Number(link.id)) || [];
      return (
        String(link.status || '').toUpperCase() === 'CUMPRIDA' ||
        fichas.some((ficha) => isProtectedFichaStatus((ficha as any).status))
      );
    });
    if (protectedSegment) {
      continue;
    }

    statements.push(
      prepareStatement(
        db,
        "UPDATE simulador_segmento_participantes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE segmento_id = ? AND empresa_id = ? AND deleted_at IS NULL",
        segmentoId,
        empresaId,
      ),
      prepareStatement(
        db,
        "UPDATE simulador_segmento_atribuicoes SET status = 'CANCELADA', deleted_at = datetime('now'), updated_at = datetime('now') WHERE segmento_id = ? AND empresa_id = ? AND deleted_at IS NULL",
        segmentoId,
        empresaId,
      ),
      prepareStatement(
        db,
        "UPDATE fichas_sessao SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE segmento_atribuicao_id IN (SELECT id FROM simulador_segmento_atribuicoes WHERE segmento_id = ? AND empresa_id = ?) AND deleted_at IS NULL AND UPPER(COALESCE(status, 'AVALIACAO_PENDENTE')) NOT IN ('APROVADO', 'NAO_APROVADO', 'CONCLUIDA')",
        segmentoId,
        empresaId,
      ),
      prepareStatement(
        db,
        "UPDATE simulador_agendamento_segmentos SET status = 'CANCELADO', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
        segmentoId,
        empresaId,
      ),
    );
  }

  const desiredSegmentParticipantKeys = new Set<string>();
  const desiredLinkKeys = new Set<string>();

  for (const [identity, segmentRef] of segmentRefByIdentity.entries()) {
    const { segmento, existingId, uuid } = segmentRef;
    const segmentIdExpr = existingId
      ? '?'
      : '(SELECT id FROM simulador_agendamento_segmentos WHERE uuid = ?)';
    const segmentIdBinds = existingId ? [existingId] : [uuid!];

    for (const participante of segmento.participantes) {
      const participantId = state.participantIdByFuncionario.get(participante.funcionario_id);
      if (!participantId) {
        throw new Error(`Participante ${participante.funcionario_id} não pertence à sessão compartilhada`);
      }

      const assignmentExisting = participante.assignment_key
        ? state.assignmentByKey.get(participante.assignment_key) || null
        : null;
      const assignmentNewUuid = participante.assignment_key
        ? newAssignmentUuidByKey.get(participante.assignment_key) || null
        : null;
      const assignmentExpr = assignmentExisting
        ? '?'
        : assignmentNewUuid
          ? '(SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?)'
          : 'NULL';
      const assignmentBinds = assignmentExisting
        ? [assignmentExisting.id]
        : assignmentNewUuid
          ? [assignmentNewUuid]
          : [];

      const participantKey = `${existingId || identity}:${participante.funcionario_id}`;
      desiredSegmentParticipantKeys.add(participantKey);

      const existingParticipantRow = existingId
        ? state.segmentParticipantByKey.get(`${existingId}:${participante.funcionario_id}`)
        : null;

      if (existingParticipantRow) {
        statements.push(
          prepareStatement(
            db,
            `UPDATE simulador_segmento_participantes
             SET funcao = ?,
                 duracao_minutos = ?,
                 atribuicao_curricular_id = ${assignmentExpr},
                 deleted_at = NULL,
                 updated_at = datetime('now')
             WHERE segmento_id = ?
               AND participante_id = ?
               AND empresa_id = ?`,
            participante.funcao,
            segmento.duracao_minutos,
            ...assignmentBinds,
            existingId,
            participantId,
            empresaId,
          ),
        );
      } else {
        statements.push(
          prepareStatement(
            db,
            `INSERT INTO simulador_segmento_participantes
               (uuid, empresa_id, segmento_id, participante_id, funcao, duracao_minutos, atribuicao_curricular_id)
             VALUES (?, ?, ${segmentIdExpr}, ?, ?, ?, ${assignmentExpr})`,
            crypto.randomUUID(),
            empresaId,
            ...segmentIdBinds,
            participantId,
            participante.funcao,
            segmento.duracao_minutos,
            ...assignmentBinds,
          ),
        );
      }
    }

    if (existingId) {
      for (const currentParticipant of state.segmentById.get(existingId)?.participantes || []) {
        const removalKey = `${existingId}:${Number(currentParticipant.funcionario_id)}`;
        if (desiredSegmentParticipantKeys.has(removalKey)) {
          continue;
        }
        statements.push(
          prepareStatement(
            db,
            "UPDATE simulador_segmento_participantes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE segmento_id = ? AND empresa_id = ? AND participante_id = (SELECT id FROM sessoes_participantes WHERE sessao_id = ? AND funcionario_id = ? AND deleted_at IS NULL LIMIT 1) AND deleted_at IS NULL",
            existingId,
            empresaId,
            sessaoId,
            Number(currentParticipant.funcionario_id),
          ),
        );
      }
    }

    for (const participanteCurricular of segmento.participantes.filter((item) => item.cumpre_treinamento)) {
      if (!participanteCurricular.assignment_key) {
        continue;
      }

      const existingAssignment = state.assignmentByKey.get(participanteCurricular.assignment_key) || null;
      const newAssignmentUuid = newAssignmentUuidByKey.get(participanteCurricular.assignment_key) || null;
      const assignmentExpr = existingAssignment
        ? '?'
        : '(SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?)';
      const assignmentBinds = existingAssignment
        ? [existingAssignment.id]
        : [newAssignmentUuid];
      const desiredLinkKey = `${existingId || identity}:${participanteCurricular.assignment_key}`;
      desiredLinkKeys.add(desiredLinkKey);

      const existingLink = existingId
        ? state.linkByKey.get(`${existingId}:${participanteCurricular.assignment_key}`) || null
        : null;

      let linkIdExpr = '(SELECT id FROM simulador_segmento_atribuicoes WHERE uuid = ?)';
      let linkIdBinds: unknown[] = [];

      if (existingLink) {
        const protectedLink =
          String(existingLink.status || '').toUpperCase() === 'CUMPRIDA' ||
          (state.fichasByLinkId.get(Number(existingLink.id)) || []).some((ficha) =>
            isProtectedFichaStatus((ficha as any).status),
          );

        if (!protectedLink) {
          statements.push(
            prepareStatement(
              db,
              `UPDATE simulador_segmento_atribuicoes
               SET status = 'PLANEJADA',
                   gera_ficha = ?,
                   deleted_at = NULL,
                   updated_at = datetime('now')
               WHERE id = ?
                 AND empresa_id = ?`,
              participanteCurricular.gera_ficha ? 1 : 0,
              Number(existingLink.id),
              empresaId,
            ),
          );
        }

        linkIdExpr = '?';
        linkIdBinds = [Number(existingLink.id)];
      } else {
        const linkUuid = crypto.randomUUID();
        linkIdBinds = [linkUuid];
        statements.push(
          prepareStatement(
            db,
            `INSERT INTO simulador_segmento_atribuicoes
               (uuid, empresa_id, segmento_id, atribuicao_curricular_id, status, gera_ficha)
             VALUES (?, ?, ${segmentIdExpr}, ${assignmentExpr}, 'PLANEJADA', ?)`,
            linkUuid,
            empresaId,
            ...segmentIdBinds,
            ...assignmentBinds,
            participanteCurricular.gera_ficha ? 1 : 0,
          ),
        );
      }

      const assignmentKey = participanteCurricular.assignment_key;
      if (!assignmentKey || processedFichaAssignments.has(assignmentKey)) {
        continue;
      }
      processedFichaAssignments.add(assignmentKey);

      const assignmentId =
        existingAssignment?.id ||
        null;
      const existingFichas =
        assignmentId && assignmentId > 0
          ? state.fichasByAssignmentId.get(Number(assignmentId)) || []
          : [];
      const activeFicha = existingFichas[0] || null;

      if (participanteCurricular.gera_ficha && participanteCurricular.modelo_sessao_id) {
        const modelo = modelosMap.get(Number(participanteCurricular.modelo_sessao_id));
        if (activeFicha) {
          if (!isProtectedFichaStatus((activeFicha as any).status)) {
            statements.push(
              prepareStatement(
                db,
                `UPDATE fichas_sessao
                 SET instrutor_id = ?,
                     tipo_sessao = ?,
                     tipo_aeronave = ?,
                     data_sessao = ?,
                     template_id = ?,
                     segmento_atribuicao_id = NULL,
                     deleted_at = NULL,
                     updated_at = datetime('now')
                 WHERE id = ?
                   AND empresa_id = ?`,
                payload.instrutor_id,
                modelo?.codigo || primaryModel?.codigo || 'SHARED',
                simulatorModel,
                payload.data,
                participanteCurricular.modelo_sessao_id,
                Number((activeFicha as any).id),
                empresaId,
              ),
            );
          }
        } else {
          const fichaUuid = crypto.randomUUID();
          statements.push(
            prepareStatement(
              db,
              `INSERT INTO fichas_sessao
                 (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id, atribuicao_curricular_id, segmento_atribuicao_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?, ${assignmentExpr}, NULL)`,
              fichaUuid,
              sessaoId,
              participanteCurricular.funcionario_id,
              payload.instrutor_id,
              modelo?.codigo || primaryModel?.codigo || 'SHARED',
              simulatorModel,
              payload.data,
              participanteCurricular.modelo_sessao_id,
              empresaId,
              ...assignmentBinds,
            ),
          );

          const manobras = await loadFichaManobrasForModelo(db, Number(participanteCurricular.modelo_sessao_id));
          assertModeloSessaoTemManobras(Number(participanteCurricular.modelo_sessao_id), manobras);
          for (const manobra of manobras) {
            statements.push(
              prepareStatement(
                db,
                `INSERT INTO fichas_sessao_manobras
                   (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, empresa_id)
                 VALUES ((SELECT id FROM fichas_sessao WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?)`,
                fichaUuid,
                manobra.codigo,
                manobra.nome,
                manobra.descricao || manobra.nome,
                manobra.categoria || 'GERAL',
                manobra.ordem,
                manobra.tripulante || 'AB',
                empresaId,
              ),
            );
          }
        }
      } else if (activeFicha && !isProtectedFichaStatus((activeFicha as any).status)) {
        statements.push(
          prepareStatement(
            db,
            "UPDATE fichas_sessao SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
            Number((activeFicha as any).id),
            empresaId,
          ),
        );
      }
    }

    if (existingId) {
      for (const currentLink of state.segmentById.get(existingId)?.atribuicoes_curriculares || []) {
        const removalKey = `${existingId}:${String(currentLink.assignment_key || '')}`;
        if (desiredLinkKeys.has(removalKey)) {
          continue;
        }
        const protectedLink =
          String(currentLink.status || '').toUpperCase() === 'CUMPRIDA' ||
          (state.fichasByLinkId.get(Number(currentLink.id)) || []).some((ficha) =>
            isProtectedFichaStatus((ficha as any).status),
          );
        if (protectedLink) {
          continue;
        }
        statements.push(
          prepareStatement(
            db,
            "UPDATE simulador_segmento_atribuicoes SET status = 'CANCELADA', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
            Number(currentLink.id),
            empresaId,
          ),
        );
      }
    }
  }

  for (const [assignmentKey, currentAssignment] of state.assignmentByKey.entries()) {
    if (desiredAssignmentKeys.has(assignmentKey)) {
      continue;
    }

    statements.push(
      prepareStatement(
        db,
        "UPDATE simulador_atribuicoes_curriculares SET status = 'CANCELADA', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
        currentAssignment.id,
        empresaId,
      ),
      prepareStatement(
        db,
        "UPDATE fichas_sessao SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE atribuicao_curricular_id = ? AND empresa_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(status, 'AVALIACAO_PENDENTE')) NOT IN ('APROVADO', 'NAO_APROVADO', 'CONCLUIDA')",
        currentAssignment.id,
        empresaId,
      ),
    );
  }

  await db.batch(statements);
}
