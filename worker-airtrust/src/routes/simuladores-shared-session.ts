import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import {
  audit,
  criarQualificacoesPlanejadas,
  crossTenantSafeResponseStatusAndMessage,
} from './simuladores-shared';
import { validateAndNormalizeSharedSessionRequest } from './simuladores-shared-session-logic';
import { assertSharedFeature } from './simuladores-shared-session-helpers';
import { assertEntityOwnership, assertNoExternalConflicts } from './simuladores-shared-session-validation';
import { loadSharedDetail, type LoadedSharedDetail } from './simuladores-shared-session-detail';
import {
  createSharedSessionStructureTransactional,
  updateSharedSessionStructureTransactional,
} from './simuladores-shared-session-reconciliation';
import { cancelSharedAssignment, cleanupFailedSharedCreate } from './simuladores-shared-session-cancellation';
import {
  assertSimpleSessionConvertible,
  cleanupFailedSharedConversion,
  convertSimpleSessionToSharedTransactional,
  loadSimpleSessionForConversion,
} from './simuladores-shared-session-conversion';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

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
      for (const atribuicao of payload.atribuicoes_planejadas) {
        const modelo = atribuicao.modelo_sessao_id
          ? modelosMap.get(Number(atribuicao.modelo_sessao_id))
          : null;
        if (atribuicao.modelo_sessao_id && modelo?.gera_qualificacao) {
          await criarQualificacoesPlanejadas(c.env.DB, {
            sessaoId: created.sessaoId,
            modeloId: Number(atribuicao.modelo_sessao_id),
            tipoSessao: modelo?.tipo_sessao_codigo || modelo?.codigo || 'SHARED',
            data: payload.data,
            participantes: [{ funcionario_id: atribuicao.funcionario_id }],
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
    const rawMessage = String(error?.message || 'Erro ao criar sessão compartilhada');
    const fallbackStatus = /tenant|conflito|precisa|segmento|cobertura|função|ficha|instrutor/i.test(
      rawMessage,
    )
      ? 400
      : 500;
    const { status, message } = crossTenantSafeResponseStatusAndMessage(rawMessage, fallbackStatus);
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

    const payload = validateAndNormalizeSharedSessionRequest(await c.req.json());
    const modelosMap = await assertEntityOwnership(c.env.DB, empresaId, payload);
    await assertNoExternalConflicts(c.env.DB, empresaId, payload, id);

    await updateSharedSessionStructureTransactional(c.env.DB, empresaId, id, payload, modelosMap, current as LoadedSharedDetail);

    try {
      for (const atribuicao of payload.atribuicoes_planejadas) {
        const modelo = atribuicao.modelo_sessao_id
          ? modelosMap.get(Number(atribuicao.modelo_sessao_id))
          : null;
        if (atribuicao.modelo_sessao_id && modelo?.gera_qualificacao) {
          await criarQualificacoesPlanejadas(c.env.DB, {
            sessaoId: id,
            modeloId: Number(atribuicao.modelo_sessao_id),
            tipoSessao: modelo?.tipo_sessao_codigo || modelo?.codigo || 'SHARED',
            data: payload.data,
            participantes: [{ funcionario_id: atribuicao.funcionario_id }],
            empresaId,
          });
        }
      }
    } catch (qualError: any) {
      return c.json(
        { success: false, error: 'Falha ao recriar qualificacoes planejadas: ' + String(qualError?.message || 'erro desconhecido') },
        500,
      );
    }

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
    const rawMessage = String(error?.message || 'Erro ao editar sessão compartilhada');
    const fallbackStatus = /conflito|segmento|ficha|tenant|instrutor/i.test(rawMessage) ? 400 : 500;
    const { status, message } = crossTenantSafeResponseStatusAndMessage(rawMessage, fallbackStatus);
    return c.json({ success: false, error: message }, status);
  }
});

// Converts an existing PLANNED, evidence-free simple session into a shared
// session in place (modo_compartilhado: false -> true). Distinct from PUT
// /sessoes/compartilhada/:id, which requires the session to already be
// shared — a plain simulador_agendamentos row has no rows in the
// segmento/atribuicao tables yet, so loadSharedDetail would 404 it.
app.put('/sessoes/:id/converter-compartilhada', async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const id = Number(c.req.param('id'));

    const simpleSession = await loadSimpleSessionForConversion(c.env.DB, empresaId, id);
    if (!simpleSession) {
      return c.json({ success: false, error: 'Sessão não encontrada' }, 404);
    }

    const payload = validateAndNormalizeSharedSessionRequest(await c.req.json());
    const modelosMap = await assertEntityOwnership(c.env.DB, empresaId, payload);
    await assertNoExternalConflicts(c.env.DB, empresaId, payload, id);

    let newParticipantFuncionarioIds: number[] = [];

    if (Number(simpleSession.modo_compartilhado) === 1) {
      // Idempotent retry: this session was already converted (e.g. a client
      // resend after a network timeout on a previous success). Route through
      // the ordinary shared-session update/reconciliation path instead of
      // re-running the conversion, so a resend never duplicates structure.
      const current = await loadSharedDetail(c.env.DB, empresaId, id);
      if (!current) {
        return c.json({ success: false, error: 'Sessão compartilhada não encontrada' }, 404);
      }
      await updateSharedSessionStructureTransactional(
        c.env.DB,
        empresaId,
        id,
        payload,
        modelosMap,
        current as LoadedSharedDetail,
      );
    } else {
      await assertSimpleSessionConvertible(c.env.DB, empresaId, simpleSession);
      const result = await convertSimpleSessionToSharedTransactional(c.env.DB, empresaId, id, payload, modelosMap);
      newParticipantFuncionarioIds = result.newParticipantFuncionarioIds;
    }

    // Phase 2: qualification creation (after the atomic batch already
    // committed). Compensation: if any qualification fails, revert the
    // conversion — reopen as a simple session rather than leaving a
    // half-converted shared structure behind.
    try {
      for (const atribuicao of payload.atribuicoes_planejadas) {
        const modelo = atribuicao.modelo_sessao_id
          ? modelosMap.get(Number(atribuicao.modelo_sessao_id))
          : null;
        if (atribuicao.modelo_sessao_id && modelo?.gera_qualificacao) {
          await criarQualificacoesPlanejadas(c.env.DB, {
            sessaoId: id,
            modeloId: Number(atribuicao.modelo_sessao_id),
            tipoSessao: modelo?.tipo_sessao_codigo || modelo?.codigo || 'SHARED',
            data: payload.data,
            participantes: [{ funcionario_id: atribuicao.funcionario_id }],
            empresaId,
          });
        }
      }
    } catch (qualError: any) {
      await cleanupFailedSharedConversion(c.env.DB, id, newParticipantFuncionarioIds).catch(() => {});
      return c.json(
        {
          success: false,
          error:
            'Falha ao criar qualificacoes planejadas: ' +
            String(qualError?.message || 'erro desconhecido') +
            '. Conversão revertida.',
        },
        500,
      );
    }

    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'CONVERT_TO_SHARED',
      registro_id: id,
      dados_anteriores: simpleSession,
      dados_novos: payload,
    }).catch(() => undefined);

    const detail = await loadSharedDetail(c.env.DB, empresaId, id);
    return c.json({ success: true, data: detail });
  } catch (error: any) {
    const rawMessage = String(error?.message || 'Erro ao converter sessão em compartilhada');

    // Evidence/status blockers get their own 409 (conflict with existing
    // state) rather than the generic 400/500 split used for validation and
    // tenant errors — the spec requires the backend to answer conversion
    // rejections with 409/422, not a plain 400.
    if (/ativa e planejada|evidência de execução|remover participantes já vinculados/i.test(rawMessage)) {
      return c.json({ success: false, error: rawMessage }, 409);
    }

    const fallbackStatus = /conflito|tenant|segmento|cobertura|função|ficha|instrutor/i.test(rawMessage)
      ? 400
      : 500;
    const { status, message } = crossTenantSafeResponseStatusAndMessage(rawMessage, fallbackStatus);
    return c.json({ success: false, error: message }, status);
  }
});

app.post('/sessoes/compartilhada/:id/atribuicoes/:atribuicaoId/cancelar', async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const sessaoId = Number(c.req.param('id'));
    const atribuicaoId = Number(c.req.param('atribuicaoId'));

    const result = await cancelSharedAssignment(c.env.DB, empresaId, sessaoId, atribuicaoId);

    if (result.outcome === 'not_found') {
      return c.json({ success: false, error: 'Atribuição não encontrada' }, 404);
    }
    if (result.outcome === 'protected') {
      return c.json(
        { success: false, error: 'Atribuição com ficha concluída não pode ser cancelada' },
        409,
      );
    }

    const detail = await loadSharedDetail(c.env.DB, empresaId, sessaoId);
    return c.json({ success: true, data: detail });
  } catch (error: any) {
    return c.json({ success: false, error: String(error?.message || 'Erro interno') }, 500);
  }
});

export default app;
