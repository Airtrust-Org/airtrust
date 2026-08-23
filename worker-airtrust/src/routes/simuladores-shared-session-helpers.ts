import type { Env } from '../types';

import { assertEntityOwnership, assertNoExternalConflicts } from './simuladores-shared-session-validation';
import { createSharedSessionStructureTransactional } from './simuladores-shared-session-reconciliation';
import { cleanupFailedSharedCreate } from './simuladores-shared-session-cancellation';
import { criarQualificacoesPlanejadas, audit } from './simuladores-shared';
import { generateFichasForSharedSession } from './simuladores-shared-session-ficha-generator';
import { loadSharedDetail } from './simuladores-shared-session-detail';
import type { NormalizedSharedSessionRequest } from './simuladores-shared-session-logic';

function getErrorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }


export function isSharedSessionsEnabled(env: Env): boolean {
  return env.SIMULATOR_SHARED_SESSIONS_ENABLED === 'true';
}

export function isProtectedFichaStatus(status: unknown): boolean {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  return ['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'].includes(normalized);
}

export function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

// Thin D1 statement wrappers — reduce boilerplate without hiding DB access.
export async function runStatement(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).run();
}

export async function firstStatement<T>(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).first<T>();
}

export async function allStatement<T>(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).all<T>();
}

export function prepareStatement(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args);
}

export async function assertSharedFeature(c: any) {
  if (!isSharedSessionsEnabled(c.env)) {
    return c.json({ success: false, error: 'Shared simulator sessions feature disabled' }, 404);
  }
  return null;
}

export async function executeSharedSessionCreation(
  db: D1Database,
  empresaId: number,
  payload: NormalizedSharedSessionRequest
) {
  const modelosMap = await assertEntityOwnership(db, empresaId, payload);
  await assertNoExternalConflicts(db, empresaId, payload);

  const created = await createSharedSessionStructureTransactional(db, empresaId, payload, modelosMap);

  try {
    for (const atribuicao of payload.atribuicoes_planejadas) {
      const modelo = atribuicao.modelo_sessao_id
        ? modelosMap.get(Number(atribuicao.modelo_sessao_id))
        : null;
      if (atribuicao.modelo_sessao_id && modelo?.gera_qualificacao) {
        await criarQualificacoesPlanejadas(db, {
          sessaoId: created.sessaoId,
          modeloId: Number(atribuicao.modelo_sessao_id),
          tipoSessao: modelo?.tipo_sessao_codigo || modelo?.codigo || 'SHARED',
          data: payload.data,
          participantes: [{ funcionario_id: atribuicao.funcionario_id }],
          empresaId,
        });
      }
    }
  } catch (qualError: unknown) {
    const qualErrorMessage = getErrorMessage(qualError, 'erro desconhecido');
    await cleanupFailedSharedCreate(db, created.sessaoId).catch(() => {});
    throw new Error('Falha ao criar qualificacoes planejadas: ' + qualErrorMessage + '. Sessao revertida.');
  }

  await audit(db, {
    tabela: 'simulador_agendamentos',
    acao: 'INSERT_SHARED',
    registro_id: created.sessaoId,
    dados_novos: payload,
  }).catch(() => undefined);

  let fichasResult;
  try {
    fichasResult = await generateFichasForSharedSession(db, empresaId, created.sessaoId);
  } catch (fichaError: unknown) {
    const fichaErrorMessage = getErrorMessage(fichaError, 'erro desconhecido');
    await audit(db, {
      tabela: 'fichas_sessao',
      acao: 'GERACAO_FICHAS_SHARED_FALHOU',
      registro_id: created.sessaoId,
      dados_novos: { empresaId, sessaoId: created.sessaoId, error: fichaErrorMessage },
    }).catch(() => undefined);
    throw new Error('Sessão compartilhada criada (id ' + created.sessaoId + '), mas a geração de fichas falhou: ' + fichaErrorMessage);
  }

  const detail = await loadSharedDetail(db, empresaId, created.sessaoId);
  return { detail, created, fichasResult };
}
