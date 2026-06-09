import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import {
  audit,
  criarQualificacoesPlanejadas,
  findSessaoConflict,
  getSimuladorModeloAeronave,
  timeToMinutes,
} from './simuladores-shared';
import {
  calculateSharedSessionParticipantSummaries,
  createSharedCurricularSignature,
  type NormalizedSharedSessionRequest,
  validateAndNormalizeSharedSessionRequest,
} from './simuladores-shared-session-logic';

type ModeloSessaoMapRow = {
  id: number;
  codigo: string | null;
  nome: string | null;
  tipo_sessao_codigo: string | null;
  gera_qualificacao: number | null;
  qualificacao_tipo_id: number | null;
};

type SharedPersistenceContext = {
  participanteIds: number[];
  atribuicaoIds: number[];
  segmentoIds: number[];
  segmentoParticipanteIds: number[];
  fichaIds: number[];
};

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

function isSharedSessionsEnabled(env: Env): boolean {
  return env.SIMULATOR_SHARED_SESSIONS_ENABLED === 'true';
}

function isProtectedFichaStatus(status: unknown): boolean {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  return ['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'].includes(normalized);
}

async function runStatement(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).run();
}

async function firstStatement<T>(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).first<T>();
}

async function allStatement<T>(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).all<T>();
}

function prepareStatement(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args);
}

async function assertSharedFeature(c: any) {
  if (!isSharedSessionsEnabled(c.env)) {
    return c.json({ success: false, error: 'Shared simulator sessions feature disabled' }, 404);
  }
  return null;
}

async function getSimuladorAgendamentosColumns(db: D1Database): Promise<Set<string>> {
  const tableInfo = await db.prepare('PRAGMA table_info(simulador_agendamentos)').all<{ name: string }>();
  return new Set((tableInfo.results || []).map((row) => row.name));
}

async function loadModelosSessaoMap(
  db: D1Database,
  empresaId: number,
  modeloIds: number[],
): Promise<Map<number, ModeloSessaoMapRow>> {
  const uniqueIds = Array.from(new Set(modeloIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT
         ms.id,
         ms.codigo,
         ms.nome,
         ts.codigo AS tipo_sessao_codigo,
         ms.gera_qualificacao,
         ms.qualificacao_tipo_id
       FROM modelos_sessao ms
       LEFT JOIN tipos_sessao ts
         ON ts.id = ms.tipo_sessao_id
        AND ts.deleted_at IS NULL
        AND ts.empresa_id = ?
       WHERE ms.id IN (${placeholders})
         AND ms.deleted_at IS NULL
         AND ms.empresa_id = ?`,
    )
    .bind(empresaId, ...uniqueIds, empresaId)
    .all<ModeloSessaoMapRow>();

  const map = new Map<number, ModeloSessaoMapRow>();
  for (const row of rows.results || []) {
    map.set(Number(row.id), row);
  }
  return map;
}

async function assertEntityOwnership(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest,
): Promise<Map<number, ModeloSessaoMapRow>> {
  const participantIds = payload.participantes.map((item) => item.funcionario_id);
  const participantPlaceholders = participantIds.map(() => '?').join(',');
  const participantCount = await db
    .prepare(
      `SELECT COUNT(DISTINCT id) AS total
       FROM funcionarios
       WHERE id IN (${participantPlaceholders})
         AND empresa_id = ?
         AND deleted_at IS NULL`,
    )
    .bind(...participantIds, empresaId)
    .first<{ total: number }>();

  if (Number(participantCount?.total || 0) !== participantIds.length) {
    throw new Error('Participante fora do tenant');
  }

  const instrutor = await db
    .prepare(
      `SELECT id
       FROM funcionarios
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL`,
    )
    .bind(payload.instrutor_id, empresaId)
    .first();
  if (!instrutor) {
    throw new Error('Instrutor fora do tenant');
  }

  const simulador = await db
    .prepare(
      `SELECT id
       FROM simuladores
       WHERE id = ?
         AND deleted_at IS NULL`,
    )
    .bind(payload.simulador_id)
    .first();
  if (!simulador) {
    throw new Error('Simulador não encontrado');
  }

  const modeloIds = payload.participantes
    .map((item) => Number(item.modelo_sessao_id || 0))
    .filter((id) => Number.isInteger(id) && id > 0);
  const uniqueModeloIds = Array.from(new Set(modeloIds));
  const modelosMap = await loadModelosSessaoMap(db, empresaId, modeloIds);
  if (modelosMap.size !== uniqueModeloIds.length) {
    throw new Error('Modelo de sessão fora do tenant');
  }

  const treinamentoIds = payload.participantes
    .map((item) => Number(item.treinamento_planejado_id || 0))
    .filter((id) => Number.isInteger(id) && id > 0);
  const uniqueTreinamentoIds = Array.from(new Set(treinamentoIds));
  if (uniqueTreinamentoIds.length > 0) {
    const placeholders = uniqueTreinamentoIds.map(() => '?').join(',');
    const trainings = await db
      .prepare(
        `SELECT COUNT(DISTINCT id) AS total
         FROM treinamentos_planejados
         WHERE id IN (${placeholders})
           AND empresa_id = ?
           AND deleted_at IS NULL`,
      )
      .bind(...uniqueTreinamentoIds, empresaId)
      .first<{ total: number }>();
    if (Number(trainings?.total || 0) !== uniqueTreinamentoIds.length) {
      throw new Error('Treinamento planejado fora do tenant');
    }
  }

  return modelosMap;
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

async function findInstrutorConflict(
  db: D1Database,
  params: {
    empresaId: number;
    instrutorId: number;
    data: string;
    inicioMin: number;
    fimMin: number;
    excludeId?: number;
  },
) {
  const rows = await db
    .prepare(
      `SELECT id, hora_inicio, hora_fim
       FROM simulador_agendamentos
       WHERE deleted_at IS NULL
         AND empresa_id = ?
         AND instrutor_id = ?
         AND data = ?
         ${params.excludeId ? 'AND id != ?' : ''}`,
    )
    .bind(
      params.empresaId,
      params.instrutorId,
      params.data,
      ...(params.excludeId ? [params.excludeId] : []),
    )
    .all<{ id: number; hora_inicio: string; hora_fim: string }>();

  for (const row of rows.results || []) {
    const start = timeToMinutes(row.hora_inicio);
    const end = timeToMinutes(row.hora_fim);
    if (start === null || end === null) continue;
    if (overlaps(params.inicioMin, params.fimMin, start, end)) {
      return row;
    }
  }

  return null;
}

async function findParticipanteConflict(
  db: D1Database,
  params: {
    empresaId: number;
    funcionarioId: number;
    data: string;
    inicioMin: number;
    fimMin: number;
    excludeId?: number;
  },
) {
  const rows = await db
    .prepare(
      `SELECT sa.id, sa.hora_inicio, sa.hora_fim
       FROM simulador_agendamentos sa
       INNER JOIN sessoes_participantes sp
         ON sp.sessao_id = sa.id
        AND sp.deleted_at IS NULL
        AND sp.funcionario_id = ?
       WHERE sa.deleted_at IS NULL
         AND sa.empresa_id = ?
         AND sa.data = ?
         ${params.excludeId ? 'AND sa.id != ?' : ''}`,
    )
    .bind(
      params.funcionarioId,
      params.empresaId,
      params.data,
      ...(params.excludeId ? [params.excludeId] : []),
    )
    .all<{ id: number; hora_inicio: string; hora_fim: string }>();

  for (const row of rows.results || []) {
    const start = timeToMinutes(row.hora_inicio);
    const end = timeToMinutes(row.hora_fim);
    if (start === null || end === null) continue;
    if (overlaps(params.inicioMin, params.fimMin, start, end)) {
      return row;
    }
  }

  return null;
}

async function assertNoExternalConflicts(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest,
  excludeSessaoId?: number,
) {
  const inicioMin = timeToMinutes(payload.hora_inicio);
  const fimMin = timeToMinutes(payload.hora_fim);
  if (inicioMin === null || fimMin === null) {
    throw new Error('Horários inválidos');
  }

  const simuladorConflict = await findSessaoConflict(db, {
    simuladorId: payload.simulador_id,
    data: payload.data,
    inicioMin,
    fimMin,
    excludeId: excludeSessaoId,
  });
  if (simuladorConflict) {
    throw new Error('Conflito externo de simulador');
  }

  const instrutorConflict = await findInstrutorConflict(db, {
    empresaId,
    instrutorId: payload.instrutor_id,
    data: payload.data,
    inicioMin,
    fimMin,
    excludeId: excludeSessaoId,
  });
  if (instrutorConflict) {
    throw new Error('Conflito externo de instrutor');
  }

  for (const participante of payload.participantes) {
    const participantConflict = await findParticipanteConflict(db, {
      empresaId,
      funcionarioId: participante.funcionario_id,
      data: payload.data,
      inicioMin,
      fimMin,
      excludeId: excludeSessaoId,
    });
    if (participantConflict) {
      throw new Error(`Conflito externo de participante: ${participante.funcionario_id}`);
    }
  }
}

async function insertFichaManobrasFromModelo(
  db: D1Database,
  fichaId: number,
  modeloSessaoId: number,
) {
  const manobras = await db
    .prepare(
      `SELECT
         m.codigo,
         COALESCE(m.nome, m.descricao) AS nome,
         m.descricao,
         m.categoria,
         msm.ordem,
         COALESCE(msm.tripulante, 'AB') AS tripulante
       FROM modelos_sessao_manobras msm
       INNER JOIN manobras m
         ON m.id = msm.manobra_id
        AND m.deleted_at IS NULL
       WHERE msm.modelo_id = ?
         AND msm.deleted_at IS NULL
       ORDER BY msm.ordem ASC`,
    )
    .bind(modeloSessaoId)
    .all<{
      codigo: string;
      nome: string;
      descricao: string | null;
      categoria: string | null;
      ordem: number;
      tripulante: string | null;
    }>();

  const statements = (manobras.results || []).map((manobra) =>
    db
      .prepare(
        `INSERT INTO fichas_sessao_manobras
           (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        fichaId,
        manobra.codigo,
        manobra.nome,
        manobra.descricao || manobra.nome,
        manobra.categoria || 'GERAL',
        manobra.ordem,
        manobra.tripulante || 'AB',
      ),
  );

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

async function cleanupFailedSharedCreate(db: D1Database, sessaoId: number) {
  await runStatement(
    db,
    'DELETE FROM simulador_segmento_participantes WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ?)',
    sessaoId,
  );
  await runStatement(db, 'DELETE FROM simulador_agendamento_segmentos WHERE agendamento_id = ?', sessaoId);
  await runStatement(
    db,
    'DELETE FROM fichas_sessao_manobras WHERE ficha_id IN (SELECT id FROM fichas_sessao WHERE agendamento_slot_id = ?)',
    sessaoId,
  );
  await runStatement(db, 'DELETE FROM fichas_sessao WHERE agendamento_slot_id = ?', sessaoId);
  await runStatement(
    db,
    'DELETE FROM simulador_atribuicoes_curriculares WHERE agendamento_id = ?',
    sessaoId,
  );
  await runStatement(db, 'DELETE FROM sessoes_participantes WHERE sessao_id = ?', sessaoId);
  await runStatement(
    db,
    'DELETE FROM qualificacoes_historico WHERE sessao_id = ? AND deleted_at IS NULL',
    sessaoId,
  );
  await runStatement(db, 'DELETE FROM simulador_agendamentos WHERE id = ?', sessaoId);
}

async function loadSharedDetail(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
) {
  const sessao = await firstStatement<any>(
    db,
    `SELECT
         id,
         uuid,
         simulador_id,
         funcionario_id,
         data,
         hora_inicio,
         hora_fim,
         duracao_minutos,
         instrutor_id,
         tipo_sessao,
         template_id,
         status,
         observacoes,
         nome,
         empresa_id,
         modo_compartilhado,
         deleted_at
       FROM simulador_agendamentos
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
         AND COALESCE(modo_compartilhado, 0) = 1`,
    sessaoId,
    empresaId,
  );
  if (!sessao) {
    return null;
  }

  const participantes = await db
    .prepare(
      `SELECT sp.id,
              sp.funcionario_id,
              sp.funcao,
              f.nome AS funcionario_nome,
              f.guerra AS funcionario_guerra
       FROM sessoes_participantes sp
       INNER JOIN funcionarios f
         ON f.id = sp.funcionario_id
        AND f.deleted_at IS NULL
       WHERE sp.sessao_id = ?
         AND sp.deleted_at IS NULL
       ORDER BY sp.id`,
    )
    .bind(sessaoId)
    .all<any>();

  const atribuicoes = await db
    .prepare(
      `SELECT sac.*,
              sp.funcionario_id,
              f.nome AS funcionario_nome,
              ms.codigo AS modelo_codigo,
              ms.nome AS modelo_nome
       FROM simulador_atribuicoes_curriculares sac
       INNER JOIN sessoes_participantes sp
         ON sp.id = sac.participante_id
        AND sp.deleted_at IS NULL
       INNER JOIN funcionarios f
         ON f.id = sp.funcionario_id
        AND f.deleted_at IS NULL
       LEFT JOIN modelos_sessao ms
         ON ms.id = sac.modelo_sessao_id
        AND ms.deleted_at IS NULL
       WHERE sac.agendamento_id = ?
         AND sac.deleted_at IS NULL
       ORDER BY sac.id`,
    )
    .bind(sessaoId)
    .all<any>();

  const segmentos = await allStatement<any>(
    db,
    `SELECT
         id,
         uuid,
         empresa_id,
         agendamento_id,
         ordem,
         inicio,
         fim,
         duracao_minutos,
         atribuicao_curricular_id,
         status,
         created_at,
         updated_at,
         deleted_at
       FROM simulador_agendamento_segmentos
       WHERE agendamento_id = ?
         AND deleted_at IS NULL
       ORDER BY ordem ASC`,
    sessaoId,
  );

  const segmentoParticipantes = await db
    .prepare(
      `SELECT ssp.*,
              sp.funcionario_id
       FROM simulador_segmento_participantes ssp
       INNER JOIN sessoes_participantes sp
         ON sp.id = ssp.participante_id
        AND sp.deleted_at IS NULL
       WHERE ssp.segmento_id IN (
         SELECT id
         FROM simulador_agendamento_segmentos
         WHERE agendamento_id = ?
           AND deleted_at IS NULL
       )
         AND ssp.deleted_at IS NULL
       ORDER BY ssp.segmento_id, ssp.id`,
    )
    .bind(sessaoId)
    .all<any>();

  const fichas = await db
    .prepare(
      `SELECT fs.*,
              f.nome AS aluno_nome
       FROM fichas_sessao fs
       INNER JOIN funcionarios f
         ON f.id = fs.colaborador_id_aluno
        AND f.deleted_at IS NULL
       WHERE fs.agendamento_slot_id = ?
         AND fs.deleted_at IS NULL
       ORDER BY fs.id`,
    )
    .bind(sessaoId)
    .all<any>();

  const summaries = calculateSharedSessionParticipantSummaries(
    (participantes.results || []).map((participante) => {
      const atribuicao = (atribuicoes.results || []).find(
        (item) => Number(item.funcionario_id) === Number(participante.funcionario_id),
      );
      return {
        funcionario_id: Number(participante.funcionario_id),
        cumpre_treinamento: Boolean(atribuicao),
        gera_ficha: Boolean(atribuicao?.gera_ficha),
      };
    }),
    (segmentos.results || []).map((segmento) => ({
      duracao_minutos: Number(segmento.duracao_minutos || 0),
      atribuicao_funcionario_id:
        (atribuicoes.results || []).find((item) => Number(item.id) === Number(segmento.atribuicao_curricular_id))
          ?.funcionario_id ?? null,
      funcoes: (segmentoParticipantes.results || [])
        .filter((item) => Number(item.segmento_id) === Number(segmento.id))
        .map((item) => ({
          funcionario_id: Number(item.funcionario_id),
          funcao: String(item.funcao || 'PF').toUpperCase() as 'PF' | 'PM',
        })),
    })),
  );

  return {
    sessao,
    participantes: participantes.results || [],
    atribuicoes: atribuicoes.results || [],
    segmentos: (segmentos.results || []).map((segmento) => ({
      ...segmento,
      funcoes: (segmentoParticipantes.results || []).filter(
        (item) => Number(item.segmento_id) === Number(segmento.id),
      ),
    })),
    fichas: fichas.results || [],
    resumo_participantes: summaries,
  };
}

type SharedBatchPlan = {
  sessaoId: number | null;
  sessaoUuid: string;
  persistence: SharedPersistenceContext;
  statements: D1PreparedStatement[];
};

async function loadFichaManobrasForModelo(
  db: D1Database,
  modeloSessaoId: number,
): Promise<
  Array<{
    codigo: string;
    nome: string;
    descricao: string | null;
    categoria: string | null;
    ordem: number;
    tripulante: string | null;
  }>
> {
  const manobras = await db
    .prepare(
      `SELECT
         m.codigo,
         COALESCE(m.nome, m.descricao) AS nome,
         m.descricao,
         m.categoria,
         msm.ordem,
         COALESCE(msm.tripulante, 'AB') AS tripulante
       FROM modelos_sessao_manobras msm
       INNER JOIN manobras m
         ON m.id = msm.manobra_id
        AND m.deleted_at IS NULL
       WHERE msm.modelo_id = ?
         AND msm.deleted_at IS NULL
       ORDER BY msm.ordem ASC`,
    )
    .bind(modeloSessaoId)
    .all<{
      codigo: string;
      nome: string;
      descricao: string | null;
      categoria: string | null;
      ordem: number;
      tripulante: string | null;
    }>();

  return manobras.results || [];
}

async function buildSharedSessionBatchPlan(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
  existingSessaoId?: number,
): Promise<SharedBatchPlan> {
  const columns = await getSimuladorAgendamentosColumns(db);
  const modoCompartilhadoSupported = columns.has('modo_compartilhado');
  const tipoDispositivoSupported = columns.has('tipo_dispositivo');
  const aeronaveIdSupported = columns.has('aeronave_id');
  const sessaoUuid = crypto.randomUUID();
  const simulatorModel = await getSimuladorModeloAeronave(db, payload.simulador_id);

  const primaryParticipant = payload.participantes[0];
  const primaryAssignment = payload.participantes.find((item) => item.cumpre_treinamento) || primaryParticipant;
  const primaryModel = primaryAssignment.modelo_sessao_id
    ? modelosMap.get(Number(primaryAssignment.modelo_sessao_id))
    : null;
  const durationMinutes =
    payload.segmentos.reduce((sum, segmento) => sum + Number(segmento.duracao_minutos || 0), 0);

  const persistence: SharedPersistenceContext = {
    participanteIds: [],
    atribuicaoIds: [],
    segmentoIds: [],
    segmentoParticipanteIds: [],
    fichaIds: [],
  };

  const statements: D1PreparedStatement[] = [];
  const sessionIdExpr = existingSessaoId ? '?' : '(SELECT id FROM simulador_agendamentos WHERE uuid = ?)';
  const sessionIdBinds = existingSessaoId ? [Number(existingSessaoId)] : [sessaoUuid];

  if (existingSessaoId) {
    statements.push(
      prepareStatement(
        db,
        "UPDATE simulador_segmento_participantes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL",
        existingSessaoId,
      ),
    );
    statements.push(
      prepareStatement(
        db,
        "UPDATE simulador_agendamento_segmentos SET deleted_at = datetime('now'), updated_at = datetime('now'), status = 'CANCELADO' WHERE agendamento_id = ? AND deleted_at IS NULL",
        existingSessaoId,
      ),
    );
    statements.push(
      prepareStatement(
        db,
        "UPDATE fichas_sessao SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE agendamento_slot_id = ? AND deleted_at IS NULL",
        existingSessaoId,
      ),
    );
    statements.push(
      prepareStatement(
        db,
        "UPDATE simulador_atribuicoes_curriculares SET deleted_at = datetime('now'), updated_at = datetime('now'), status = 'CANCELADA' WHERE agendamento_id = ? AND deleted_at IS NULL",
        existingSessaoId,
      ),
    );
    statements.push(
      prepareStatement(
        db,
        "UPDATE sessoes_participantes SET deleted_at = datetime('now') WHERE sessao_id = ? AND deleted_at IS NULL",
        existingSessaoId,
      ),
    );
    statements.push(
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
        existingSessaoId,
        empresaId,
      ),
    );
  } else {
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
  }

  const participantUuidByFuncionario = new Map<number, string>();
  const assignmentUuidByFuncionario = new Map<number, string>();

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

  for (const participantSummary of payload.resumo_participantes) {
    const participant = payload.participantes.find(
      (item) => item.funcionario_id === participantSummary.funcionario_id,
    );
    if (!participant?.cumpre_treinamento) {
      continue;
    }

    const atribuicaoUuid = crypto.randomUUID();
    assignmentUuidByFuncionario.set(participant.funcionario_id, atribuicaoUuid);
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
          participantUuidByFuncionario.get(participant.funcionario_id),
          participant.treinamento_planejado_id || null,
          participant.modelo_sessao_id || null,
          participant.gera_ficha ? 1 : 0,
          participantSummary.curricular_minutos,
        ),
    );

    const modelo = participant.modelo_sessao_id
      ? modelosMap.get(Number(participant.modelo_sessao_id))
      : null;

    if (participant.gera_ficha && participant.modelo_sessao_id) {
      const fichaUuid = crypto.randomUUID();
      persistence.fichaIds.push(persistence.fichaIds.length + 1);

      statements.push(
        db
          .prepare(
            `INSERT INTO fichas_sessao
               (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id, atribuicao_curricular_id)
             VALUES (?, ${sessionIdExpr}, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?, (SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?))`,
          )
          .bind(
            fichaUuid,
            ...sessionIdBinds,
            participant.funcionario_id,
            payload.instrutor_id,
            modelo?.codigo || primaryModel?.codigo || 'SHARED',
            simulatorModel,
            payload.data,
            participant.modelo_sessao_id,
            empresaId,
            atribuicaoUuid,
          ),
      );

      const manobras = await loadFichaManobrasForModelo(db, Number(participant.modelo_sessao_id));
      for (const manobra of manobras) {
        statements.push(
          db
            .prepare(
              `INSERT INTO fichas_sessao_manobras
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
            ),
        );
      }
    }
  }

  for (const segmento of payload.segmentos) {
    const segmentoUuid = crypto.randomUUID();
    persistence.segmentoIds.push(persistence.segmentoIds.length + 1);

    statements.push(
      db
        .prepare(
          `INSERT INTO simulador_agendamento_segmentos
             (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, status)
           VALUES (?, ?, ${sessionIdExpr}, ?, ?, ?, ?, ?, 'ATIVO')`,
        )
        .bind(
          segmentoUuid,
          empresaId,
          ...sessionIdBinds,
          segmento.ordem,
          segmento.inicio,
          segmento.fim,
          segmento.duracao_minutos,
          segmento.atribuicao_funcionario_id
            ? `(SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = '${assignmentUuidByFuncionario.get(segmento.atribuicao_funcionario_id) || ''}')`
            : null,
        ),
    );

    if (segmento.atribuicao_funcionario_id) {
      statements.pop();
      statements.push(
        db
          .prepare(
            `INSERT INTO simulador_agendamento_segmentos
               (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, status)
             VALUES (?, ?, ${sessionIdExpr}, ?, ?, ?, ?, (SELECT id FROM simulador_atribuicoes_curriculares WHERE uuid = ?), 'ATIVO')`,
          )
          .bind(
            segmentoUuid,
            empresaId,
            ...sessionIdBinds,
            segmento.ordem,
            segmento.inicio,
            segmento.fim,
            segmento.duracao_minutos,
            assignmentUuidByFuncionario.get(segmento.atribuicao_funcionario_id) || null,
          ),
      );
    }

    for (const funcao of segmento.funcoes) {
      persistence.segmentoParticipanteIds.push(persistence.segmentoParticipanteIds.length + 1);
      const assignmentUuid =
        segmento.atribuicao_funcionario_id === funcao.funcionario_id
          ? assignmentUuidByFuncionario.get(funcao.funcionario_id) || null
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

  return {
    sessaoId: existingSessaoId ? Number(existingSessaoId) : null,
    sessaoUuid,
    persistence,
    statements,
  };
}

async function createSharedSessionStructureTransactional(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
  existingSessaoId?: number,
): Promise<{ sessaoId: number; persistence: SharedPersistenceContext }> {
  const plan = await buildSharedSessionBatchPlan(db, empresaId, payload, modelosMap, existingSessaoId);
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

async function updateSharedSessionStructureTransactional(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
  current: any,
): Promise<void> {
  const participantIdByFuncionario = new Map<number, number>(
    (current.participantes || []).map((participante: any) => [
      Number(participante.funcionario_id),
      Number(participante.id),
    ]),
  );
  const assignmentIdByFuncionario = new Map<number, number>(
    (current.atribuicoes || []).map((atribuicao: any) => [
      Number(atribuicao.funcionario_id),
      Number(atribuicao.id),
    ]),
  );
  const primaryParticipant = payload.participantes[0];
  const primaryAssignment =
    payload.participantes.find((participante) => participante.cumpre_treinamento) ||
    primaryParticipant;
  const primaryModel = primaryAssignment.modelo_sessao_id
    ? modelosMap.get(Number(primaryAssignment.modelo_sessao_id))
    : null;
  const simulatorModel = await getSimuladorModeloAeronave(db, payload.simulador_id);
  const durationMinutes = payload.segmentos.reduce(
    (sum, segmento) => sum + Number(segmento.duracao_minutos || 0),
    0,
  );
  const statements: D1PreparedStatement[] = [
    prepareStatement(
      db,
      "UPDATE simulador_segmento_participantes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL",
      sessaoId,
    ),
    prepareStatement(
      db,
      "UPDATE simulador_agendamento_segmentos SET deleted_at = datetime('now'), updated_at = datetime('now'), status = 'CANCELADO' WHERE agendamento_id = ? AND deleted_at IS NULL",
      sessaoId,
    ),
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

  for (const [index, participant] of payload.participantes.entries()) {
    const participantId = participantIdByFuncionario.get(participant.funcionario_id);
    if (!participantId) {
      throw new Error(`Participante ${participant.funcionario_id} não pertence à sessão compartilhada`);
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

  for (const summary of payload.resumo_participantes) {
    const participant = payload.participantes.find(
      (item) => item.funcionario_id === summary.funcionario_id,
    );
    if (!participant?.cumpre_treinamento) {
      continue;
    }
    const assignmentId = assignmentIdByFuncionario.get(summary.funcionario_id);
    if (!assignmentId) {
      throw new Error(`Atribuição curricular de ${summary.funcionario_id} não pertence à sessão`);
    }
    const model = participant.modelo_sessao_id
      ? modelosMap.get(Number(participant.modelo_sessao_id))
      : null;
    statements.push(
      prepareStatement(
        db,
        `UPDATE simulador_atribuicoes_curriculares
         SET carga_horaria_total_minutos = ?,
             updated_at = datetime('now')
         WHERE id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
        summary.curricular_minutos,
        assignmentId,
        empresaId,
      ),
      prepareStatement(
        db,
        `UPDATE fichas_sessao
         SET instrutor_id = ?,
             tipo_sessao = ?,
             tipo_aeronave = ?,
             data_sessao = ?,
             template_id = ?,
             updated_at = datetime('now')
         WHERE atribuicao_curricular_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
        payload.instrutor_id,
        model?.codigo || primaryModel?.codigo || 'SHARED',
        simulatorModel,
        payload.data,
        participant.modelo_sessao_id || null,
        assignmentId,
        empresaId,
      ),
    );
  }

  for (const segmento of payload.segmentos) {
    const segmentoUuid = crypto.randomUUID();
    const assignmentId = segmento.atribuicao_funcionario_id
      ? assignmentIdByFuncionario.get(segmento.atribuicao_funcionario_id) || null
      : null;
    statements.push(
      prepareStatement(
        db,
        `INSERT INTO simulador_agendamento_segmentos
           (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')`,
        segmentoUuid,
        empresaId,
        sessaoId,
        segmento.ordem,
        segmento.inicio,
        segmento.fim,
        segmento.duracao_minutos,
        assignmentId,
      ),
    );

    for (const funcao of segmento.funcoes) {
      const participantId = participantIdByFuncionario.get(funcao.funcionario_id);
      if (!participantId) {
        throw new Error(`Participante ${funcao.funcionario_id} não pertence à sessão compartilhada`);
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO simulador_segmento_participantes
               (uuid, empresa_id, segmento_id, participante_id, funcao, duracao_minutos, atribuicao_curricular_id)
             VALUES (?, ?, (SELECT id FROM simulador_agendamento_segmentos WHERE uuid = ?), ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            empresaId,
            segmentoUuid,
            participantId,
            funcao.funcao,
            segmento.duracao_minutos,
            segmento.atribuicao_funcionario_id === funcao.funcionario_id ? assignmentId : null,
          ),
      );
    }
  }

  await db.batch(statements);
}

async function createSharedSessionStructure(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest,
  modelosMap: Map<number, ModeloSessaoMapRow>,
  existingSessaoId?: number,
): Promise<{ sessaoId: number; persistence: SharedPersistenceContext }> {
  const columns = await getSimuladorAgendamentosColumns(db);
  const modoCompartilhadoSupported = columns.has('modo_compartilhado');
  const tipoDispositivoSupported = columns.has('tipo_dispositivo');
  const aeronaveIdSupported = columns.has('aeronave_id');

  const primaryParticipant = payload.participantes[0];
  const primaryAssignment = payload.participantes.find((item) => item.cumpre_treinamento) || primaryParticipant;
  const primaryModel = primaryAssignment.modelo_sessao_id
    ? modelosMap.get(Number(primaryAssignment.modelo_sessao_id))
    : null;
  const durationMinutes =
    payload.segmentos.reduce((sum, segmento) => sum + Number(segmento.duracao_minutos || 0), 0);

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
  const binds = [
    crypto.randomUUID(),
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
  ];

  const sessaoId = existingSessaoId
    ? Number(existingSessaoId)
    : Number(
        (
          await db
            .prepare(
              `INSERT INTO simulador_agendamentos (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
            )
            .bind(...binds)
            .run()
        ).meta.last_row_id,
      );

  const persistence: SharedPersistenceContext = {
    participanteIds: [],
    atribuicaoIds: [],
    segmentoIds: [],
    segmentoParticipanteIds: [],
    fichaIds: [],
  };

  const participantMap = new Map<number, number>();
  for (const [index, participante] of payload.participantes.entries()) {
    const insertParticipant = await db
      .prepare(
        `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
         VALUES (?, ?, ?, ?, 'CONFIRMADO')`,
      )
      .bind(
        crypto.randomUUID(),
        sessaoId,
        participante.funcionario_id,
        index === 0 ? 'PIC' : 'SIC',
      )
      .run();
    const participantId = Number(insertParticipant.meta.last_row_id);
    participantMap.set(participante.funcionario_id, participantId);
    persistence.participanteIds.push(participantId);
  }

  const atribuicaoMap = new Map<number, number>();
  for (const participantSummary of payload.resumo_participantes) {
    const participant = payload.participantes.find(
      (item) => item.funcionario_id === participantSummary.funcionario_id,
    );
    if (!participant?.cumpre_treinamento) {
      continue;
    }

    const insertAtribuicao = await db
      .prepare(
        `INSERT INTO simulador_atribuicoes_curriculares
           (uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVA')`,
      )
      .bind(
        crypto.randomUUID(),
        empresaId,
        sessaoId,
        participantMap.get(participant.funcionario_id),
        participant.treinamento_planejado_id || null,
        participant.modelo_sessao_id || null,
        participant.gera_ficha ? 1 : 0,
        participantSummary.curricular_minutos,
      )
      .run();
    const atribuicaoId = Number(insertAtribuicao.meta.last_row_id);
    atribuicaoMap.set(participant.funcionario_id, atribuicaoId);
    persistence.atribuicaoIds.push(atribuicaoId);
    const modelo = participant.modelo_sessao_id
      ? modelosMap.get(Number(participant.modelo_sessao_id))
      : null;

    if (participant.gera_ficha && participant.modelo_sessao_id) {
      const insertFicha = await db
        .prepare(
          `INSERT INTO fichas_sessao
             (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id, atribuicao_curricular_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          sessaoId,
          participant.funcionario_id,
          payload.instrutor_id,
          modelo?.codigo || primaryModel?.codigo || 'SHARED',
          await getSimuladorModeloAeronave(db, payload.simulador_id),
          payload.data,
          participant.modelo_sessao_id,
          empresaId,
          atribuicaoId,
        )
        .run();
      const fichaId = Number(insertFicha.meta.last_row_id);
      persistence.fichaIds.push(fichaId);
      await insertFichaManobrasFromModelo(db, fichaId, Number(participant.modelo_sessao_id));
    }

    if (participant.modelo_sessao_id && modelo?.gera_qualificacao) {
      await criarQualificacoesPlanejadas(db, {
        sessaoId,
        modeloId: Number(participant.modelo_sessao_id),
        tipoSessao: modelo?.tipo_sessao_codigo || modelo?.codigo || 'SHARED',
        data: payload.data,
        participantes: [{ funcionario_id: participant.funcionario_id }],
        empresaId,
      });
    }
  }

  for (const segmento of payload.segmentos) {
    const atribuicaoId = segmento.atribuicao_funcionario_id
      ? atribuicaoMap.get(segmento.atribuicao_funcionario_id) || null
      : null;
    const insertSegment = await db
      .prepare(
        `INSERT INTO simulador_agendamento_segmentos
           (uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')`,
      )
      .bind(
        crypto.randomUUID(),
        empresaId,
        sessaoId,
        segmento.ordem,
        segmento.inicio,
        segmento.fim,
        segmento.duracao_minutos,
        atribuicaoId,
      )
      .run();
    const segmentoId = Number(insertSegment.meta.last_row_id);
    persistence.segmentoIds.push(segmentoId);

    for (const funcao of segmento.funcoes) {
      const insertSegmentParticipant = await db
        .prepare(
          `INSERT INTO simulador_segmento_participantes
             (uuid, empresa_id, segmento_id, participante_id, funcao, duracao_minutos, atribuicao_curricular_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          empresaId,
          segmentoId,
          participantMap.get(funcao.funcionario_id),
          funcao.funcao,
          segmento.duracao_minutos,
          segmento.atribuicao_funcionario_id === funcao.funcionario_id
            ? atribuicaoMap.get(funcao.funcionario_id) || null
            : null,
        )
        .run();
      persistence.segmentoParticipanteIds.push(Number(insertSegmentParticipant.meta.last_row_id));
    }
  }

  return { sessaoId, persistence };
}

async function markPreviousSharedStructureDeleted(db: D1Database, sessaoId: number) {
  await runStatement(
    db,
    "UPDATE simulador_segmento_participantes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL",
    sessaoId,
  );
  await runStatement(
    db,
    "UPDATE simulador_agendamento_segmentos SET deleted_at = datetime('now'), updated_at = datetime('now'), status = 'CANCELADO' WHERE agendamento_id = ? AND deleted_at IS NULL",
    sessaoId,
  );
  await runStatement(
    db,
    "UPDATE fichas_sessao SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE agendamento_slot_id = ? AND deleted_at IS NULL",
    sessaoId,
  );
  await runStatement(
    db,
    "UPDATE simulador_atribuicoes_curriculares SET deleted_at = datetime('now'), updated_at = datetime('now'), status = 'CANCELADA' WHERE agendamento_id = ? AND deleted_at IS NULL",
    sessaoId,
  );
  await runStatement(
    db,
    "UPDATE sessoes_participantes SET deleted_at = datetime('now') WHERE sessao_id = ? AND deleted_at IS NULL",
    sessaoId,
  );
  await runStatement(
    db,
    "UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE sessao_id = ? AND deleted_at IS NULL",
    sessaoId,
  );
}

app.post('/sessoes/compartilhada', async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const payload = validateAndNormalizeSharedSessionRequest(await c.req.json());
    const modelosMap = await assertEntityOwnership(c.env.DB, empresaId, payload);
    await assertNoExternalConflicts(c.env.DB, empresaId, payload);

    const created = await createSharedSessionStructureTransactional(c.env.DB, empresaId, payload, modelosMap);

    // Phase 2: qualification creation (after core batch).
    // Compensation: if any qualification fails, rollback the entire shared session.
    try {
      for (const participante of payload.participantes) {
        const modelo = participante.modelo_sessao_id
          ? modelosMap.get(Number(participante.modelo_sessao_id))
          : null;
        if (participante.modelo_sessao_id && modelo?.gera_qualificacao) {
          await criarQualificacoesPlanejadas(c.env.DB, {
            sessaoId: created.sessaoId,
            modeloId: Number(participante.modelo_sessao_id),
            tipoSessao: modelo?.tipo_sessao_codigo || modelo?.codigo || 'SHARED',
            data: payload.data,
            participantes: [{ funcionario_id: participante.funcionario_id }],
            empresaId,
          });
        }
      }
    } catch (qualError: any) {
      await cleanupFailedSharedCreate(c.env.DB, created.sessaoId).catch(() => {});
      return c.json(
        { success: false, error: 'Falha ao criar qualificacoes planejadas: ' + String(qualError?.message || 'erro desconhecido') + '. Sessao revertida.' },
        500,
      );
    }

    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'INSERT_SHARED',
      registro_id: created.sessaoId,
      dados_novos: payload,
    }).catch(() => undefined);

    const detail = await loadSharedDetail(c.env.DB, empresaId, created.sessaoId);
    return c.json(
      {
        success: true,
        data: detail,
        resumo: {
          sessao_id: created.sessaoId,
          fichas_criadas: created.persistence.fichaIds.length,
          atribuicoes_criadas: created.persistence.atribuicaoIds.length,
          segmentos_criados: created.persistence.segmentoIds.length,
          horas_participantes: payload.resumo_participantes,
        },
      },
      201,
    );
  } catch (error: any) {
    const message = String(error?.message || 'Erro ao criar sessão compartilhada');
    const status = /tenant|conflito|precisa|segmento|cobertura|função|ficha/i.test(message) ? 400 : 500;
    return c.json({ success: false, error: message }, status);
  }
});

app.get('/sessoes/compartilhada/:id', async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const id = Number(c.req.param('id'));
    const detail = await loadSharedDetail(c.env.DB, empresaId, id);
    if (!detail) {
      return c.json({ success: false, error: 'Sessão compartilhada não encontrada' }, 404);
    }
    return c.json({ success: true, data: detail });
  } catch (error: any) {
    return c.json({ success: false, error: String(error?.message || 'Erro interno') }, 500);
  }
});

app.put('/sessoes/compartilhada/:id', async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const id = Number(c.req.param('id'));
    const current = await loadSharedDetail(c.env.DB, empresaId, id);
    if (!current) {
      return c.json({ success: false, error: 'Sessão compartilhada não encontrada' }, 404);
    }
    if ((current.fichas || []).some((ficha: any) => isProtectedFichaStatus(ficha.status))) {
      return c.json(
        { success: false, error: 'Sessão compartilhada com ficha concluída não pode ser editada' },
        409,
      );
    }

    const payload = validateAndNormalizeSharedSessionRequest(await c.req.json());
    const currentCurricularSignature = createSharedCurricularSignature(
      current.participantes || [],
      current.atribuicoes || [],
    );
    const requestedCurricularSignature = createSharedCurricularSignature(
      payload.participantes,
      payload.participantes
        .filter((participante) => participante.cumpre_treinamento)
        .map((participante) => ({
          funcionario_id: participante.funcionario_id,
          treinamento_planejado_id: participante.treinamento_planejado_id || null,
          modelo_sessao_id: participante.modelo_sessao_id || null,
          gera_ficha: participante.gera_ficha,
        })),
    );
    if (currentCurricularSignature !== requestedCurricularSignature) {
      return c.json(
        {
          success: false,
          error:
            'A edição segura permite alterar horários, segmentos, PF/PM e observações. Participantes, treinamentos, modelos e fichas não podem ser alterados.',
        },
        409,
      );
    }
    const modelosMap = await assertEntityOwnership(c.env.DB, empresaId, payload);
    await assertNoExternalConflicts(c.env.DB, empresaId, payload, id);

    await updateSharedSessionStructureTransactional(
      c.env.DB,
      empresaId,
      id,
      payload,
      modelosMap,
      current,
    );

    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'UPDATE_SHARED',
      registro_id: id,
      dados_anteriores: current.sessao,
      dados_novos: payload,
    }).catch(() => undefined);

    const detail = await loadSharedDetail(c.env.DB, empresaId, id);
    return c.json({ success: true, data: detail });
  } catch (error: any) {
    const message = String(error?.message || 'Erro ao editar sessão compartilhada');
    return c.json({ success: false, error: message }, /conflito|segmento|ficha|tenant/i.test(message) ? 400 : 500);
  }
});

app.post('/sessoes/compartilhada/:id/atribuicoes/:atribuicaoId/cancelar', async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const sessaoId = Number(c.req.param('id'));
    const atribuicaoId = Number(c.req.param('atribuicaoId'));

    const atribuicao = await c.env.DB
      .prepare(
        `SELECT sac.id, sac.agendamento_id, sac.participante_id, sp.funcionario_id
         FROM simulador_atribuicoes_curriculares sac
         INNER JOIN sessoes_participantes sp
           ON sp.id = sac.participante_id
          AND sp.deleted_at IS NULL
         WHERE sac.id = ?
           AND sac.agendamento_id = ?
           AND sac.empresa_id = ?
           AND sac.deleted_at IS NULL`,
      )
      .bind(atribuicaoId, sessaoId, empresaId)
      .first<any>();

    if (!atribuicao) {
      return c.json({ success: false, error: 'Atribuição não encontrada' }, 404);
    }

    const ficha = await c.env.DB
      .prepare(
        `SELECT id, status
         FROM fichas_sessao
         WHERE atribuicao_curricular_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(atribuicaoId)
      .first<any>();

    if (ficha && isProtectedFichaStatus(ficha.status)) {
      return c.json(
        { success: false, error: 'Atribuição com ficha concluída não pode ser cancelada' },
        409,
      );
    }

    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `UPDATE simulador_atribuicoes_curriculares
           SET status = 'CANCELADA',
               deleted_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(atribuicaoId),
      c.env.DB
        .prepare(
          `UPDATE simulador_agendamento_segmentos
           SET atribuicao_curricular_id = NULL,
               updated_at = datetime('now')
           WHERE agendamento_id = ?
             AND atribuicao_curricular_id = ?
             AND deleted_at IS NULL`,
        )
        .bind(sessaoId, atribuicaoId),
      c.env.DB
        .prepare(
          `UPDATE simulador_segmento_participantes
           SET atribuicao_curricular_id = NULL,
               updated_at = datetime('now')
           WHERE atribuicao_curricular_id = ?
             AND deleted_at IS NULL`,
        )
        .bind(atribuicaoId),
      c.env.DB
        .prepare(
          `UPDATE fichas_sessao
           SET deleted_at = datetime('now'),
               updated_at = datetime('now')
           WHERE atribuicao_curricular_id = ?
             AND deleted_at IS NULL`,
        )
        .bind(atribuicaoId),
      c.env.DB
        .prepare(
          `UPDATE qualificacoes_historico
           SET deleted_at = datetime('now'),
               updated_at = datetime('now')
           WHERE sessao_id = ?
             AND funcionario_id = ?
             AND deleted_at IS NULL
             AND COALESCE(status, 'PLANEJADA') = 'PLANEJADA'`,
        )
        .bind(sessaoId, atribuicao.funcionario_id),
    ]);

    const detail = await loadSharedDetail(c.env.DB, empresaId, sessaoId);
    return c.json({ success: true, data: detail });
  } catch (error: any) {
    return c.json({ success: false, error: String(error?.message || 'Erro interno') }, 500);
  }
});

export default app;
