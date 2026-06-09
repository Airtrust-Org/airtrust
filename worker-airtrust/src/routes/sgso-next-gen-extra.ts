/**
 * SGSO Next-Gen — Extra routes
 *
 * ## Multi-tenant design: FRAT global template pattern
 *
 * `sgso_frat_modelos`, `sgso_frat_fatores`, and `sgso_matriz_risco_perfis`
 * use `empresa_id = 0` as a sentinel for **global templates**. These are:
 * - Seeded once by migration 0281 (`empresa_id NOT NULL DEFAULT 0`).
 * - Cloned per active company by migration 0282.
 * - Read by all tenants via `WHERE (empresa_id = ? OR empresa_id = 0)`.
 * - **Never writable by tenants** — FRAT evaluations/approvals are strictly
 *   tenant-scoped (`WHERE a.empresa_id = ?`).
 *
 * This gives every tenant a set of default risk-matrix profiles and FRAT
 * models, plus the ability to create company-specific overrides. The `0`
 * sentinel is intentional, not an orphan or a leak — no tenant data lives
 * under `empresa_id = 0`.
 *
 * Routes:
 *   GET  /frat/modelos
 *   GET  /frat/avaliacoes
 *   POST /frat/avaliacoes
 *   GET  /frat/avaliacoes/:id
 *   POST /frat/avaliacoes/:id/aprovacoes
 *   PATCH /frat/avaliacoes/:id/escalacao
 *   GET  /compliance/rbac121/checklist
 *   GET  /moc/registros
 *   GET  /moc/registros/:id
 *   POST /moc/registros
 *   PATCH /moc/registros/:id/workflow
 *   GET  /licoes-aprendidas
 *   POST /licoes-aprendidas/:id/publicar-edapp
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { FratApprovalSchema, FratEvaluationSchema, scoreFratResponses } from '../lib/sgso-next-gen';
import {
  type AppCtx,
  type InvestigationType,
  getUid,
  uuid,
  now,
  insertAuditTrail,
  tableExists,
  MocRecordSchema,
  MocWorkflowSchema,
  publishLessonToEdApp,
} from './sgso-next-gen-helpers';

const extra = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

extra.get('/frat/modelos', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const modelos = await db
      .prepare(
        `SELECT * FROM sgso_frat_modelos
         WHERE (empresa_id = ? OR empresa_id = 0) AND ativo = 1
         ORDER BY CASE WHEN empresa_id = ? THEN 0 ELSE 1 END, nome ASC
         LIMIT 100`,
      )
      .bind(empresaId, empresaId)
      .all<Record<string, unknown>>();

    // Carrega todos os fatores de uma vez (evita N+1)
    const modeloIds = (modelos.results || []).map((m: any) => m.id as number);
    let fatoresPorModelo = new Map<number, Record<string, unknown>[]>();
    if (modeloIds.length > 0) {
      const placeholders = modeloIds.map(() => '?').join(',');
      const todosOsFatores = await db
        .prepare(
          `SELECT * FROM sgso_frat_fatores WHERE modelo_id IN (${placeholders}) AND ativo = 1 ORDER BY modelo_id, ordem_exibicao ASC`,
        )
        .bind(...modeloIds)
        .all<Record<string, unknown>>();
      for (const fator of todosOsFatores.results || []) {
        const mid = fator.modelo_id as number;
        if (!fatoresPorModelo.has(mid)) fatoresPorModelo.set(mid, []);
        fatoresPorModelo.get(mid)!.push(fator);
      }
    }

    const data = (modelos.results || []).map((modelo: any) => ({
      ...modelo,
      fatores: fatoresPorModelo.get(modelo.id as number) ?? [],
    }));

    return c.json({ success: true, data });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao listar modelos FRAT', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.get('/frat/avaliacoes', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const rows = await db
      .prepare(
        `SELECT a.*, m.nome AS modelo_nome, f.nome AS tripulante_nome, apro.nome AS aprovador_nome
         FROM sgso_frat_avaliacoes a
         JOIN sgso_frat_modelos m ON m.id = a.modelo_id
         LEFT JOIN funcionarios f ON f.id = a.tripulante_id AND f.deleted_at IS NULL
         LEFT JOIN funcionarios apro ON apro.id = a.aprovado_por AND apro.deleted_at IS NULL
         WHERE a.empresa_id = ? AND a.deleted_at IS NULL
         ORDER BY a.created_at DESC
         LIMIT 50`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();
    return c.json({ success: true, data: rows.results });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao listar avaliações FRAT', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.post('/frat/avaliacoes', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c as AppCtx);
    const db = c.env.DB;
    const body = await c.req.json();
    const parsed = FratEvaluationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;
    const modelo = await db
      .prepare(
        'SELECT * FROM sgso_frat_modelos WHERE id = ? AND (empresa_id = ? OR empresa_id = 0) AND ativo = 1',
      )
      .bind(d.modelo_id, empresaId)
      .first<Record<string, unknown>>();
    if (!modelo) return c.json({ success: false, error: 'Modelo FRAT não encontrado' }, 404);

    const fatores = await db
      .prepare(
        'SELECT id, codigo, tipo_resposta, peso_base, regra_score_json FROM sgso_frat_fatores WHERE modelo_id = ? AND ativo = 1 ORDER BY ordem_exibicao ASC',
      )
      .bind(d.modelo_id)
      .all<{
        id: number;
        codigo: string;
        tipo_resposta: string;
        peso_base: number;
        regra_score_json: string | null;
      }>();

    const scored = scoreFratResponses(fatores.results, d.respostas);
    const exigeAprovacao = ['ALTO', 'CRITICO'].includes(scored.level) ? 1 : 0;
    const avaliacaoId = uuid();
    const ts = now();
    await db
      .prepare(
        `INSERT INTO sgso_frat_avaliacoes
         (id, empresa_id, modelo_id, escala_id, alocacao_id, tripulante_id, aeronave_id,
          data_operacao, score_total, nivel_risco, status, exige_aprovacao, despacho_bloqueado,
          origem_vinculo, frms_fadiga_checkin_id, justificativa, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMETIDO', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        avaliacaoId,
        empresaId,
        d.modelo_id,
        d.escala_id ?? null,
        d.alocacao_id ?? null,
        d.tripulante_id ?? null,
        d.aeronave_id ?? null,
        d.data_operacao,
        scored.totalScore,
        scored.level,
        exigeAprovacao,
        exigeAprovacao,
        d.origem_vinculo ?? 'MANUAL',
        d.frms_fadiga_checkin_id ?? null,
        d.justificativa ?? null,
        uid,
        ts,
        ts,
      )
      .run();

    for (const answer of d.respostas) {
      const scoredAnswer = scored.responseScores.find((item) => item.fatorId === answer.fator_id);
      await db
        .prepare(
          `INSERT INTO sgso_frat_respostas
           (avaliacao_id, fator_id, empresa_id, resposta_texto, resposta_numero, score_aplicado, observacao, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          avaliacaoId,
          answer.fator_id,
          empresaId,
          scoredAnswer?.textValue ??
            (typeof answer.resposta === 'number' ? null : String(answer.resposta)),
          scoredAnswer?.numberValue ??
            (typeof answer.resposta === 'number' ? answer.resposta : null),
          scoredAnswer?.score ?? 0,
          answer.observacao ?? null,
          ts,
        )
        .run();
    }

    await insertAuditTrail(db, empresaId, 'FRAT_AVALIACAO', avaliacaoId, 'CRIADA', uid, {
      score_total: scored.totalScore,
      nivel_risco: scored.level,
      exige_aprovacao: Boolean(exigeAprovacao),
    });

    if (d.frms_fadiga_checkin_id) {
      try {
        await db
          .prepare(
            `UPDATE frms_fadiga_checkin
             SET associado_frat_avaliacao_id = ?,
                 frat_sugerido_nivel = ?,
                 updated_at = datetime('now')
             WHERE empresa_id = ?
               AND id = ?
               AND deleted_at IS NULL`,
          )
          .bind(avaliacaoId, scored.level, empresaId, d.frms_fadiga_checkin_id)
          .run();
      } catch (linkErr) {
        console.warn('[SGSO NEXT] FRAT bridge por checkin_id não aplicado:', linkErr);
      }
    } else if (d.tripulante_id && d.data_operacao) {
      try {
        await db
          .prepare(
            `UPDATE frms_fadiga_checkin
             SET associado_frat_avaliacao_id = ?,
                 frat_sugerido_nivel = ?,
                 updated_at = datetime('now')
             WHERE empresa_id = ?
               AND funcionario_id = ?
               AND data_checkin = ?
               AND deleted_at IS NULL`,
          )
          .bind(avaliacaoId, scored.level, empresaId, d.tripulante_id, d.data_operacao)
          .run();
      } catch (linkErr) {
        console.warn('[SGSO NEXT] FRAT bridge check-in não aplicado:', linkErr);
      }
    }

    return c.json(
      {
        success: true,
        data: {
          id: avaliacaoId,
          score_total: scored.totalScore,
          raw_score: scored.rawScore,
          context_rules: scored.contextRules,
          nivel_risco: scored.level,
          exige_aprovacao: Boolean(exigeAprovacao),
          despacho_bloqueado: Boolean(exigeAprovacao),
        },
      },
      201,
    );
  } catch (error) {
    console.error('[SGSO NEXT] Erro ao criar avaliação FRAT:', error);
    return c.json(
      { success: false, error: 'Erro ao criar avaliação FRAT', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.get('/frat/avaliacoes/:id', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();
    const avaliacao = await db
      .prepare(
        `SELECT a.*, m.nome AS modelo_nome, f.nome AS tripulante_nome, apro.nome AS aprovador_nome
         FROM sgso_frat_avaliacoes a
         JOIN sgso_frat_modelos m ON m.id = a.modelo_id
         LEFT JOIN funcionarios f ON f.id = a.tripulante_id AND f.deleted_at IS NULL
         LEFT JOIN funcionarios apro ON apro.id = a.aprovado_por AND apro.deleted_at IS NULL
         WHERE a.id = ? AND a.empresa_id = ? AND a.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<Record<string, unknown>>();
    if (!avaliacao) return c.json({ success: false, error: 'Avaliação FRAT não encontrada' }, 404);
    const respostas = await db
      .prepare(
        `SELECT r.*, f.codigo, f.pergunta, f.categoria
         FROM sgso_frat_respostas r
         JOIN sgso_frat_fatores f ON f.id = r.fator_id
         WHERE r.avaliacao_id = ? AND r.empresa_id = ?
         ORDER BY f.ordem_exibicao ASC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();
    const aprovacoes = await db
      .prepare(
        `SELECT a.*, f.nome AS aprovador_nome
         FROM sgso_frat_aprovacoes a
         LEFT JOIN funcionarios f ON f.id = a.aprovador_id AND f.deleted_at IS NULL
         WHERE a.avaliacao_id = ? AND a.empresa_id = ?
         ORDER BY a.created_at DESC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();
    return c.json({
      success: true,
      data: { ...avaliacao, respostas: respostas.results, aprovacoes: aprovacoes.results },
    });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao buscar avaliação FRAT', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.post('/frat/avaliacoes/:id/aprovacoes', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c as AppCtx);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();
    const parsed = FratApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const avaliacao = await db
      .prepare(
        'SELECT id, status FROM sgso_frat_avaliacoes WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; status: string }>();
    if (!avaliacao) return c.json({ success: false, error: 'Avaliação FRAT não encontrada' }, 404);

    const d = parsed.data;
    const ts = now();
    await db
      .prepare(
        `INSERT INTO sgso_frat_aprovacoes
         (avaliacao_id, empresa_id, decisao, aprovador_id, motivo, despacho_liberado, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, empresaId, d.decisao, uid, d.motivo ?? null, d.decisao === 'APROVAR' ? 1 : 0, ts)
      .run();

    const novoStatus =
      d.decisao === 'APROVAR' ? 'APROVADO' : d.decisao === 'REJEITAR' ? 'REJEITADO' : 'SUBMETIDO';
    await db
      .prepare(
        `UPDATE sgso_frat_avaliacoes
         SET status = ?, aprovado_por = ?, aprovado_em = ?, despacho_bloqueado = ?, updated_at = ?
         WHERE id = ? AND empresa_id = ?`,
      )
      .bind(novoStatus, uid, ts, d.decisao === 'APROVAR' ? 0 : 1, ts, id, empresaId)
      .run();

    await insertAuditTrail(db, empresaId, 'FRAT_AVALIACAO', id, 'APROVACAO_REGISTRADA', uid, {
      decisao: d.decisao,
      motivo: d.motivo ?? null,
    });

    return c.json({ success: true, data: { id, status: novoStatus } });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao aprovar avaliação FRAT', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

// ─── FRAT: Escalação Multi-Nível (L1 → L2 → OPS) ─────────────────────────────
extra.patch('/frat/avaliacoes/:id/escalacao', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c as AppCtx);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = (await c.req.json()) as { nivel_destino?: string; motivo?: string };

    const niveisValidos = ['L1', 'L2', 'L3'];
    if (!body.nivel_destino || !niveisValidos.includes(body.nivel_destino)) {
      return c.json({ success: false, error: 'nivel_destino inválido. Use: L1, L2 ou L3' }, 400);
    }

    const avaliacao = await db
      .prepare(
        `SELECT id, status, nivel_aprovacao_atual
         FROM sgso_frat_avaliacoes
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<{ id: string; status: string; nivel_aprovacao_atual: string | null }>();

    if (!avaliacao) return c.json({ success: false, error: 'Avaliação FRAT não encontrada' }, 404);
    if (avaliacao.status === 'APROVADO' || avaliacao.status === 'REJEITADO') {
      return c.json({ success: false, error: 'Avaliação já encerrada' }, 400);
    }

    const ts = now();
    await db
      .prepare(
        `UPDATE sgso_frat_avaliacoes
         SET nivel_aprovacao_atual = ?, updated_at = ?
         WHERE id = ? AND empresa_id = ?`,
      )
      .bind(body.nivel_destino, ts, id, empresaId)
      .run();

    await db
      .prepare(
        `INSERT INTO sgso_frat_aprovacoes
         (avaliacao_id, empresa_id, decisao, aprovador_id, motivo, despacho_liberado, nivel, created_at)
         VALUES (?, ?, 'SOLICITAR_REVISAO', ?, ?, 0, ?, ?)`,
      )
      .bind(
        id,
        empresaId,
        uid,
        body.motivo ?? `Escalado para ${body.nivel_destino}`,
        body.nivel_destino,
        ts,
      )
      .run();

    await insertAuditTrail(db, empresaId, 'FRAT_AVALIACAO', id, 'ESCALACAO_NIVEL', uid, {
      nivel_anterior: avaliacao.nivel_aprovacao_atual ?? 'L1',
      nivel_destino: body.nivel_destino,
    });

    return c.json({
      success: true,
      data: { id, nivel_aprovacao_atual: body.nivel_destino },
    });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao escalar avaliação FRAT', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.get('/compliance/rbac121/checklist', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;

    const [
      triagemOverdue,
      investigacaoOverdue,
      mitigacoesVencidas,
      barreirasCriticas,
      fratPendentes,
    ] = await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM sgso_relatos
             WHERE empresa_id = ? AND deleted_at IS NULL
               AND status = 'EM_TRIAGEM'
               AND sla_triagem_prazo IS NOT NULL
               AND sla_triagem_prazo < datetime('now')`,
        )
        .bind(empresaId)
        .first<{ total: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM sgso_relatos
             WHERE empresa_id = ? AND deleted_at IS NULL
               AND status = 'EM_INVESTIGACAO'
               AND sla_investigacao_prazo IS NOT NULL
               AND sla_investigacao_prazo < datetime('now')`,
        )
        .bind(empresaId)
        .first<{ total: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM sgso_acoes_mitigacao
             WHERE empresa_id = ? AND deleted_at IS NULL
               AND status IN ('PENDENTE', 'EM_ANDAMENTO')
               AND prazo < date('now')`,
        )
        .bind(empresaId)
        .first<{ total: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM sgso_bowtie_barreiras
             WHERE empresa_id = ? AND deleted_at IS NULL
               AND status_saude IN ('DEGRADADA', 'INOPERANTE')`,
        )
        .bind(empresaId)
        .first<{ total: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM sgso_frat_avaliacoes
             WHERE empresa_id = ? AND deleted_at IS NULL
               AND nivel_risco IN ('ALTO', 'CRITICO')
               AND status IN ('SUBMETIDO', 'RASCUNHO')`,
        )
        .bind(empresaId)
        .first<{ total: number }>(),
    ]);

    const complianceTableExists = await tableExists(db, 'compliance_status');
    let tripulantesNaoConformes = 0;
    if (complianceTableExists) {
      const latestCompliance = await db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM compliance_status cs
           JOIN (
             SELECT funcionario_id, MAX(data_avaliacao) AS max_data
             FROM compliance_status
             GROUP BY funcionario_id
           ) latest
             ON latest.funcionario_id = cs.funcionario_id
            AND latest.max_data = cs.data_avaliacao
           JOIN funcionarios f ON f.id = cs.funcionario_id
           WHERE f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
             AND f.empresa_id = ?
             AND cs.status <> 'COMPLIANT'`,
        )
        .bind(empresaId)
        .first<{ total: number }>();
      tripulantesNaoConformes = latestCompliance?.total ?? 0;
    }

    const checklist = [
      {
        codigo: 'RBAC121_RELATOS_TRIAGEM',
        referencia: 'RBAC 121 / SGSO - triagem tempestiva',
        status: (triagemOverdue?.total ?? 0) === 0 ? 'OK' : 'NAO_CONFORME',
        valor: triagemOverdue?.total ?? 0,
        detalhe: 'Relatos em triagem fora do SLA',
      },
      {
        codigo: 'RBAC121_INVESTIGACOES',
        referencia: 'RBAC 121 / SGSO - investigação em prazo',
        status: (investigacaoOverdue?.total ?? 0) === 0 ? 'OK' : 'NAO_CONFORME',
        valor: investigacaoOverdue?.total ?? 0,
        detalhe: 'Investigações em aberto fora do SLA',
      },
      {
        codigo: 'RBAC121_BARREIRAS',
        referencia: 'RBAC 121 / barreiras críticas',
        status:
          (barreirasCriticas?.total ?? 0) === 0
            ? 'OK'
            : (barreirasCriticas?.total ?? 0) <= 3
              ? 'ATENCAO'
              : 'NAO_CONFORME',
        valor: barreirasCriticas?.total ?? 0,
        detalhe: 'Barreiras Bowtie degradadas ou inoperantes',
      },
      {
        codigo: 'RBAC121_FRAT_APROVACAO',
        referencia: 'RBAC 121 / FRAT alto com despacho bloqueado',
        status:
          (fratPendentes?.total ?? 0) === 0
            ? 'OK'
            : (fratPendentes?.total ?? 0) <= 2
              ? 'ATENCAO'
              : 'NAO_CONFORME',
        valor: fratPendentes?.total ?? 0,
        detalhe: 'Avaliações FRAT de alto risco sem aprovação final',
      },
      {
        codigo: 'RBAC121_MITIGACOES',
        referencia: 'RBAC 121 / CAPA em prazo',
        status:
          (mitigacoesVencidas?.total ?? 0) === 0
            ? 'OK'
            : (mitigacoesVencidas?.total ?? 0) <= 5
              ? 'ATENCAO'
              : 'NAO_CONFORME',
        valor: mitigacoesVencidas?.total ?? 0,
        detalhe: 'Ações corretivas/preventivas vencidas',
      },
      {
        codigo: 'RBAC121_TRIPULACAO',
        referencia: 'RBAC 121 / tripulação conforme',
        status:
          tripulantesNaoConformes === 0
            ? 'OK'
            : tripulantesNaoConformes <= 3
              ? 'ATENCAO'
              : 'NAO_CONFORME',
        valor: tripulantesNaoConformes,
        detalhe: 'Tripulantes com status de compliance não conforme',
      },
    ];

    return c.json({
      success: true,
      data: {
        checklist,
        resumo: {
          ok: checklist.filter((item) => item.status === 'OK').length,
          atencao: checklist.filter((item) => item.status === 'ATENCAO').length,
          nao_conforme: checklist.filter((item) => item.status === 'NAO_CONFORME').length,
        },
      },
    });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao gerar checklist RBAC-121', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.get('/moc/registros', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const rows = await db
      .prepare(
        `SELECT m.*, f.nome AS owner_nome, apro.nome AS aprovado_por_nome
         FROM sgso_moc_registros m
         LEFT JOIN funcionarios f ON f.id = m.owner_id AND f.deleted_at IS NULL
         LEFT JOIN funcionarios apro ON apro.id = m.aprovado_por AND apro.deleted_at IS NULL
         WHERE m.empresa_id = ? AND m.deleted_at IS NULL
         ORDER BY m.updated_at DESC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();
    return c.json({ success: true, data: rows.results });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao listar registros de MoC', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.get('/moc/registros/:id', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();
    const registro = await db
      .prepare(
        `SELECT * FROM sgso_moc_registros
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<Record<string, unknown>>();
    if (!registro) return c.json({ success: false, error: 'Registro MoC não encontrado' }, 404);

    const aprovacoes = await db
      .prepare(
        `SELECT a.*, f.nome AS aprovador_nome
         FROM sgso_moc_aprovacoes a
         LEFT JOIN funcionarios f ON f.id = a.aprovador_id AND f.deleted_at IS NULL
         WHERE a.moc_id = ? AND a.empresa_id = ?
         ORDER BY a.created_at DESC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    return c.json({ success: true, data: { ...registro, aprovacoes: aprovacoes.results } });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao buscar registro MoC', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.post('/moc/registros', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c as AppCtx);
    const db = c.env.DB;
    const parsed = MocRecordSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const d = parsed.data;
    const id = uuid();
    const ts = now();
    await db
      .prepare(
        `INSERT INTO sgso_moc_registros
         (id, empresa_id, titulo, descricao_mudanca, motivo, impacto_operacional, risco_nivel,
          status, data_planejada, owner_id, areas_afetadas_json, mitigacoes_planejadas_json,
          created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'RASCUNHO', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        empresaId,
        d.titulo,
        d.descricao_mudanca,
        d.motivo,
        d.impacto_operacional,
        d.risco_nivel,
        d.data_planejada ?? null,
        d.owner_id ?? uid,
        JSON.stringify(d.areas_afetadas),
        JSON.stringify(d.mitigacoes_planejadas),
        uid,
        ts,
        ts,
      )
      .run();

    await insertAuditTrail(db, empresaId, 'SGSO_MOC', id, 'CRIADO', uid, d);
    return c.json({ success: true, data: { id, status: 'RASCUNHO' } }, 201);
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao criar registro MoC', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.patch('/moc/registros/:id/workflow', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c as AppCtx);
    const db = c.env.DB;
    const { id } = c.req.param();
    const parsed = MocWorkflowSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const registro = await db
      .prepare(
        `SELECT id, status FROM sgso_moc_registros
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<{ id: string; status: string }>();
    if (!registro) return c.json({ success: false, error: 'Registro MoC não encontrado' }, 404);

    const allowedTransitions: Record<string, string[]> = {
      RASCUNHO: ['EM_AVALIACAO', 'CANCELADO'],
      EM_AVALIACAO: ['APROVADO', 'REJEITADO', 'CANCELADO'],
      APROVADO: ['IMPLEMENTADO', 'CANCELADO'],
    };
    const allowed = allowedTransitions[registro.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return c.json(
        { success: false, error: 'Transição MoC inválida', code: 'INVALID_TRANSITION', allowed },
        422,
      );
    }

    const ts = now();
    await db
      .prepare(
        `UPDATE sgso_moc_registros
         SET status = ?, aprovado_por = CASE WHEN ? = 'APROVADO' THEN ? ELSE aprovado_por END,
             aprovado_em = CASE WHEN ? = 'APROVADO' THEN ? ELSE aprovado_em END,
             updated_at = ?
         WHERE id = ? AND empresa_id = ?`,
      )
      .bind(parsed.data.status, parsed.data.status, uid, parsed.data.status, ts, ts, id, empresaId)
      .run();

    await db
      .prepare(
        `INSERT INTO sgso_moc_aprovacoes
         (moc_id, empresa_id, status_novo, observacao, aprovador_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, empresaId, parsed.data.status, parsed.data.observacao ?? null, uid, ts)
      .run();

    await insertAuditTrail(db, empresaId, 'SGSO_MOC', id, `STATUS_${parsed.data.status}`, uid, {
      status_anterior: registro.status,
      status_novo: parsed.data.status,
      observacao: parsed.data.observacao ?? null,
    });

    return c.json({ success: true, data: { id, status: parsed.data.status } });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao atualizar workflow do MoC', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.get('/licoes-aprendidas', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const rows = await db
      .prepare(
        `SELECT l.*, r.numero_protocolo, r.tipo, r.status AS relato_status
         FROM sgso_licoes_aprendidas l
         JOIN sgso_relatos r ON r.id = l.relato_id
         WHERE l.empresa_id = ?
         ORDER BY l.updated_at DESC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();
    return c.json({ success: true, data: rows.results });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao listar lições aprendidas', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

extra.post('/licoes-aprendidas/:id/publicar-edapp', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c as AppCtx);
    const db = c.env.DB;
    const { id } = c.req.param();

    const lesson = await db
      .prepare(
        `SELECT l.*, r.numero_protocolo
         FROM sgso_licoes_aprendidas l
         JOIN sgso_relatos r ON r.id = l.relato_id
         WHERE l.id = ? AND l.empresa_id = ?`,
      )
      .bind(Number.parseInt(id, 10), empresaId)
      .first<{
        id: number;
        relato_id: string;
        numero_protocolo: string;
        resumo: string | null;
        licoes_json: string;
        investigation_type: InvestigationType;
      }>();
    if (!lesson) return c.json({ success: false, error: 'Lição aprendida não encontrada' }, 404);

    const publication = await publishLessonToEdApp(db, c.env, {
      relatoId: lesson.relato_id,
      empresaId,
      protocolo: lesson.numero_protocolo,
      investigationType: lesson.investigation_type,
      resumo: lesson.resumo,
      licoes: JSON.parse(lesson.licoes_json || '[]') as string[],
    });

    await insertAuditTrail(
      db,
      empresaId,
      'LICAO_APRENDIDA',
      String(lesson.id),
      'PUBLICADA_EDAPP',
      uid,
      {
        status_publicacao: publication.status,
        edapp_course_id: publication.edappCourseId,
        erro: publication.erro,
      },
    );

    return c.json({ success: true, data: publication });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao publicar lição no EdApp', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

export default extra;
