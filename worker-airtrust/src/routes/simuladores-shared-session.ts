import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requireOperacoesSessao } from './simuladores-sessoes-rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  audit,
  criarQualificacoesPlanejadas,
  crossTenantSafeResponseStatusAndMessage,
} from './simuladores-shared';
import { validateAndNormalizeSharedSessionRequest } from './simuladores-shared-session-logic';
import { assertSharedFeature, executeSharedSessionCreation } from './simuladores-shared-session-helpers';
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
import { generateFichasForSharedSession } from './simuladores-shared-session-ficha-generator';
import {
  sendSimulatorSessionEmailNotifications,
  shouldNotifySimulatorSessionUpdate,
} from '../services/simuladores-session-notifications';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

type NotificationParticipantLike = {
  funcionario_id?: unknown;
  funcao?: unknown;
  cumpre_treinamento?: unknown;
  gera_ficha?: unknown;
  modelo_sessao_id?: unknown;
};

type NotificationSegmentLike = {
  ordem?: unknown;
  inicio?: unknown;
  fim?: unknown;
  participantes?: unknown;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function buildSharedNotificationParticipantSignature(
  source:
    | LoadedSharedDetail
    | ReturnType<typeof validateAndNormalizeSharedSessionRequest>,
): string {
  const isCurrent = 'sessao' in source;

  const participants = isCurrent
    ? asArray<NotificationParticipantLike>(source.participantes).map((participante, index) => ({
        ordem: index,
        funcionario_id: Number(participante.funcionario_id),
        funcao_sessao: String(participante.funcao || '').toUpperCase(),
      }))
    : source.participantes.map((participante, index) => ({
        ordem: index,
        funcionario_id: Number(participante.funcionario_id),
        funcao_sessao: index === 0 ? 'PIC' : 'SIC',
      }));

  const segments = asArray<NotificationSegmentLike>(source.segmentos).map((segmento, index) => ({
    ordem: Number(segmento.ordem || index + 1),
    inicio: String(segmento.inicio || ''),
    fim: String(segmento.fim || ''),
    participantes: asArray<NotificationParticipantLike>(segmento.participantes)
      .map((participante) => ({
        funcionario_id: Number(participante.funcionario_id),
        funcao: String(participante.funcao || '').toUpperCase(),
        cumpre_treinamento: Boolean(participante.cumpre_treinamento),
        gera_ficha: Boolean(participante.gera_ficha),
        modelo_sessao_id: Number(participante.modelo_sessao_id || 0) || null,
      }))
      .sort((left, right) => left.funcionario_id - right.funcionario_id),
  }));

  return JSON.stringify({
    participants,
    segments,
  });
}

function buildSharedNotificationSessionSnapshot(
  source: LoadedSharedDetail | ReturnType<typeof validateAndNormalizeSharedSessionRequest>,
  fallbackStatus: string | null | undefined,
  fallbackTemplateId: number | null,
  fallbackTipoSessao: string | null,
) {
  if ('sessao' in source) {
    return {
      data: source.sessao.data,
      hora_inicio: source.sessao.hora_inicio,
      hora_fim: source.sessao.hora_fim,
      simulador_id: source.sessao.simulador_id,
      aeronave_id: null,
      tipo_dispositivo: source.sessao.tipo_dispositivo,
      instrutor_id: source.sessao.instrutor_id,
      examinador_id: null,
      tipo_sessao: source.sessao.tipo_sessao,
      template_id: source.sessao.template_id,
      status: source.sessao.status,
      observacoes: source.sessao.observacoes,
      nome: source.sessao.nome,
    };
  }

  return {
    data: source.data,
    hora_inicio: source.hora_inicio,
    hora_fim: source.hora_fim,
    simulador_id: source.simulador_id,
    aeronave_id: null,
    tipo_dispositivo: null,
    instrutor_id: source.instrutor_id,
    examinador_id: null,
    tipo_sessao: fallbackTipoSessao,
    template_id: fallbackTemplateId,
    status: fallbackStatus || 'AGENDADO',
    observacoes: source.observacoes || null,
    nome: source.tema_sessao || 'Sessão compartilhada',
  };
}

function scheduleSharedSessionNotification(
  c: { executionCtx?: ExecutionContext; env: Env },
  sessaoId: number,
  empresaId: number,
  reason: 'created' | 'updated',
) {
  c.executionCtx?.waitUntil(
    sendSimulatorSessionEmailNotifications(c.env, c.env.DB, sessaoId, {
      reason,
      empresaId,
    })
      .then((results) => {
        const sent = results.filter((item) => item.status === 'sent').length;
        const skipped = results.filter((item) => item.status === 'skipped').length;
        const failed = results.filter((item) => item.status === 'failed').length;
        console.log('[simuladores/shared] session email notification queued', {
          sessao_id: sessaoId,
          sent,
          skipped,
          failed,
          reason,
        });
      })
      .catch((error) => {
        console.error('[simuladores/shared] session email notification failed', error);
      }),
  );
}

app.post('/sessoes/compartilhada', requireOperacoesSessao('create'), async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const payload = validateAndNormalizeSharedSessionRequest(await c.req.json());
    const result = await executeSharedSessionCreation(c.env.DB, empresaId, payload);
    const { detail, created, fichasResult } = result;
    const fichasGeradas = fichasResult.created;
    const fichasExistentes = fichasResult.skipped;
    scheduleSharedSessionNotification(c, created.sessaoId, empresaId, 'created');
    return c.json(
      {
        success: true,
        data: detail,
        resumo: {
          sessao_id: created.sessaoId,
          fichas_criadas: fichasGeradas,
          fichas_existentes: fichasExistentes,
          atribuicoes_criadas: created.persistence.atribuicaoIds.length,
          segmentos_criados: created.persistence.segmentoIds.length,
          horas_participantes: payload.resumo_participantes,
        },
      },
      201,
    );
  } catch (error: unknown) {
    const rawMessage = getErrorMessage(error, 'Erro ao criar sessão compartilhada');
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
  } catch (error: unknown) {
    return c.json({ success: false, error: getErrorMessage(error, 'Erro interno') }, 500);
  }
});

app.put('/sessoes/compartilhada/:id', requireOperacoesSessao('update'), async (c) => {
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
    const beforeSnapshot = buildSharedNotificationSessionSnapshot(
      current as LoadedSharedDetail,
      current.sessao.status,
      Number(current.sessao.template_id || 0) || null,
      String(current.sessao.tipo_sessao || '').trim() || null,
    );
    const afterSnapshot = buildSharedNotificationSessionSnapshot(
      payload,
      current.sessao.status,
      Number((payload.atribuicoes_planejadas[0]?.modelo_sessao_id as number | null | undefined) || 0) || null,
      payload.atribuicoes_planejadas[0]?.modelo_sessao_id
        ? String(modelosMap.get(Number(payload.atribuicoes_planejadas[0].modelo_sessao_id))?.tipo_sessao_codigo || modelosMap.get(Number(payload.atribuicoes_planejadas[0].modelo_sessao_id))?.codigo || 'SHARED')
        : 'SHARED',
    );
    const participantsChanged =
      buildSharedNotificationParticipantSignature(current as LoadedSharedDetail) !==
      buildSharedNotificationParticipantSignature(payload);

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
    } catch (qualError: unknown) {
      const qualErrorMessage = getErrorMessage(qualError, 'erro desconhecido');
      return c.json(
        { success: false, error: 'Falha ao recriar qualificacoes planejadas: ' + qualErrorMessage },
        500,
      );
    }

    try {
      await generateFichasForSharedSession(c.env.DB, empresaId, id);
    } catch (fichaError: unknown) {
      const fichaErrorMessage = getErrorMessage(fichaError, 'erro desconhecido');
      await audit(c.env.DB, {
        tabela: 'fichas_sessao',
        acao: 'GERACAO_FICHAS_SHARED_FALHOU',
        registro_id: id,
        dados_novos: { empresaId, sessaoId: id, error: fichaErrorMessage, origem: 'update' },
      }).catch(() => undefined);

      return c.json(
        {
          success: false,
          error:
            'Sessão compartilhada atualizada (id ' +
            id +
            '), mas a geração canônica de fichas falhou e ficou pendente de reparo: ' +
            fichaErrorMessage,
        },
        502,
      );
    }

    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'UPDATE_SHARED',
      registro_id: id,
      dados_anteriores: current.sessao,
      dados_novos: payload,
    }).catch(() => undefined);

    if (shouldNotifySimulatorSessionUpdate(beforeSnapshot, afterSnapshot, participantsChanged)) {
      scheduleSharedSessionNotification(c, id, empresaId, 'updated');
    }

    const detail = await loadSharedDetail(c.env.DB, empresaId, id);
    return c.json({ success: true, data: detail });
  } catch (error: unknown) {
    const rawMessage = getErrorMessage(error, 'Erro ao editar sessão compartilhada');
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
app.put('/sessoes/:id/converter-compartilhada', requireOperacoesSessao('update'), async (c) => {
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
    let shouldNotifyAfterConversion = true;

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
      const beforeSnapshot = buildSharedNotificationSessionSnapshot(
        current as LoadedSharedDetail,
        current.sessao.status,
        Number(current.sessao.template_id || 0) || null,
        String(current.sessao.tipo_sessao || '').trim() || null,
      );
      const afterSnapshot = buildSharedNotificationSessionSnapshot(
        payload,
        current.sessao.status,
        Number((payload.atribuicoes_planejadas[0]?.modelo_sessao_id as number | null | undefined) || 0) || null,
        payload.atribuicoes_planejadas[0]?.modelo_sessao_id
          ? String(modelosMap.get(Number(payload.atribuicoes_planejadas[0].modelo_sessao_id))?.tipo_sessao_codigo || modelosMap.get(Number(payload.atribuicoes_planejadas[0].modelo_sessao_id))?.codigo || 'SHARED')
          : 'SHARED',
      );
      const participantsChanged =
        buildSharedNotificationParticipantSignature(current as LoadedSharedDetail) !==
        buildSharedNotificationParticipantSignature(payload);
      shouldNotifyAfterConversion = shouldNotifySimulatorSessionUpdate(
        beforeSnapshot,
        afterSnapshot,
        participantsChanged,
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
    } catch (qualError: unknown) {
      const qualErrorMessage = getErrorMessage(qualError, 'erro desconhecido');
      await cleanupFailedSharedConversion(c.env.DB, id, newParticipantFuncionarioIds).catch(() => {});
      return c.json(
        {
          success: false,
          error:
            'Falha ao criar qualificacoes planejadas: ' +
            qualErrorMessage +
            '. Conversão revertida.',
        },
        500,
      );
    }

    try {
      await generateFichasForSharedSession(c.env.DB, empresaId, id);
    } catch (fichaError: unknown) {
      const fichaErrorMessage = getErrorMessage(fichaError, 'erro desconhecido');
      await audit(c.env.DB, {
        tabela: 'fichas_sessao',
        acao: 'GERACAO_FICHAS_SHARED_FALHOU',
        registro_id: id,
        dados_novos: {
          empresaId,
          sessaoId: id,
          error: fichaErrorMessage,
          origem: Number(simpleSession.modo_compartilhado) === 1 ? 'convert-idempotent-retry' : 'convert',
        },
      }).catch(() => undefined);

      return c.json(
        {
          success: false,
          error:
            'Sessão compartilhada conciliada (id ' +
            id +
            '), mas a geração canônica de fichas falhou e ficou pendente de reparo: ' +
            fichaErrorMessage,
        },
        502,
      );
    }

    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'CONVERT_TO_SHARED',
      registro_id: id,
      dados_anteriores: simpleSession,
      dados_novos: payload,
    }).catch(() => undefined);

    if (shouldNotifyAfterConversion) {
      scheduleSharedSessionNotification(c, id, empresaId, 'updated');
    }

    const detail = await loadSharedDetail(c.env.DB, empresaId, id);
    return c.json({ success: true, data: detail });
  } catch (error: unknown) {
    const rawMessage = getErrorMessage(error, 'Erro ao converter sessão em compartilhada');

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

app.post('/sessoes/compartilhada/:id/atribuicoes/:atribuicaoId/cancelar', requireOperacoesSessao('update'), async (c) => {
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
  } catch (error: unknown) {
    return c.json({ success: false, error: getErrorMessage(error, 'Erro interno') }, 500);
  }
});

/**
 * POST /simuladores/sessoes/compartilhada/:id/gerar-fichas
 * Repara fichas ausentes para uma sessão compartilhada existente.
 * Idempotente — pode ser chamado repetidamente sem duplicar.
 * Restrito a admin — enforced via requireRole, não apenas por comentário.
 */
app.post('/sessoes/compartilhada/:id/gerar-fichas', requireRole('admin'), async (c) => {
  const denied = await assertSharedFeature(c);
  if (denied) return denied;

  try {
    const { empresaId } = getTenantContext(c);
    const sessaoId = Number(c.req.param('id'));
    const result = await generateFichasForSharedSession(c.env.DB, empresaId, sessaoId);

    return c.json({
      success: true,
      data: {
        sessao_id: sessaoId,
        fichas_criadas: result.created,
        fichas_existentes: result.skipped,
        total: result.created + result.skipped,
        detalhes: result.details,
      },
    });
  } catch (error: unknown) {
    const rawMessage = getErrorMessage(error, 'Erro interno ao gerar fichas');
    const { status, message } = crossTenantSafeResponseStatusAndMessage(rawMessage, 500);
    return c.json({ success: false, error: message }, status);
  }
});

export default app;
