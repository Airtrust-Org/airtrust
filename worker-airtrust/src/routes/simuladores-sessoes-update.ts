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
import {
  requireAdminForDelete,
  timeToMinutes,
  syncSessaoEscalaEventos,
  findSessaoConflict,
  audit,
  getSimuladorModeloAeronave,
  normalizeModeloAeronave,
  resolveTemplateIdSessao,
  normalizeChecksSessao,
  criarQualificacoesPlanejadas,
  listarParticipantesDaSessaoParaQualificacao,
  sincronizarQualificacoesDaSessaoConcluida,
  instrutorEstaEntreParticipantes,
} from './simuladores-shared';
import { getTenantContext } from '../middleware/tenant';
import { buildOperationalFichaManobras, type FichaManobraBase } from '../constants/notechs';
import {
  requireOperationalAccess,
  } from '../services/operational-domain-access';

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

/** Shape of a participante item as received in the PUT /sessoes/:id request body. */
interface SessaoParticipanteInput {
  funcionario_id?: string | number;
  funcao?: string;
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
      const fColsAll = await c.env.DB.prepare("PRAGMA table_info('funcionarios')").all();
      const fColSetAll = new Set((fColsAll.results || []).map((r: any) => r.name));
      const hasIsInstrutor = fColSetAll.has('is_instrutor');
      const instrutorFlagExpr = hasIsInstrutor ? 'COALESCE(is_instrutor, 0)' : '1';
      const instrutorRow = await c.env.DB.prepare(
        `SELECT ${instrutorFlagExpr} as is_instrutor
         FROM funcionarios
         WHERE id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
      )
        .bind(b.instrutor_id, empresaId)
        .first<{ is_instrutor: number }>();

      if (!instrutorRow || (hasIsInstrutor && Number(instrutorRow.is_instrutor) !== 1)) {
        return c.json(
          { success: false, error: 'Instrutor inválido para esta empresa.' },
          400,
        );
      }

      // ── Bloqueio de autoavaliação: novo instrutor não pode já ser
      // participante ativo da sessão (evita autoavaliação por reatribuição
      // de instrutor quando participantes não são reenviados neste PUT). ──
      if (b.participantes === undefined) {
        const participantesAtuais = await c.env.DB.prepare(
          'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id = ? AND deleted_at IS NULL',
        )
          .bind(id)
          .all();
        if (
          instrutorEstaEntreParticipantes(b.instrutor_id, participantesAtuais.results || [])
        ) {
          return c.json(
            {
              success: false,
              error: 'O instrutor da sessão não pode constar como participante avaliado',
            },
            400,
          );
        }
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

    // ============================
    // CHECKS COM EXAMINADORES
    // - Se examinador_id informado: is_check=1
    // - Se examinador_id removido: is_check=0 e soft-delete vínculos
    // - Atualiza vínculos em sessoes_checks
    // ============================

    const examinadorIdBodyRaw =
      b.examinador_id === undefined
        ? undefined
        : b.examinador_id === null
          ? null
          : Number(b.examinador_id);
    const wantsCheck = examinadorIdBodyRaw ? 1 : 0;
    const shouldUpdateCheckFields = b.examinador_id !== undefined || b.checks !== undefined;

    if (shouldUpdateCheckFields) {
      // Validar examinador quando presente
      if (examinadorIdBodyRaw) {
        const fCols = await c.env.DB.prepare("PRAGMA table_info('funcionarios')").all();
        const fColSet = new Set((fCols.results || []).map((r: any) => r.name));
        const hasIsExaminador = fColSet.has('is_examinador');
        const hasIsChecador = fColSet.has('is_checador');
        const examinadorFlagExpr =
          hasIsExaminador && hasIsChecador
            ? '(COALESCE(is_examinador, 0) = 1 OR COALESCE(is_checador, 0) = 1)'
            : hasIsExaminador
              ? 'COALESCE(is_examinador, 0) = 1'
              : hasIsChecador
                ? 'COALESCE(is_checador, 0) = 1'
                : '0 = 1';
        const examinador = await c.env.DB.prepare(
          `SELECT id
           FROM funcionarios
             WHERE id = ?
               AND ${examinadorFlagExpr}
               AND empresa_id = ?
               AND deleted_at IS NULL`,
        )
          .bind(examinadorIdBodyRaw, empresaId)
          .first();
        if (!examinador) {
          return c.json({ success: false, error: 'Examinador inválido' }, 400);
        }
      }

      // Se tiver examinador, exige checks (pelo menos 1)
      if (examinadorIdBodyRaw && checksNormalizados.length === 0) {
        return c.json(
          { success: false, error: 'Selecione pelo menos 1 check ao informar examinador' },
          400,
        );
      }

      // Atualizar campos na sessão
      await c.env.DB.prepare(
        "UPDATE simulador_agendamentos SET examinador_id=?, is_check=?, updated_at=datetime('now') WHERE id=? AND empresa_id = ?",
      )
        .bind(examinadorIdBodyRaw || null, wantsCheck, id, empresaId)
        .run();

      // Soft delete vínculos existentes
      const scOld = await c.env.DB.prepare(
        `SELECT id
         FROM sessoes_checks
         WHERE sessao_id = ? AND deleted_at IS NULL`,
      )
        .bind(id)
        .all();

      if (scOld.results && scOld.results.length > 0) {
        const ids = scOld.results.map((r: any) => r.id).filter((v: any) => v !== undefined);

        await c.env.DB.prepare(
          "UPDATE sessoes_checks SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE sessao_id=? AND deleted_at IS NULL",
        )
          .bind(id)
          .run();

        // Soft delete resultados vinculados aos sessao_check antigos
        for (const scId of ids) {
          await c.env.DB.prepare(
            "UPDATE sessoes_checks_resultados SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE sessao_check_id=? AND deleted_at IS NULL",
          )
            .bind(scId)
            .run();
        }
      }

      // Inserir vínculos novos (se for check)
      if (wantsCheck && checksNormalizados.length > 0) {
        for (const qualificacao_tipo_id of checksNormalizados) {
          await c.env.DB.prepare(
            `INSERT INTO sessoes_checks (sessao_id, qualificacao_tipo_id, created_at, updated_at)
             VALUES (?, ?, datetime('now'), datetime('now'))`,
          )
            .bind(id, qualificacao_tipo_id)
            .run();
        }
      }

      await audit(c.env.DB, {
        tabela: 'simulador_agendamentos',
        acao: 'UPDATE_CHECK_FIELDS',
        registro_id: id,
        dados_anteriores: {
          examinador_id: (a as any).examinador_id,
          is_check: (a as any).is_check,
        },
        dados_novos: {
          examinador_id: examinadorIdBodyRaw || null,
          is_check: wantsCheck,
          checks: checksNormalizados,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FICHAS ESPECIAIS: TREINAMENTO DE INSTRUTOR / CREDENCIAMENTO DE EXAMINADOR
    // Executado independentemente do bloco shouldUpdateCheckFields.
    // Condições (OR):
    //   1. Flag explícita no body: gerar_ficha_examinador
    //   2. Codes FAP13 presentes nos checks atuais da sessão
    // ─────────────────────────────────────────────────────────────────────────
    {
      const instrutorEspecial =
        b.instrutor_id !== undefined ? b.instrutor_id : (a as any).instrutor_id;
      if (instrutorEspecial) {
        // Buscar códigos dos checks atuais da sessão
        const codRes = await c.env.DB.prepare(
          `SELECT qt.codigo FROM sessoes_checks sc
           JOIN qualificacoes_tipos qt ON sc.qualificacao_tipo_id = qt.id
           WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL AND qt.deleted_at IS NULL`,
        )
          .bind(id)
          .all();
        const codsAtuais = (codRes.results || []).map((r: any) =>
          String(r.codigo || '').toUpperCase(),
        );

        // Buscar template_ids dos modelos especiais
        const tplRes = await c.env.DB.prepare(
          `SELECT id, codigo FROM modelos_sessao
           WHERE codigo IN ('CRED-EXA') AND empresa_id = ? AND deleted_at IS NULL`,
        )
          .bind(empresaId)
          .all();
        const tplMap = new Map(
          (tplRes.results || []).map((r: any) => [String(r.codigo), r.id as number]),
        );

        // Inferir tipo_aeronave das fichas existentes
        let tipoAeronaveEsp = b.tipo_aeronave || null;
        if (!tipoAeronaveEsp) {
          const fichaRef = await c.env.DB.prepare(
            `SELECT tipo_aeronave FROM fichas_sessao
             WHERE agendamento_slot_id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
          )
            .bind(id, empresaId)
            .first();
          tipoAeronaveEsp = (fichaRef as any)?.tipo_aeronave || null;
        }
        const dataEsp = b.data || (a as any).data;
        const examinadorEsp =
          examinadorIdBodyRaw !== undefined
            ? examinadorIdBodyRaw
            : ((a as any).examinador_id ?? null);

        const fichasEsp = [
          {
            modelo: 'CRED-EXA',
            ativo:
              b.gerar_ficha_examinador === true || codsAtuais.some((c) => c.startsWith('FAP13')),
          },
        ];

        for (const esp of fichasEsp) {
          const existe = await c.env.DB.prepare(
            `SELECT id,
                    status,
                    assinatura_aluno_timestamp,
                    assinatura_instrutor_timestamp,
                    assinatura_aluno_imagem,
                    assinatura_instrutor_imagem,
                    data_conclusao
             FROM fichas_sessao
             WHERE agendamento_slot_id = ? AND colaborador_id_aluno = ?
               AND tipo_sessao = ? AND empresa_id = ? AND deleted_at IS NULL`,
          )
            .bind(id, instrutorEspecial, esp.modelo, empresaId)
            .first();

          if (!esp.ativo) {
            if (existe) {
              const fichaExistente = existe as any;
              const fichaJaUtilizada = Boolean(
                fichaExistente.assinatura_aluno_timestamp ||
                fichaExistente.assinatura_instrutor_timestamp ||
                fichaExistente.assinatura_aluno_imagem ||
                fichaExistente.assinatura_instrutor_imagem ||
                fichaExistente.data_conclusao ||
                (fichaExistente.status && fichaExistente.status !== 'AVALIACAO_PENDENTE'),
              );

              if (!fichaJaUtilizada) {
                await c.env.DB.prepare(
                  `UPDATE fichas_sessao
                   SET deleted_at = datetime('now')
                   WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
                )
                  .bind(fichaExistente.id, empresaId)
                  .run();

                await c.env.DB.prepare(
                  `UPDATE fichas_sessao_manobras
                   SET deleted_at = datetime('now')
                   WHERE ficha_id = ? AND deleted_at IS NULL`,
                )
                  .bind(fichaExistente.id)
                  .run();
              }
            }

            continue;
          }

          if (!existe) {
            await c.env.DB.prepare(
              `INSERT INTO fichas_sessao
                 (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id,
                  tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?)`,
            )
              .bind(
                crypto.randomUUID(),
                id,
                instrutorEspecial,
                examinadorEsp || instrutorEspecial,
                esp.modelo,
                tipoAeronaveEsp,
                dataEsp,
                tplMap.get(esp.modelo) ?? null,
                empresaId,
              )
              .run();
          }
        }
      }
    }

    // Determinar tipo_dispositivo final
    const tipoDispositivoFinal: 'SIMULADOR' | 'AERONAVE' =
      b.tipo_dispositivo === 'AERONAVE'
        ? 'AERONAVE'
        : (a as any).tipo_dispositivo === 'AERONAVE'
          ? 'AERONAVE'
          : 'SIMULADOR';

    // Validação de horário + conflito (apenas para simuladores)
    const simuladorIdFinal = Number(b.simulador_id ?? a.simulador_id);
    const dataFinal = String(b.data ?? a.data);
    const inicioStr = b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio;
    const fimStr = b.horario_fim !== undefined ? b.horario_fim : a.hora_fim;

    if (!inicioStr || !fimStr) {
      return c.json({ success: false, error: 'Horário de início e fim são obrigatórios' }, 400);
    }

    const inicioMin = timeToMinutes(inicioStr);
    const fimMin = timeToMinutes(fimStr);
    if (inicioMin === null || fimMin === null) {
      return c.json({ success: false, error: 'Horários inválidos (use HH:MM)' }, 400);
    }
    if (fimMin === inicioMin) {
      return c.json(
        { success: false, error: 'Horário final deve ser diferente do horário inicial' },
        400,
      );
    }

    if (tipoDispositivoFinal === 'SIMULADOR' && simuladorIdFinal) {
      const conflito = await findSessaoConflict(c.env.DB, {
        simuladorId: simuladorIdFinal,
        data: dataFinal,
        inicioMin,
        fimMin,
        excludeId: id,
      });
      if (conflito) {
        const hi =
          typeof conflito.hora_inicio === 'string' ? conflito.hora_inicio.substring(0, 5) : '';
        const hf = typeof conflito.hora_fim === 'string' ? conflito.hora_fim.substring(0, 5) : '';
        return c.json(
          {
            success: false,
            code: 'SCHEDULE_CONFLICT',
            error: `Conflito de agendamento: já existe uma sessão neste simulador de ${hi} a ${hf}. Escolha outro horário.`,
          },
          409,
        );
      }
    }

    console.log('[PUT /sessoes] ANTES:', { id, tipo_sessao: a.tipo_sessao, nome: a.nome });
    console.log('[PUT /sessoes] PAYLOAD:', {
      tipo_sessao: b.tipo_sessao,
      tema_sessao: b.tema_sessao,
    });

    const templateIdFinal = await resolveTemplateIdSessao(c.env.DB, {
      empresaId,
      templateId: templateIdBody !== undefined ? templateIdBody : (a as any).template_id,
      temaSessao: b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
      tipoSessaoCodigo: b.tipo_sessao !== undefined ? b.tipo_sessao : a.tipo_sessao,
      modeloAeronave: modeloAeronaveSessao,
    });

    // Verificar se as colunas tipo_dispositivo e aeronave_id existem (migration 0364)
    const colInfoUpd = await c.env.DB.prepare('PRAGMA table_info(simulador_agendamentos)').all();
    const colNomesUpd = new Set((colInfoUpd.results || []).map((r: any) => r.name));
    const hasTipoDispositivoUpd = colNomesUpd.has('tipo_dispositivo');
    const hasAeronaveIdUpd = colNomesUpd.has('aeronave_id');

    const updateFields = hasTipoDispositivoUpd && hasAeronaveIdUpd
      ? "UPDATE simulador_agendamentos SET simulador_id=?,aeronave_id=?,tipo_dispositivo=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,instrutor_id=?,tipo_sessao=?,template_id=?,status=?,observacoes=?,nome=?,updated_at=datetime('now') WHERE id=? AND empresa_id = ?"
      : "UPDATE simulador_agendamentos SET simulador_id=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,instrutor_id=?,tipo_sessao=?,template_id=?,status=?,observacoes=?,nome=?,updated_at=datetime('now') WHERE id=? AND empresa_id = ?";

    const updateBinds = hasTipoDispositivoUpd && hasAeronaveIdUpd
      ? [
          b.simulador_id !== undefined ? b.simulador_id : a.simulador_id,
          b.aeronave_id !== undefined ? b.aeronave_id : (a as any).aeronave_id,
          tipoDispositivoFinal,
          b.data || a.data,
          b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio,
          b.horario_fim !== undefined ? b.horario_fim : a.hora_fim,
          b.duracao_minutos !== undefined ? b.duracao_minutos : a.duracao_minutos,
          b.instrutor_id !== undefined ? b.instrutor_id : a.instrutor_id,
          b.tipo_sessao || a.tipo_sessao,
          templateIdFinal,
          b.status || a.status,
          b.observacoes !== undefined ? b.observacoes : a.observacoes,
          b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
          id,
          empresaId,
        ]
      : [
          b.simulador_id || a.simulador_id,
          b.data || a.data,
          b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio,
          b.horario_fim !== undefined ? b.horario_fim : a.hora_fim,
          b.duracao_minutos !== undefined ? b.duracao_minutos : a.duracao_minutos,
          b.instrutor_id !== undefined ? b.instrutor_id : a.instrutor_id,
          b.tipo_sessao || a.tipo_sessao,
          templateIdFinal,
          b.status || a.status,
          b.observacoes !== undefined ? b.observacoes : a.observacoes,
          b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
          id,
          empresaId,
        ];

    // UPDATE: incluindo hora_inicio, hora_fim, nome (tema_sessao), tipo_dispositivo, aeronave_id
    await c.env.DB.prepare(updateFields)
      .bind(...updateBinds)
      .run();

    // Sincronizar data_conclusao nas qualificações PLANEJADAS vinculadas (se a data mudou)
    if (b.data && b.data !== (a as any).data) {
      await c.env.DB.prepare(
        `UPDATE qualificacoes_historico
         SET data_conclusao=?, updated_at=datetime('now')
         WHERE sessao_id=?
           AND ${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.PLANEJADA)}
           AND deleted_at IS NULL`,
      )
        .bind(b.data, id)
        .run();
    }

    // Criar qualificações PLANEJADAS se a sessão ainda não as tiver (ex: sessão criada antes do deploy)
    const diag: Record<string, unknown> = {};
    let scaleIntegrationError: string | null = null;
    const hasPlanejadas = await c.env.DB.prepare(
      `SELECT 1 FROM qualificacoes_historico
       WHERE sessao_id=?
         AND ${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.PLANEJADA)}
         AND deleted_at IS NULL
       LIMIT 1`,
    )
      .bind(id)
      .first();
    diag.hasPlanejadas = !!hasPlanejadas;
    if (!hasPlanejadas) {
      const tipoSessaoPut = (b.tipo_sessao || (a as any).tipo_sessao || '').toString();
      let modeloIdPut = Number(templateIdFinal || (a as any).template_id || 0) || null;
      diag.tipoSessao = tipoSessaoPut;
      diag.modeloIdInicial = modeloIdPut;
      diag.templateIdFinal = templateIdFinal;

      // Robust model fallback: prioritize gera_qualificacao=1, then name match
      if (!modeloIdPut && tipoSessaoPut) {
        const upperNome = String(b.tema_sessao || (a as any).nome || '').trim().toUpperCase();

        // Priority 1: model with gera_qualificacao=1 matching tipo_sessao + modelo_aeronave
        let fallbackModelo = await c.env.DB.prepare(
          `SELECT ms.id, ms.nome
           FROM modelos_sessao ms
           INNER JOIN tipos_sessao ts
             ON ms.tipo_sessao_id = ts.id
            AND ts.empresa_id = ?
            AND ts.deleted_at IS NULL
           WHERE ts.codigo = ?
             AND ms.modelo_aeronave = ?
             AND ms.deleted_at IS NULL
             AND ms.empresa_id = ?
             AND ms.gera_qualificacao = 1
           ORDER BY CASE WHEN UPPER(ms.nome) = ? THEN 0 ELSE 1 END, ms.id DESC
           LIMIT 1`,
        )
          .bind(empresaId, tipoSessaoPut, modeloAeronaveSessao, empresaId, upperNome)
          .first<{ id: number; nome: string }>();

        // Priority 2: any model matching tipo_sessao + modelo_aeronave (prefer name match)
        if (!fallbackModelo) {
          fallbackModelo = await c.env.DB.prepare(
            `SELECT ms.id, ms.nome
             FROM modelos_sessao ms
             INNER JOIN tipos_sessao ts
               ON ms.tipo_sessao_id = ts.id
              AND ts.empresa_id = ?
              AND ts.deleted_at IS NULL
             WHERE ts.codigo = ?
               AND ms.modelo_aeronave = ?
               AND ms.deleted_at IS NULL
               AND ms.empresa_id = ?
             ORDER BY CASE WHEN UPPER(ms.nome) = ? THEN 0 ELSE 1 END, ms.id DESC
             LIMIT 1`,
          )
            .bind(empresaId, tipoSessaoPut, modeloAeronaveSessao, empresaId, upperNome)
            .first<{ id: number; nome: string }>();
        }

        diag.fallbackModelo = fallbackModelo?.id ?? null;
        if (fallbackModelo) modeloIdPut = fallbackModelo.id;
      }
      diag.modeloIdFinal = modeloIdPut;

      if (modeloIdPut) {
        const participantesRows = await listarParticipantesDaSessaoParaQualificacao(c.env.DB, id);
        diag.numParticipantes = participantesRows.length;
        if (participantesRows.length > 0) {
          try {
            const res = await criarQualificacoesPlanejadas(c.env.DB, {
              sessaoId: Number(id),
              modeloId: modeloIdPut,
              tipoSessao: tipoSessaoPut,
              data: b.data || (a as any).data,
              participantes: participantesRows,
              empresaId,
            });
            diag.resultado = res.criadas > 0 ? 'criadas' : 'sem_novas';
            diag.criadas = res.criadas;
            diag.puladas = res.puladas;
            diag.conflitosUniques = res.conflitosUniques;
            diag.bloqueadasDataPassada = res.bloqueadasDataPassada;
          } catch (err: any) {
            diag.resultado = 'erro';
            diag.erro = err?.message || String(err);
          }
        } else {
          diag.resultado = 'sem_participantes';
        }
      } else {
        diag.resultado = 'sem_modelo';
      }
    } else {
      diag.resultado = 'ja_tem_planejadas';
    }

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
      await c.env.DB.prepare(
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
           AND deleted_at IS NULL`,
      )
        .bind(id)
        .run();

      await c.env.DB.prepare(
        `UPDATE fichas_sessao_manobras
         SET resultado = NULL,
             observacoes = '',
             updated_at = datetime('now')
         WHERE ficha_id IN (
           SELECT id
           FROM fichas_sessao
           WHERE agendamento_slot_id = ?
             AND deleted_at IS NULL
         )
           AND deleted_at IS NULL`,
      )
        .bind(id)
        .run();
    }

    // ATUALIZAR PARTICIPANTES + SINCRONIZAR FICHAS
    if (b.participantes && Array.isArray(b.participantes)) {
      const sessaoAtual = await c.env.DB.prepare(
        'SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL',
      )
        .bind(id)
        .first();

      // IDs dos participantes que estão na sessão atualmente
      const partAntigosRows = await c.env.DB.prepare(
        'SELECT funcionario_id, funcao FROM sessoes_participantes WHERE sessao_id=? AND deleted_at IS NULL',
      )
        .bind(id)
        .all();
      const idsAntigos = new Set(
        (partAntigosRows.results || []).map((r: any) => Number(r.funcionario_id)),
      );

      // IDs novos enviados pelo frontend
      const novosValidos = (b.participantes as SessaoParticipanteInput[]).filter(
        (p): p is SessaoParticipanteInput & { funcionario_id: string | number } =>
          Boolean(p.funcionario_id),
      );

      // ── Bloqueio de autoavaliação: instrutor não pode ser participante ────
      const instrutorEfetivo =
        b.instrutor_id !== undefined ? b.instrutor_id : (a as any)?.instrutor_id;
      if (instrutorEstaEntreParticipantes(instrutorEfetivo, novosValidos)) {
        return c.json(
          {
            success: false,
            error: 'O instrutor da sessão não pode constar como participante avaliado',
          },
          400,
        );
      }
      // ───────────────────────────────────────────────────────────────────────

      const idsNovos = new Set(novosValidos.map((p: any) => Number(p.funcionario_id)));
      const assinaturaAntiga = (partAntigosRows.results || [])
        .map((p: any) => `${Number(p.funcionario_id)}:${String(p.funcao || '').toUpperCase()}`)
        .sort()
        .join('|');
      const assinaturaNova = novosValidos
        .map((p: any, index: number) => {
          const funcao = p.funcao || (index === 0 ? 'PIC' : 'SIC');
          return `${Number(p.funcionario_id)}:${String(funcao || '').toUpperCase()}`;
        })
        .sort()
        .join('|');
      participantesParaNotificacaoAlterados = assinaturaAntiga !== assinaturaNova;

      // Participantes removidos = estavam antes, não estão mais
      const removidos = [...idsAntigos].filter((fid) => !idsNovos.has(fid));

      // Soft-delete fichas de participantes removidos
      for (const fid of removidos) {
        await c.env.DB.prepare(
          "UPDATE fichas_sessao SET deleted_at=datetime('now') WHERE agendamento_slot_id=? AND colaborador_id_aluno=? AND deleted_at IS NULL",
        )
          .bind(id, fid)
          .run();
      }

      // Soft-delete todos os participantes antigos
      await c.env.DB.prepare(
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
        .bind(id, empresaId)
        .run();

      // Inserir participantes novos + criar fichas para os que entraram agora
      for (const [index, part] of novosValidos.entries()) {
        const funcao = part.funcao || (index === 0 ? 'PIC' : 'SIC');
        const partUuid = crypto.randomUUID();
        await c.env.DB.prepare(
          `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
           VALUES (?, ?, ?, ?, 'CONFIRMADO')`,
        )
          .bind(partUuid, id, part.funcionario_id, funcao)
          .run();

        // Criar ficha para qualquer participante que ainda não a tenha (cobre retroativos)
        const fichaExistente = await c.env.DB.prepare(
          'SELECT id FROM fichas_sessao WHERE agendamento_slot_id=? AND colaborador_id_aluno=? AND deleted_at IS NULL',
        )
          .bind(id, part.funcionario_id)
          .first();

        if (!fichaExistente) {
          const fichaUuid = crypto.randomUUID();
          const tipoSessao = (sessaoAtual as any)?.tipo_sessao || b.tipo_sessao || 'TREINAMENTO';
          const instrutorIdFinal =
            b.instrutor_id !== undefined
              ? b.instrutor_id
              : (sessaoAtual as any)?.instrutor_id || null;
          const dataFichaFinal =
            b.data || (sessaoAtual as any)?.data || new Date().toISOString().split('T')[0];

          // Inferir tipo_aeronave: preferir payload, senão simulador da sessão, senão ficha existente
          let tipoAeronave: string | null = b.tipo_aeronave || null;
          if (!tipoAeronave) {
            const fichaRef = await c.env.DB.prepare(
              'SELECT tipo_aeronave FROM fichas_sessao WHERE agendamento_slot_id=? AND empresa_id=? AND deleted_at IS NULL LIMIT 1',
            )
              .bind(id, empresaId)
              .first();
            tipoAeronave = (fichaRef as any)?.tipo_aeronave || null;
          }
          if (!tipoAeronave) {
            tipoAeronave =
              (await getSimuladorModeloAeronave(
                c.env.DB,
                (sessaoAtual as { simulador_id?: string | number | null } | null)?.simulador_id,
                empresaId,
              )) || null;
          }

          const resultFicha = await c.env.DB.prepare(
            `INSERT INTO fichas_sessao (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, empresa_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?)`,
          )
            .bind(
              fichaUuid,
              id,
              part.funcionario_id,
              instrutorIdFinal,
              tipoSessao,
              tipoAeronave,
              dataFichaFinal,
              empresaId,
            )
            .run();

          const fichaId = resultFicha.meta.last_row_id;

          // Popular manobras automaticamente
          const modeloIdCandidate =
            b.modelo_sessao_id || b.template_id || (sessaoAtual as any)?.template_id || null;
          let modeloIdFinal: number | null = null;

          if (modeloIdCandidate) {
            const modeloTenant = await c.env.DB.prepare(
              `SELECT id
                 FROM modelos_sessao
                WHERE id = ?
                  AND empresa_id = ?
                  AND deleted_at IS NULL
                LIMIT 1`,
            )
              .bind(modeloIdCandidate, empresaId)
              .first<{ id: number }>();
            if (modeloTenant) modeloIdFinal = Number(modeloTenant.id);
          }

          if (!modeloIdFinal) {
            const modeloEncontrado = await c.env.DB.prepare(
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
              .bind(empresaId, tipoSessao, tipoAeronave, empresaId)
              .first<{ id: number }>();
            if (modeloEncontrado) modeloIdFinal = Number(modeloEncontrado.id);
          }

          if (modeloIdFinal) {
            const manobrasModelo = await c.env.DB.prepare(
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
              .bind(empresaId, modeloIdFinal)
              .all();

            const manobras = buildOperationalFichaManobras(
              ((manobrasModelo.results || []) as unknown) as FichaManobraBase[],
            );
            if (manobras.length > 0) {
              const insertManobrasStmt = c.env.DB.prepare(
                `INSERT INTO fichas_sessao_manobras (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, resultado, observacoes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '')`,
              );
              const statements = manobras.map((man) => {
                const m = man as {
                  codigo: string;
                  nome: string;
                  descricao: string;
                  categoria: string;
                  ordem: number;
                  tripulante: string;
                };
                return insertManobrasStmt.bind(
                  fichaId,
                  m.codigo,
                  m.nome || m.descricao || '',
                  m.descricao || '',
                  m.categoria || 'GERAL',
                  m.ordem,
                  m.tripulante || 'AB',
                );
              });
              
              // Executar em lotes de 100 para respeitar limites do D1
              for (let i = 0; i < statements.length; i += 100) {
                await c.env.DB.batch(statements.slice(i, i + 100));
              }
            }
          }
        }
      }

      if (resetarFluxoFichas) {
        await c.env.DB.prepare(
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
             AND deleted_at IS NULL`,
        )
          .bind(id)
          .run();

        await c.env.DB.prepare(
          `UPDATE fichas_sessao_manobras
           SET resultado = NULL,
               observacoes = '',
               updated_at = datetime('now')
           WHERE ficha_id IN (
             SELECT id
             FROM fichas_sessao
             WHERE agendamento_slot_id = ?
               AND deleted_at IS NULL
           )
             AND deleted_at IS NULL`,
        )
          .bind(id)
          .run();
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
