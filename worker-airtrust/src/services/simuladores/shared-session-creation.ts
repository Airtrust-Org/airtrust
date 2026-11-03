import { assertEntityOwnership, assertNoExternalConflicts } from './shared-session-validation';
import { createSharedSessionStructureTransactional } from './shared-session-reconciliation';
import { cleanupFailedSharedCreate } from './shared-session-cancellation';
import { criarQualificacoesPlanejadas, audit } from './shared';
import { generateFichasForSharedSession } from './shared-session-ficha-generator';
import { loadSharedDetail } from './shared-session-detail';
import type { NormalizedSharedSessionRequest } from './shared-session-logic';

/**
 * Orquestra a criação de uma sessão compartilhada (validação, estrutura transacional,
 * qualificações planejadas, auditoria e fichas). Vive fora de `shared-session-helpers`
 * para que os helpers continuem sendo folhas: os módulos de validação, reconciliação,
 * cancelamento e detalhe importam helpers, e helpers não importa mais nenhum deles.
 */
function getErrorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }

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
    throw new Error(
      'Sessão compartilhada criada (id ' +
        created.sessaoId +
        '), mas a geração canônica de fichas falhou e ficou pendente de reparo: ' +
        fichaErrorMessage,
    );
  }

  const detail = await loadSharedDetail(db, empresaId, created.sessaoId);
  return { detail, created, fichasResult };
}
