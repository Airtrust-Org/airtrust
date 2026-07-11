import {
  findSessaoConflict,
  getSimuladorModeloAeronave,
  normalizeModeloAeronave,
  timeToMinutes,
} from './simuladores-shared';
import type { NormalizedSharedSessionRequest } from './simuladores-shared-session-logic';
import { overlaps } from './simuladores-shared-session-helpers';

export type ModeloSessaoMapRow = {
  id: number;
  codigo: string | null;
  nome: string | null;
  tipo_sessao_codigo: string | null;
  gera_qualificacao: number | null;
  qualificacao_tipo_id: number | null;
  ativo: number | null;
  tipo: string | null;
  modelo_aeronave: string | null;
};

export async function getSimuladorAgendamentosColumns(db: D1Database): Promise<Set<string>> {
  const tableInfo = await db.prepare('PRAGMA table_info(simulador_agendamentos)').all<{ name: string }>();
  return new Set((tableInfo.results || []).map((row) => row.name));
}

export async function loadModelosSessaoMap(
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
         ms.ativo,
         ms.tipo,
         ms.modelo_aeronave,
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

export async function assertEntityOwnership(
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
  if (
    payload.atribuicoes_planejadas.some(
      (atribuicao) => Number(atribuicao.funcionario_id) === Number(payload.instrutor_id),
    )
  ) {
    throw new Error('Instrutor supervisor não pode ser o próprio treinando curricular');
  }

  const simulador = await db
    .prepare(
      `SELECT id
       FROM simuladores
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL`,
    )
    .bind(payload.simulador_id, empresaId)
    .first();
  if (!simulador) {
    throw new Error('Simulador fora do tenant');
  }

  const modeloIds = payload.atribuicoes_planejadas
    .map((item) => Number(item.modelo_sessao_id || 0))
    .filter((id) => Number.isInteger(id) && id > 0);
  const uniqueModeloIds = Array.from(new Set(modeloIds));
  const modelosMap = await loadModelosSessaoMap(db, empresaId, modeloIds);
  if (modelosMap.size !== uniqueModeloIds.length) {
    throw new Error('Modelo de sessão fora do tenant');
  }

  const simuladorModelo = normalizeModeloAeronave(await getSimuladorModeloAeronave(db, payload.simulador_id, empresaId));
  for (const atribuicao of payload.atribuicoes_planejadas) {
    const modelo = modelosMap.get(Number(atribuicao.modelo_sessao_id));
    if (!modelo) {
      throw new Error('Modelo de sessão fora do tenant');
    }
    if (Number(modelo.ativo ?? 1) !== 1) {
      throw new Error('Modelo de sessão inativo');
    }
    const tipoModelo = String(modelo.tipo || 'SIMULADOR').trim().toUpperCase();
    if (tipoModelo === 'AERONAVE') {
      throw new Error('Modelo de sessão incompatível com simulador');
    }
    const modeloAeronave = normalizeModeloAeronave(modelo.modelo_aeronave);
    if (modeloAeronave && simuladorModelo && modeloAeronave !== simuladorModelo) {
      throw new Error('Modelo de sessão incompatível com equipamento');
    }
  }

  const treinamentoIds = payload.atribuicoes_planejadas
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

export async function findInstrutorConflict(
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

export async function findParticipanteConflict(
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

export async function assertNoExternalConflicts(
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
