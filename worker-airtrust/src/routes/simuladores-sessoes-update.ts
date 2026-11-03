/**
 * SIMULADORES — Sessões Update/Delete
 * Sub-router mounted at /api/simuladores via app.route('/', ...)
 *
 *   PUT    /sessoes/:id
 *   DELETE /sessoes/:id
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import {
  isCompletedStatus,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusEqualsAny,
} from '../lib/status/status-codes';
import { publishDomainEvent } from '../shared/domainEvents';
import { removeManagedEscalaEvents } from '../shared/syncEscalaEventosExternos';
import { enviarEmailFichaSessao } from '../lib/fichaEmails';
import {
  loadSimulatorSessionNotificationData,
  sendSimulatorSessionEmailNotifications,
  shouldNotifySimulatorSessionUpdate,
} from '../services/simuladores-session-notifications';
import { requireAdminForDelete } from './simuladores-admin-guard';
import { syncSessaoEscalaEventos, audit, getSimuladorModeloAeronave, normalizeModeloAeronave, normalizeChecksSessao, listarParticipantesDaSessaoParaQualificacao, sincronizarQualificacoesDaSessaoConcluida } from '../services/simuladores/shared';
import { getTenantContext } from '../middleware/tenant';
import { validateInstrutorAssignment } from '../services/simuladores/instrutor-assignment';
import { syncExaminadorChecks, syncFichasEspeciais } from '../services/simuladores/session-examiner-checks';
import {
  applySessaoScheduleUpdate,
  findConflitoDeAgendamento,
  planSessaoSchedule,
} from '../services/simuladores/session-schedule-update';
import { ensureQualificacoesPlanejadas } from '../services/simuladores/session-planejadas';
import {
  applyParticipantes,
  planParticipantes,
  type ParticipanteInput,
} from '../services/simuladores/session-participants';
import {
  findSessaoAtual,
  listParticipantesAtivos,
} from '../repositories/simuladores/session-participants-repository';
import {
  requireOperationalAccess,
  } from '../middleware/operational-domain-access';

// Sessões de simulador são fixed-domain OPERACOES — see docs/rbac/gestor-operational-autonomy.md.
const requireOperacoesSessao = (action: 'update' | 'delete') =>
  requireOperationalAccess({ domain: 'OPERACOES', action, resourceType: 'simulador_sessao' });

const app = new Hono<{ Bindings: Env }>();

async function runUpdate(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).run();
}

/**
 * Extrai o userId do contexto Hono autenticado sem recorrer a `as any` —
 * mesmo padrão estrutural usado em `simuladores-fichas.ts`
 * (`getContextUserId`) e `escalas-alocacoes-helpers-internal.ts` (`getUserId`).
 */
function getContextUserId(c: { get: (k: string) => unknown }): string {
  return String(c.get('userId') || 'system');
}

/**
 * Devolve a pendente o fluxo das fichas da sessão que ainda estão em andamento.
 *
 * Ficha com qualquer assinatura (aluno ou instrutor) ou data de conclusão é
 * documento assinado/concluído: NÃO é resetada, nem as suas manobras. Editar a
 * sessão (ex.: só uma observação) nunca pode apagar uma avaliação já assinada.
 */
const FICHA_ASSINADA_OU_CONCLUIDA_SQL = `(
  assinatura_aluno_timestamp IS NOT NULL
  OR assinatura_instrutor_timestamp IS NOT NULL
  OR COALESCE(assinatura_aluno_completa, 0) = 1
  OR COALESCE(assinatura_instrutor_completa, 0) = 1
  OR data_conclusao IS NOT NULL
)`;

async function resetFluxoFichasEmAndamento(db: D1Database, sessaoId: number | string) {
  await db
    .prepare(
      `UPDATE fichas_sessao
       SET status = 'AVALIACAO_PENDENTE',
           resultado_final = 'PENDENTE',
           aprovado = NULL,
           observacoes = NULL,
           observacoes_gerais = NULL,
           assinatura_aluno_ip = NULL,
           assinatura_aluno_timestamp = NULL,
           assinatura_aluno_imagem = NULL,
           assinatura_instrutor_ip = NULL,
           assinatura_instrutor_timestamp = NULL,
           assinatura_instrutor_imagem = NULL,
           assinatura_tripulante = 0,
           assinatura_instrutor = 0,
           assinatura_aluno_completa = 0,
           assinatura_instrutor_completa = 0,
           data_conclusao = NULL,
           updated_at = datetime('now')
       WHERE agendamento_slot_id = ?
         AND deleted_at IS NULL
         AND NOT ${FICHA_ASSINADA_OU_CONCLUIDA_SQL}`,
    )
    .bind(sessaoId)
    .run();

  await db
    .prepare(
      `UPDATE fichas_sessao_manobras
       SET resultado = NULL,
           observacoes = '',
           updated_at = datetime('now')
       WHERE ficha_id IN (
         SELECT id
         FROM fichas_sessao
         WHERE agendamento_slot_id = ?
           AND deleted_at IS NULL
           AND NOT ${FICHA_ASSINADA_OU_CONCLUIDA_SQL}
       )
         AND deleted_at IS NULL`,
    )
    .bind(sessaoId)
    .run();
}

/** Columns of simulador_agendamentos actually read after the UPDATE (select-all query below). */
interface SimuladorAgendamentoRow {
  id: number;
  empresa_id: number;
  simulador_id: number | null;
  data: string;
  status: string | null;
  nome: string | null;
  tipo_sessao: string | null;
  observacoes: string | null;
}

app.put('/sessoes/:id', requireOperacoesSessao('update'), async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const b = await c.req.json();
    const templateIdBody =
      b.template_id !== undefined
        ? b.template_id
        : b.modelo_sessao_id !== undefined
          ? b.modelo_sessao_id
          : undefined;
    const resetarFluxoFichas = b.resetar_fluxo_fichas !== false;
    const a = await c.env.DB.prepare(
      'SELECT * FROM simulador_agendamentos WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(id, empresaId)
      .first();
    if (!a) return c.json({ success: false, error: 'Não encontrada' }, 404);
    // Sessões compartilhadas devem ser editadas via PUT /sessoes/compartilhada/:id,
    // que também atualiza os segmentos operacionais.
    if (Number((a as any).modo_compartilhado || 0) === 1) {
      return c.json(
        { success: false, error: 'Sessão compartilhada deve ser editada pela rota de sessões compartilhadas' },
        409,
      );
    }

    // ── Guardrail: se instrutor_id for alterado, validar flag is_instrutor ──
    // O instrutor da sessão deve ter flag is_instrutor. Isso previne que um
    // examinador/checador seja acidentalmente designado como instrutor da
    // ficha pedagógica do tripulante.
    if (b.instrutor_id !== undefined) {
      const instrutorCheck = await validateInstrutorAssignment(c.env.DB, {
        empresaId,
        sessaoId: id,
        instrutorId: b.instrutor_id,
        participantesReenviados: b.participantes !== undefined,
      });
      if (!instrutorCheck.ok) {
        return c.json({ success: false, error: instrutorCheck.error }, instrutorCheck.status);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    let participantesParaNotificacaoAlterados = false;
    const modeloAeronaveSessao =
      normalizeModeloAeronave(b.tipo_aeronave) ||
      (await getSimuladorModeloAeronave(
        c.env.DB,
        (a as { simulador_id?: string | number | null }).simulador_id,
        empresaId,
      ));
    let checksNormalizados: number[] = [];
    try {
      checksNormalizados = await normalizeChecksSessao(c.env.DB, b.checks, modeloAeronaveSessao, empresaId);
    } catch (error: any) {
      return c.json({ success: false, error: 'Checks inválidos' }, 400);
    }

    // Examinador + checks (vínculos, is_check, auditoria) e fichas especiais CRED-EXA.
    const checksSync = await syncExaminadorChecks(c.env.DB, {
      empresaId,
      sessaoId: id,
      sessao: a,
      body: b,
      checksNormalizados,
    });
    if (!checksSync.ok) {
      return c.json({ success: false, error: checksSync.error }, checksSync.status);
    }
    await syncFichasEspeciais(c.env.DB, {
      empresaId,
      sessaoId: id,
      sessao: a,
      body: b,
      examinadorIdBodyRaw: checksSync.examinadorIdBodyRaw,
    });

    const schedule = planSessaoSchedule(b, a);
    if (!schedule.ok) {
      return c.json({ success: false, error: schedule.error }, schedule.status);
    }
    const conflito = await findConflitoDeAgendamento(c.env.DB, schedule.plan, id);
    if (conflito) {
      return c.json({ success: false, code: 'SCHEDULE_CONFLICT', error: conflito }, 409);
    }

    console.log('[PUT /sessoes] ANTES:', { id, tipo_sessao: a.tipo_sessao, nome: a.nome });
    console.log('[PUT /sessoes] PAYLOAD:', {
      tipo_sessao: b.tipo_sessao,
      tema_sessao: b.tema_sessao,
    });

    const { simuladorIdFinal, dataFinal } = schedule.plan;
    const { templateIdFinal } = await applySessaoScheduleUpdate(c.env.DB, {
      empresaId,
      sessaoId: id,
      sessao: a,
      body: b,
      templateIdBody,
      modeloAeronaveSessao,
      tipoDispositivoFinal: schedule.plan.tipoDispositivoFinal,
    });

    // Criar qualificações PLANEJADAS se a sessão ainda não as tiver (ex: sessão criada antes do deploy)
    let scaleIntegrationError: string | null = null;
    const diag = await ensureQualificacoesPlanejadas(c.env.DB, {
      empresaId,
      sessaoId: id,
      sessao: a,
      body: b,
      templateIdFinal,
      modeloAeronaveSessao,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SINCRONIZAR instrutor_id nas fichas quando o instrutor da sessão muda.
    // Apenas fichas ainda não assinadas pelo instrutor (não concluídas).
    //
    // REGRA: A ficha pedagógica (avaliação do tripulante) deve SEMPRE ter como
    // instrutor o instrutor responsável da sessão, nunca o examinador/checador.
    // O examinador preenche documentação ANAC separada (checks) e não assina a
    // ficha pedagógica.
    //
    // EXCEÇÃO: Fichas especiais TRE-INST e CRED-EXA são fichas onde o próprio
    // instrutor é o aluno avaliado e o examinador atua como instrutor-avaliador.
    // Essas fichas NÃO são sincronizadas aqui — o examinador permanece como
    // instrutor_id apenas nesses casos especiais.
    // ──────────────────────────────────────────────────────────────────────────
    if (
      b.instrutor_id !== undefined &&
      String(b.instrutor_id) !== String((a as any).instrutor_id)
    ) {
      await c.env.DB.prepare(
        `UPDATE fichas_sessao
         SET instrutor_id = ?,
             updated_at = datetime('now')
         WHERE agendamento_slot_id = ?
           AND deleted_at IS NULL
           AND assinatura_instrutor_timestamp IS NULL
           AND (tipo_sessao IS NULL OR UPPER(tipo_sessao) NOT IN ('TRE-INST', 'CRED-EXA'))`,
      )
        .bind(b.instrutor_id, id)
        .run();
    }

    if (resetarFluxoFichas) {
      await resetFluxoFichasEmAndamento(c.env.DB, id);
    }

    // ATUALIZAR PARTICIPANTES + SINCRONIZAR FICHAS
    if (b.participantes && Array.isArray(b.participantes)) {
      const sessaoAtual = await findSessaoAtual(c.env.DB, id);
      const partAntigos = await listParticipantesAtivos(c.env.DB, id);

      // ── Bloqueio de autoavaliação: instrutor não pode ser participante ────
      const plan = planParticipantes({
        atuais: partAntigos,
        enviados: b.participantes as ParticipanteInput[],
        instrutorEfetivo:
          b.instrutor_id !== undefined
            ? b.instrutor_id
            : (a as { instrutor_id?: unknown } | null)?.instrutor_id,
      });
      if (plan.instrutorEntreParticipantes) {
        return c.json(
          {
            success: false,
            error: 'O instrutor da sessão não pode constar como participante avaliado',
          },
          400,
        );
      }
      // ───────────────────────────────────────────────────────────────────────

      participantesParaNotificacaoAlterados = plan.alterados;
      const { novosValidos, removidos } = plan;

      await applyParticipantes(c.env.DB, {
        empresaId,
        sessaoId: id,
        body: b,
        sessaoAtual,
        plan,
      });

      if (resetarFluxoFichas) {
        await resetFluxoFichasEmAndamento(c.env.DB, id);
      }

      try {
        for (const fid of removidos) {
          await removeManagedEscalaEvents({
            db: c.env.DB,
            funcionarioId: fid,
            origem: 'simuladores',
            linkId: `sim_sessao:${id}`,
          });
        }

        await syncSessaoEscalaEventos(c.env.DB, {
          empresaId,
          sessaoId: id,
          simuladorId: simuladorIdFinal,
          data: dataFinal,
          status: b.status ?? a.status,
          temaSessao: b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
          tipoSessao: b.tipo_sessao ?? a.tipo_sessao,
          observacoes: b.observacoes !== undefined ? b.observacoes : a.observacoes,
          participantes: novosValidos.map((part) => ({ funcionario_id: part.funcionario_id })),
          createdBy: getContextUserId(c),
        });
      } catch (error) {
        // A sessão principal já foi persistida acima — não deixar a falha da
        // integração de Escalas propagar para o catch externo (que responderia
        // 500 apesar do estado principal estar correto). Reportar via 409 abaixo.
        scaleIntegrationError = 'SIMULATOR_SCALE_SYNC_FAILED';
        console.error('[PUT /sessoes] Sessão salva com integração de escala pendente', {
          sessaoId: id,
          empresaId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    const u = await c.env.DB.prepare(
      'SELECT * FROM simulador_agendamentos WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(id, empresaId)
      .first<SimuladorAgendamentoRow>();

    const statusAnterior = String((a as any)?.status || '').toUpperCase();
    const statusNovo = String((u as any)?.status || '').toUpperCase();
    if (isCompletedStatus(statusNovo) && !isCompletedStatus(statusAnterior)) {
      try {
        const syncQualResult = await sincronizarQualificacoesDaSessaoConcluida(c.env.DB, {
          sessaoId: Number(id),
          empresaId,
        });
        diag.qualificacoesConcluidas = syncQualResult.atualizadas;
      } catch (error: any) {
        diag.qualificacoesConcluidasErro = error?.message || String(error);
      }
    }

    console.log('[PUT /sessoes] DEPOIS:', { tipo_sessao: u?.tipo_sessao, nome: u?.nome });

    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: a,
      dados_novos: u,
    });

    if (!b.participantes || !Array.isArray(b.participantes)) {
      const participantesAtivos = await c.env.DB.prepare(
        'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id = ? AND deleted_at IS NULL',
      )
        .bind(id)
        .all<{ funcionario_id: string | number }>();

      try {
        await syncSessaoEscalaEventos(c.env.DB, {
          empresaId,
          sessaoId: id,
          simuladorId: u?.simulador_id,
          data: String(u?.data || dataFinal),
          status: u?.status,
          temaSessao: u?.nome || null,
          tipoSessao: u?.tipo_sessao || null,
          observacoes: u?.observacoes || null,
          participantes: (participantesAtivos.results || []).map((item) => ({
            funcionario_id: item.funcionario_id,
          })),
          createdBy: getContextUserId(c),
        });
      } catch (error) {
        // Idem: sessão já persistida — não deixar propagar para o catch externo.
        scaleIntegrationError = 'SIMULATOR_SCALE_SYNC_FAILED';
        console.error('[PUT /sessoes] Sessão salva com integração de escala pendente', {
          sessaoId: id,
          empresaId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    try {
      const eventEmpresaId = Number((u as any)?.empresa_id || empresaId);
      const partRows = await c.env.DB.prepare(
        'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id = ? AND deleted_at IS NULL',
      )
        .bind(id)
        .all<{ funcionario_id: string | number }>();
      if (eventEmpresaId > 0) {
        await Promise.allSettled(
          (partRows.results || []).map((participante) =>
            publishDomainEvent(
              c.env.DB,
              'simuladores',
              isCompletedStatus((u as any)?.status)
                ? 'SIMULADOR_REALIZADO'
                : 'SIMULADOR_AGENDADO',
              {
                funcionario_id: String(participante.funcionario_id),
                empresa_id: eventEmpresaId,
                origem_modulo: 'simuladores',
                sessao_id: String(id),
                data_sessao: (u as any)?.data || null,
                tipo_sessao: (u as any)?.tipo_sessao || null,
              },
            ),
          ),
        );
      }
    } catch (error) {
      console.error('domain_event_error', error);
    }

    if (shouldNotifySimulatorSessionUpdate(a as any, u as any, participantesParaNotificacaoAlterados)) {
      const notificationEmpresaId = Number((u as any)?.empresa_id || empresaId);
      c.executionCtx?.waitUntil(
        sendSimulatorSessionEmailNotifications(c.env, c.env.DB, Number(id), {
          reason: 'updated',
          empresaId: notificationEmpresaId || undefined,
        })
          .then((results) => {
            const sent = results.filter((item) => item.status === 'sent').length;
            const skipped = results.filter((item) => item.status === 'skipped').length;
            const failed = results.filter((item) => item.status === 'failed').length;
            console.log('[simuladores] session update email notification queued', {
              sessao_id: id,
              sent,
              skipped,
              failed,
            });
          })
          .catch((error) => {
            console.error('[simuladores] session update email notification failed', error);
          }),
      );
    }

    // Email: when session transitions to CONCLUIDA and fichas are in AVALIACAO_PENDENTE,
    // notify instrutor to fill the evaluation.
    if (isCompletedStatus(statusNovo) && !isCompletedStatus(statusAnterior)) {
      try {
        const fichasRows = await c.env.DB.prepare(
          `SELECT id FROM fichas_sessao
           WHERE agendamento_slot_id = ?
             AND status = 'AVALIACAO_PENDENTE'
             AND deleted_at IS NULL`,
        )
          .bind(id)
          .all<{ id: number }>();

        for (const ficha of fichasRows.results || []) {
          enviarEmailFichaSessao(
            c.env,
            c.env.DB,
            Number(ficha.id),
            'instrutor_avaliacao_pendente',
          ).catch((err) => console.error('[fichaEmails] fire-and-forget error:', err));
        }
      } catch (err) {
        console.error('[fichaEmails] Erro ao buscar fichas para notificação:', err);
      }
    }

    const qualificationIntegrationFailed =
      diag.resultado === 'erro' || Boolean(diag.qualificacoesConcluidasErro);
    if (qualificationIntegrationFailed || scaleIntegrationError) {
      const code =
        qualificationIntegrationFailed && scaleIntegrationError
          ? 'SIMULATOR_INTEGRATION_PENDING'
          : qualificationIntegrationFailed
            ? 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING'
            : 'SIMULATOR_SCALE_INTEGRATION_PENDING';
      console.error('[PUT /sessoes] Sessão salva com integração pendente', {
        sessaoId: id,
        empresaId,
        plannedError: diag.erro || null,
        completionError: diag.qualificacoesConcluidasErro || null,
        scaleError: scaleIntegrationError,
      });
      return c.json(
        {
          success: false,
          partial: true,
          code,
          error:
            'Sessão salva, mas uma integração derivada ficou pendente. O estado principal foi preservado.',
          data: u,
          primary_saved: true,
          qualification_synced: !qualificationIntegrationFailed,
          scale_synced: !scaleIntegrationError,
          _diag_planejadas: diag,
        },
        409,
      );
    }

    return c.json({ success: true, data: u, _diag_planejadas: diag });
  } catch (e: any) {
    console.error('[PUT /sessoes] ERRO:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.delete('/sessoes/:id', requireOperacoesSessao('delete'), async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const sessaoId = Number(id);

    // Buscar sessão
    const a = await c.env.DB.prepare(
      'SELECT * FROM simulador_agendamentos WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(id, empresaId)
      .first();
    if (!a) return c.json({ success: false, error: 'Sessão não encontrada' }, 404);

    const notificationData = Number.isFinite(sessaoId)
      ? await loadSimulatorSessionNotificationData(c.env.DB, sessaoId, empresaId)
      : null;

    const participantes = await c.env.DB.prepare(
      'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .all<{ funcionario_id: string | number }>();

    // Soft delete da sessão
    await runUpdate(
      c.env.DB,
      "UPDATE simulador_agendamentos SET deleted_at=datetime('now') WHERE id=? AND empresa_id = ?",
      id,
      empresaId,
    );

    // Soft delete dos participantes
    await c.env.DB.prepare(
      `UPDATE sessoes_participantes AS sp
          SET deleted_at=datetime('now')
        WHERE sp.sessao_id=?
          AND EXISTS (
            SELECT 1
              FROM simulador_agendamentos sa
             WHERE sa.id = sp.sessao_id
               AND sa.empresa_id = ?
          )`,
    )
      .bind(id, empresaId)
      .run();

    // Soft delete da estrutura compartilhada aditiva, quando existir
    await runUpdate(
      c.env.DB,
      `UPDATE simulador_segmento_participantes
       SET deleted_at=datetime('now'), updated_at=datetime('now')
       WHERE segmento_id IN (
         SELECT id
         FROM simulador_agendamento_segmentos
         WHERE agendamento_id = ?
           AND deleted_at IS NULL
       )
         AND deleted_at IS NULL`,
      id,
    ).catch(() => undefined);

    await runUpdate(
      c.env.DB,
      `UPDATE simulador_agendamento_segmentos
       SET deleted_at=datetime('now'), updated_at=datetime('now'), status='CANCELADO'
       WHERE agendamento_id = ?
         AND deleted_at IS NULL`,
      id,
    ).catch(() => undefined);

    await runUpdate(
      c.env.DB,
      `UPDATE simulador_atribuicoes_curriculares
       SET deleted_at=datetime('now'), updated_at=datetime('now'), status='CANCELADA'
       WHERE agendamento_id = ?
         AND deleted_at IS NULL`,
      id,
    ).catch(() => undefined);

    // Soft delete das fichas vinculadas à sessão
    await c.env.DB.prepare(
      "UPDATE fichas_sessao SET deleted_at=datetime('now') WHERE agendamento_slot_id=?",
    )
      .bind(id)
      .run();

    // Cancelar qualificações PLANEJADAS vinculadas à sessão
    await c.env.DB.prepare(
      `UPDATE qualificacoes_historico
       SET deleted_at=datetime('now')
       WHERE sessao_id=?
         AND ${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.PLANEJADA)}
         AND deleted_at IS NULL`,
    )
      .bind(id)
      .run();

    // Auditoria
    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: a,
    });

    await Promise.all(
      (participantes.results || []).map((item) =>
        removeManagedEscalaEvents({
          db: c.env.DB,
          funcionarioId: item.funcionario_id,
          origem: 'simuladores',
          linkId: `sim_sessao:${id}`,
        }),
      ),
    );

    if (notificationData) {
      c.executionCtx?.waitUntil(
        sendSimulatorSessionEmailNotifications(c.env, c.env.DB, sessaoId, {
          reason: 'canceled',
          empresaId,
          preloadedData: notificationData,
        })
          .then((results) => {
            const sent = results.filter((item) => item.status === 'sent').length;
            const skipped = results.filter((item) => item.status === 'skipped').length;
            const failed = results.filter((item) => item.status === 'failed').length;
            console.log('[simuladores] session cancellation email notification queued', {
              sessao_id: sessaoId,
              sent,
              skipped,
              failed,
            });
          })
          .catch((error) => {
            console.error('[simuladores] session cancellation email notification failed', error);
          }),
      );
    }

    return c.json({
      success: true,
      message: 'Sessão, participantes e fichas excluídos com sucesso',
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
