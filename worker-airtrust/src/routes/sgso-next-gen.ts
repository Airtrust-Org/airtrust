import { Hono } from 'hono';
import type { Env } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
// ─────────────────────────────────────────────────────────────────────────────
// DÍVIDA TÉCNICA — LMS Integration (Bloco 7 / Auditoria LMS-2026-04)
//
// TODO: N:N — um relato SGSO pode exigir múltiplos cursos corretivos (LMS).
// Atualmente a tabela `sgso_relatos_ocorrencias` guarda apenas um campo de
// treinamento textual. O ideal futuro é:
//   1. Criar tabela `sgso_acoes_corretivas_lms (relato_id, curso_id, obrigatorio)`
//   2. Ao concluir cada curso, marcar ação como concluída e gerar
//      `qualificacoes_historico` com `origem_tipo = 'PRESENCIAL'` (via instructor)
//      ou `'LMS'` (auto) dependendo do tipo_conteudo
//   3. Expor endpoint `GET /sgso/ocorrencias/:id/acoes-lms` para dashboards
//
// Estimativa: 1 sprint de 5 dias.
// Prioridade: MEDIA — requisito RBAC-120 "lesson learned tracking".
// ─────────────────────────────────────────────────────────────────────────────
import {
  BowtieBarrierStatusSchema,
  BowtieScenarioSchema,
  FratApprovalSchema,
  FratEvaluationSchema,
  RelprevSubmissionSchema,
  WORKFLOW_VALID_TRANSITIONS,
  runAiCoValidator,
  scoreFratResponses,
} from '../lib/sgso-next-gen';
import {
  type AppCtx,
  getUid,
  uuid,
  now,
  gerarProtocolo,
  getDefaultRiskProfile,
  insertAuditTrail,
  insertWorkflowEvent,
  enqueueNotification,
  InvestigationTypeSchema,
  WorkflowTransitionRequestSchema,
  MocRecordSchema,
  MocWorkflowSchema,
  type InvestigationType,
  INVESTIGATION_TYPE_BY_RELATO,
  WORKFLOW_SLA_BY_TYPE,
  inferInvestigationType,
  tableExists,
  callEdAppApi,
  persistLessonLearned,
  publishLessonToEdApp,
} from './sgso-next-gen-helpers';

const nextGen = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

// EmployeeSectorAccess only has 'all' | 'restricted' | 'self' (see
// services/employee-sector-access.ts) — 'restricted' is sector-scoped visibility,
// not full read of every submission, so only 'all' (full admin) gets unrestricted
// access here. Everyone else, including sector-scoped managers, sees only their
// own RELPREV submissions rather than assuming a broader "manages this sector"
// grant that this endpoint has no sector/reporter linkage to verify.
async function getRelprevReadScope(
  c: AppCtx,
  empresaId: number,
): Promise<{ clause: string; bindings: number[] }> {
  const access = await getEmployeeSectorAccess(c, empresaId);
  if (access.mode === 'all') {
    return { clause: '1 = 1', bindings: [] };
  }
  return { clause: 'r.created_by = ?', bindings: [getUid(c)] };
}

nextGen.post('/relprev/submissoes', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const body = await c.req.json();
    const parsed = RelprevSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const d = parsed.data;
    const db = c.env.DB;
    const id = uuid();
    const protocolo = await gerarProtocolo(db, empresaId);
    const ts = now();
    const relatorId = d.anonimo ? null : (d.relator_id ?? uid);
    const descricaoCompleta =
      d.descricao?.trim() || `${d.o_que}. Local: ${d.onde}. Momento: ${d.quando}.`;

    await db
      .prepare(
        `INSERT INTO sgso_relatos (
          id, empresa_id, numero_protocolo, tipo, anonimo, relator_id,
          aeronave_id, aeronave_matricula, aeronave_modelo,
          data_ocorrencia, local_icao, local_descricao,
          fase_voo, condicao_meteorologica,
          descricao, consequencia, accao_imediata,
          categoria_adrep, status, arquivo_url, arquivo_nome,
          created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, 'ABERTO', ?, ?,
          ?, ?, ?
        )`,
      )
      .bind(
        id,
        empresaId,
        protocolo,
        d.tipo,
        d.anonimo ? 1 : 0,
        relatorId,
        d.aeronave_id ?? null,
        d.aeronave_matricula ?? null,
        d.aeronave_modelo ?? null,
        d.data_ocorrencia,
        d.local_icao ?? null,
        d.local_descricao ?? d.onde,
        d.fase_voo ?? null,
        d.condicao_meteorologica ?? null,
        descricaoCompleta,
        d.consequencia ?? null,
        d.accao_imediata ?? null,
        d.categoria_adrep ?? null,
        d.arquivo_url ?? null,
        d.arquivo_nome ?? null,
        uid,
        ts,
        ts,
      )
      .run();

    await db
      .prepare(
        `INSERT INTO sgso_relatos_historico_status
         (relato_id, empresa_id, status_anterior, status_novo, motivo, alterado_por, alterado_em)
         VALUES (?, ?, NULL, 'ABERTO', 'Relato RELPREV criado', ?, ?)`,
      )
      .bind(id, empresaId, uid, ts)
      .run();

    await db
      .prepare(
        `INSERT INTO sgso_relato_capturas (
          relato_id, empresa_id, client_submission_id, canal_origem, sync_status, sync_tentativas,
          offline_capturado_em, sincronizado_em,
          o_que_resumo, onde_resumo, quando_resumo, timezone_offset_minutos,
          dispositivo_id, dispositivo_tipo, app_versao,
          latitude, longitude, precisao_metros, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'CONCILIADO', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        empresaId,
        d.client_submission_id,
        d.canal_origem,
        d.offline_capturado_em ?? null,
        ts,
        d.o_que,
        d.onde,
        d.quando,
        d.timezone_offset_minutos ?? null,
        d.dispositivo_id ?? null,
        d.dispositivo_tipo ?? null,
        d.app_versao ?? null,
        d.latitude ?? null,
        d.longitude ?? null,
        d.precisao_metros ?? null,
        d.metadata_json ? JSON.stringify(d.metadata_json) : null,
        ts,
        ts,
      )
      .run();

    await db
      .prepare(
        `INSERT INTO sgso_relato_privacidade (
          relato_id, empresa_id, modo_sigilo, consentimento_contato,
          relator_ciphertext, relator_nonce, relator_hash_busca,
          contato_ciphertext, contato_nonce, chave_versao, politica_acesso_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        empresaId,
        d.privacidade?.modo_sigilo ?? (d.anonimo ? 'ANONIMIZADO' : 'CONFIDENCIAL'),
        d.privacidade?.consentimento_contato ? 1 : 0,
        d.privacidade?.relator_ciphertext ?? null,
        d.privacidade?.relator_nonce ?? null,
        d.privacidade?.relator_hash_busca ?? null,
        d.privacidade?.contato_ciphertext ?? null,
        d.privacidade?.contato_nonce ?? null,
        d.privacidade?.chave_versao ?? null,
        d.privacidade?.politica_acesso_json
          ? JSON.stringify(d.privacidade.politica_acesso_json)
          : null,
        ts,
        ts,
      )
      .run();

    const ai = await runAiCoValidator(db, empresaId, descricaoCompleta, id, c.env);

    await db
      .prepare(
        `INSERT INTO sgso_relato_ia_triagem (
          relato_id, empresa_id, provedor_modelo, nome_modelo, prompt_versao,
          clareza_status, clareza_score, resumo_normalizado, recomendacao_reescrita,
          adrep_codigo_sugerido, adrep_confianca,
          eccairs2_codigo_sugerido, eccairs2_confianca,
          taxonomia_json, fingerprint_semantico, cluster_tendencia,
          casos_similares_qtd, casos_similares_json, sinal_tendencia,
          decisao_final, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACEITA', ?, ?)`,
      )
      .bind(
        id,
        empresaId,
        ai.provider,
        ai.model,
        'relprev-v1',
        ai.clarityStatus,
        ai.clarityScore,
        ai.normalizedSummary,
        ai.rewriteSuggestion ?? null,
        ai.adrepCode,
        ai.adrepConfidence,
        ai.eccairs2Code,
        ai.eccairs2Confidence,
        JSON.stringify(ai.taxonomy),
        ai.fingerprint,
        ai.trendCluster,
        ai.similarCases.length,
        JSON.stringify(ai.similarCases),
        ai.trendSignal,
        ts,
        ts,
      )
      .run();

    if (ai.adrepCode !== 'OTHER') {
      await db
        .prepare(
          'UPDATE sgso_relatos SET categoria_adrep = ?, updated_at = ? WHERE id = ? AND empresa_id = ?',
        )
        .bind(ai.adrepCode, ts, id, empresaId)
        .run();
    }

    await insertWorkflowEvent(db, id, empresaId, 'RECEBIMENTO', 'CONCLUIDO', uid, {
      client_submission_id: d.client_submission_id,
      canal_origem: d.canal_origem,
    });
    await insertWorkflowEvent(db, id, empresaId, 'CLASSIFICACAO_IA', 'CONCLUIDO', uid, {
      adrep: ai.adrepCode,
      eccairs2: ai.eccairs2Code,
      trend_signal: ai.trendSignal,
      similar_cases: ai.similarCases.length,
    });

    if (relatorId) {
      await enqueueNotification(db, id, empresaId, 'RELPREV_RECEBIDO', 'RELATOR', {
        numero_protocolo: protocolo,
        status: 'ABERTO',
      });
    }

    if (ai.clarityStatus === 'REVISAO_MANUAL') {
      await enqueueNotification(db, id, empresaId, 'RELPREV_TRIAGEM_MANUAL', 'GSO', {
        numero_protocolo: protocolo,
        status: 'ABERTO',
        clarity_status: ai.clarityStatus,
        trend_signal: ai.trendSignal,
      });
    }

    if (['TENDENCIA', 'SURTO'].includes(ai.trendSignal)) {
      await enqueueNotification(db, id, empresaId, 'RELPREV_TENDENCIA', 'GSO', {
        numero_protocolo: protocolo,
        status: 'ABERTO',
        trend_signal: ai.trendSignal,
        clarity_status: ai.clarityStatus,
      });
    }

    if (ai.trendSignal === 'SURTO') {
      await enqueueNotification(db, id, empresaId, 'RELPREV_TENDENCIA', 'GESTOR_OPERACIONAL', {
        numero_protocolo: protocolo,
        status: 'ABERTO',
        trend_signal: ai.trendSignal,
        clarity_status: ai.clarityStatus,
      });
    }

    await insertAuditTrail(db, empresaId, 'RELATO', id, 'RELPREV_SUBMETIDO', uid, {
      numero_protocolo: protocolo,
      categoria_adrep: ai.adrepCode,
      trend_signal: ai.trendSignal,
    });

    return c.json(
      {
        success: true,
        data: {
          id,
          numero_protocolo: protocolo,
          sync_status: 'CONCILIADO',
          ai_triagem: {
            clareza_status: ai.clarityStatus,
            categoria_adrep: ai.adrepCode,
            categoria_eccairs2: ai.eccairs2Code,
            trend_signal: ai.trendSignal,
            similares: ai.similarCases,
          },
        },
      },
      201,
    );
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao criar submissão RELPREV', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.get('/relprev/submissoes', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const readScope = await getRelprevReadScope(c as AppCtx, empresaId);
    const { limit = '20' } = c.req.query();
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));

    const rows = await db
      .prepare(
        `SELECT r.id, r.numero_protocolo, r.tipo, r.status, r.data_ocorrencia,
                rc.canal_origem, rc.sync_status, rc.o_que_resumo, rc.onde_resumo, rc.quando_resumo,
                ai.clareza_status, ai.adrep_codigo_sugerido, ai.sinal_tendencia
         FROM sgso_relatos r
         JOIN sgso_relato_capturas rc ON rc.relato_id = r.id
         LEFT JOIN sgso_relato_ia_triagem ai ON ai.relato_id = r.id
         WHERE r.empresa_id = ? AND r.deleted_at IS NULL
           AND ${readScope.clause}
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .bind(empresaId, ...readScope.bindings, limitNum)
      .all<Record<string, unknown>>();

    return c.json({ success: true, data: rows.results });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao listar submissões RELPREV', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.get('/relprev/submissoes/:id', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const readScope = await getRelprevReadScope(c as AppCtx, empresaId);
    const { id } = c.req.param();
    const row = await db
      .prepare(
        `SELECT r.id, r.numero_protocolo, r.tipo, r.status, r.data_ocorrencia, r.descricao,
                r.local_icao, r.local_descricao, r.categoria_adrep,
                rc.client_submission_id, rc.canal_origem, rc.sync_status, rc.o_que_resumo, rc.onde_resumo, rc.quando_resumo,
                rp.modo_sigilo, rp.consentimento_contato,
                ai.clareza_status, ai.clareza_score, ai.adrep_codigo_sugerido,
                ai.eccairs2_codigo_sugerido, ai.sinal_tendencia, ai.casos_similares_json
         FROM sgso_relatos r
         JOIN sgso_relato_capturas rc ON rc.relato_id = r.id
         LEFT JOIN sgso_relato_privacidade rp ON rp.relato_id = r.id
         LEFT JOIN sgso_relato_ia_triagem ai ON ai.relato_id = r.id
         WHERE r.id = ? AND r.empresa_id = ? AND r.deleted_at IS NULL
           AND ${readScope.clause}`,
      )
      .bind(id, empresaId, ...readScope.bindings)
      .first<Record<string, unknown>>();

    if (!row) return c.json({ success: false, error: 'Submissão não encontrada' }, 404);
    return c.json({ success: true, data: row });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao buscar submissão RELPREV', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.get('/relprev/submissoes/:id/workflow', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();
    const eventos = await db
      .prepare(
        `SELECT * FROM sgso_relato_workflow_eventos
         WHERE relato_id = ? AND empresa_id = ?
         ORDER BY criado_em ASC
         LIMIT 500`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();
    const notificacoes = await db
      .prepare(
        `SELECT * FROM sgso_relato_notificacoes
         WHERE relato_id = ? AND empresa_id = ?
         ORDER BY created_at ASC
         LIMIT 500`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();
    return c.json({
      success: true,
      data: { eventos: eventos.results, notificacoes: notificacoes.results },
    });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao buscar workflow RELPREV', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.get('/relprev/triagem/pendentes', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const nowTs = new Date().toISOString();

    const rows = await db
      .prepare(
        `SELECT r.id, r.numero_protocolo, r.tipo, r.status, r.created_at,
                r.sla_triagem_prazo, r.sla_investigacao_prazo,
                r.sla_triagem_violado, r.sla_investigacao_violado,
                r.em_triagem_em, r.em_investigacao_em, r.investigador_id,
                ai.clareza_status, ai.adrep_codigo_sugerido, ai.sinal_tendencia,
                f.nome AS investigador_nome
         FROM sgso_relatos r
         LEFT JOIN sgso_relato_ia_triagem ai ON ai.relato_id = r.id
         LEFT JOIN funcionarios f ON f.id = r.investigador_id AND f.empresa_id = r.empresa_id AND f.deleted_at IS NULL
         WHERE r.empresa_id = ? AND r.deleted_at IS NULL
           AND r.status IN ('ABERTO', 'EM_TRIAGEM', 'EM_INVESTIGACAO')
         ORDER BY r.sla_triagem_violado DESC, r.created_at ASC
         LIMIT 50`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    const data = rows.results.map((row) => {
      const slaTriagem = row.sla_triagem_prazo ? new Date(row.sla_triagem_prazo as string) : null;
      const slaInv = row.sla_investigacao_prazo
        ? new Date(row.sla_investigacao_prazo as string)
        : null;
      const nowDate = new Date(nowTs);
      return {
        ...row,
        sla_triagem_venceu: slaTriagem ? slaTriagem < nowDate : false,
        sla_investigacao_venceu: slaInv ? slaInv < nowDate : false,
        minutos_ate_sla_triagem: slaTriagem
          ? Math.round((slaTriagem.getTime() - nowDate.getTime()) / 60000)
          : null,
      };
    });

    return c.json({ success: true, data, meta: { total: data.length, now: nowTs } });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao buscar triagem pendente', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.patch('/relprev/submissoes/:id/workflow', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();

    const body = await c.req.json();
    const parsed = WorkflowTransitionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    const relato = await db
      .prepare(
        `SELECT id, numero_protocolo, tipo, status, created_at, tipo_investigacao FROM sgso_relatos
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<{
        id: string;
        numero_protocolo: string;
        tipo: string;
        status: string;
        created_at: string;
        tipo_investigacao: string | null;
      }>();
    if (!relato) return c.json({ success: false, error: 'Relato não encontrado' }, 404);

    const allowed = WORKFLOW_VALID_TRANSITIONS[relato.status] ?? [];
    if (!allowed.includes(d.status)) {
      return c.json(
        {
          success: false,
          error: `Transição inválida de ${relato.status} para ${d.status}`,
          code: 'INVALID_TRANSITION',
          allowed,
        },
        422,
      );
    }

    // Busca SLA config da empresa (com fallback nos padrões)
    const slaConfig = await db
      .prepare(`SELECT fase, horas_prazo FROM sgso_sla_config WHERE empresa_id = ? AND ativo = 1`)
      .bind(empresaId)
      .all<{ fase: string; horas_prazo: number }>();
    const investigationType =
      d.tipo_investigacao ??
      (relato.tipo_investigacao as InvestigationType | null) ??
      inferInvestigationType(relato.tipo);
    const slaHoras: Record<string, number> = { ...WORKFLOW_SLA_BY_TYPE[investigationType] };
    for (const row of slaConfig.results ?? []) slaHoras[row.fase] = row.horas_prazo;

    const ts = now();

    if (d.status === 'EM_TRIAGEM') {
      const slaTriagemPrazo = new Date(
        new Date(relato.created_at).getTime() + slaHoras.TRIAGEM * 3_600_000,
      ).toISOString();
      await db
        .prepare(
          `UPDATE sgso_relatos
           SET status = 'EM_TRIAGEM', em_triagem_em = ?,
               tipo_investigacao = ?,
               sla_triagem_prazo = COALESCE(sla_triagem_prazo, ?), updated_at = ?
           WHERE id = ? AND empresa_id = ?`,
        )
        .bind(ts, investigationType, slaTriagemPrazo, ts, id, empresaId)
        .run();
    } else if (d.status === 'EM_INVESTIGACAO') {
      const investigadorId = d.investigador_id ?? uid;
      const slaInvPrazo = new Date(Date.now() + slaHoras.INVESTIGACAO * 3_600_000).toISOString();
      await db
        .prepare(
          `UPDATE sgso_relatos
           SET status = 'EM_INVESTIGACAO', em_investigacao_em = ?,
               tipo_investigacao = ?,
               sla_investigacao_prazo = ?, investigador_id = ?, updated_at = ?
           WHERE id = ? AND empresa_id = ?`,
        )
        .bind(ts, investigationType, slaInvPrazo, investigadorId, ts, id, empresaId)
        .run();
    } else if (d.status === 'CONCLUIDO') {
      await db
        .prepare(
          `UPDATE sgso_relatos
           SET status = 'CONCLUIDO', concluido_em = ?, tipo_investigacao = ?,
               resumo_fechamento = ?, licoes_aprendidas_json = ?, updated_at = ?
           WHERE id = ? AND empresa_id = ?`,
        )
        .bind(
          ts,
          investigationType,
          d.resumo_fechamento ?? null,
          d.licoes_aprendidas ? JSON.stringify(d.licoes_aprendidas) : null,
          ts,
          id,
          empresaId,
        )
        .run();

      if ((d.resumo_fechamento ?? '').trim() || (d.licoes_aprendidas?.length ?? 0) > 0) {
        const licoes = (d.licoes_aprendidas ?? []).filter(Boolean);
        await persistLessonLearned(db, {
          relatoId: id,
          empresaId,
          protocolo: relato.numero_protocolo,
          investigationType,
          resumo: d.resumo_fechamento ?? null,
          licoes,
          uid,
        });

        const publication = await publishLessonToEdApp(db, c.env, {
          relatoId: id,
          empresaId,
          protocolo: relato.numero_protocolo,
          investigationType,
          resumo: d.resumo_fechamento ?? null,
          licoes,
        });

        await insertWorkflowEvent(db, id, empresaId, 'LICOES_APRENDIDAS', 'CONCLUIDO', uid, {
          status_publicacao: publication.status,
          edapp_course_id: publication.edappCourseId,
          erro_publicacao: publication.erro,
          curso_edapp_titulo: d.curso_edapp_titulo ?? null,
        });
      }
    }

    await insertWorkflowEvent(db, id, empresaId, 'TRANSICAO_STATUS', 'CONCLUIDO', uid, {
      status_anterior: relato.status,
      status_novo: d.status,
      tipo_investigacao: investigationType,
      observacao: d.observacao ?? null,
      investigador_id: d.investigador_id ?? null,
    });

    await insertAuditTrail(db, empresaId, 'RELATO', id, `WORKFLOW_${d.status}`, uid, {
      status_anterior: relato.status,
      status_novo: d.status,
      tipo_investigacao: investigationType,
      observacao: d.observacao ?? null,
    });

    return c.json({
      success: true,
      data: {
        id,
        status: d.status,
        tipo_investigacao: investigationType,
        updated_at: ts,
      },
    });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      {
        success: false,
        error: 'Erro ao atualizar workflow do relato',
        code: 'SGSO_NEXT_ERROR',
      },
      500,
    );
  }
});

nextGen.get('/matriz-risco/perfis', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const rows = await db
      .prepare(
        `SELECT p.*,
                COUNT(c.id) AS total_celulas
         FROM sgso_matriz_risco_perfis p
         LEFT JOIN sgso_matriz_risco_celulas c ON c.perfil_id = p.id
         WHERE (p.empresa_id = ? OR p.empresa_id = 0) AND p.ativo = 1
         GROUP BY p.id
         ORDER BY CASE WHEN p.empresa_id = ? THEN 0 ELSE 1 END, p.padrao DESC, p.nome ASC`,
      )
      .bind(empresaId, empresaId)
      .all<Record<string, unknown>>();
    return c.json({ success: true, data: rows.results });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao listar perfis de matriz', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.get('/matriz-risco/perfis/:id', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();
    const perfil = await db
      .prepare(
        'SELECT * FROM sgso_matriz_risco_perfis WHERE id = ? AND (empresa_id = ? OR empresa_id = 0) AND ativo = 1',
      )
      .bind(Number.parseInt(id, 10), empresaId)
      .first<Record<string, unknown>>();
    if (!perfil) return c.json({ success: false, error: 'Perfil de matriz não encontrado' }, 404);
    const celulas = await db
      .prepare(
        'SELECT * FROM sgso_matriz_risco_celulas WHERE perfil_id = ? ORDER BY ordem_probabilidade DESC, severidade ASC LIMIT 500',
      )
      .bind(Number.parseInt(id, 10))
      .all<Record<string, unknown>>();
    return c.json({ success: true, data: { ...perfil, celulas: celulas.results } });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao buscar perfil de matriz', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.get('/bowtie/cenarios', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const rows = await db
      .prepare(
        `SELECT c.id, c.codigo, c.evento_central, c.status, c.updated_at,
                p.titulo AS perigo_titulo,
                COUNT(DISTINCT CASE WHEN n.tipo_no = 'AMEACA' THEN n.id END) AS total_ameacas,
                COUNT(DISTINCT CASE WHEN n.tipo_no = 'CONSEQUENCIA' THEN n.id END) AS total_consequencias,
                COUNT(DISTINCT b.id) AS total_barreiras,
                  COUNT(DISTINCT CASE WHEN b.status_saude = 'INOPERANTE' THEN b.id END) AS barreiras_inoperantes,
                  COUNT(DISTINCT CASE WHEN b.status_saude = 'DEGRADADA' THEN b.id END) AS barreiras_degradadas
         FROM sgso_bowtie_cenarios c
         JOIN sgso_perigos p ON p.id = c.perigo_id
         LEFT JOIN sgso_bowtie_nos n ON n.cenario_id = c.id AND n.deleted_at IS NULL
         LEFT JOIN sgso_bowtie_barreiras b ON b.cenario_id = c.id AND b.deleted_at IS NULL
         WHERE c.empresa_id = ? AND c.deleted_at IS NULL
         GROUP BY c.id
         ORDER BY c.updated_at DESC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();
    return c.json({ success: true, data: rows.results });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao listar cenários Bowtie', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.post('/bowtie/cenarios', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const body = await c.req.json();
    const parsed = BowtieScenarioSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;
    const perigoId = d.perigo_id ?? uuid();
    const cenarioId = uuid();
    const ts = now();

    await db
      .prepare(
        `INSERT OR IGNORE INTO sgso_perigos
         (id, empresa_id, codigo, titulo, descricao, categoria_principal, fonte_principal, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', 'ATIVO', ?, ?, ?)`,
      )
      .bind(
        perigoId,
        empresaId,
        d.perigo_codigo ?? `HZ-${Date.now()}`,
        d.perigo_titulo,
        d.perigo_descricao ?? null,
        d.categoria_principal ?? null,
        uid,
        ts,
        ts,
      )
      .run();

    await db
      .prepare(
        `INSERT INTO sgso_bowtie_cenarios
         (id, empresa_id, perigo_id, codigo, evento_central, descricao, perfil_matriz_id, owner_id, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, ?, ?)`,
      )
      .bind(
        cenarioId,
        empresaId,
        perigoId,
        `BT-${Date.now()}`,
        d.evento_central,
        d.descricao ?? null,
        d.perfil_matriz_id ?? null,
        uid,
        uid,
        ts,
        ts,
      )
      .run();

    const nodeMap = new Map<string, number>();
    for (const ameaca of d.ameacas) {
      const result = await db
        .prepare(
          `INSERT INTO sgso_bowtie_nos
           (cenario_id, empresa_id, tipo_no, codigo, titulo, descricao, created_at, updated_at)
           VALUES (?, ?, 'AMEACA', ?, ?, ?, ?, ?)`,
        )
        .bind(
          cenarioId,
          empresaId,
          ameaca.codigo ?? null,
          ameaca.titulo,
          ameaca.descricao ?? null,
          ts,
          ts,
        )
        .run();
      nodeMap.set(ameaca.codigo ?? ameaca.titulo, Number(result.meta.last_row_id));
    }
    for (const consequencia of d.consequencias) {
      const result = await db
        .prepare(
          `INSERT INTO sgso_bowtie_nos
           (cenario_id, empresa_id, tipo_no, codigo, titulo, descricao, created_at, updated_at)
           VALUES (?, ?, 'CONSEQUENCIA', ?, ?, ?, ?, ?)`,
        )
        .bind(
          cenarioId,
          empresaId,
          consequencia.codigo ?? null,
          consequencia.titulo,
          consequencia.descricao ?? null,
          ts,
          ts,
        )
        .run();
      nodeMap.set(consequencia.codigo ?? consequencia.titulo, Number(result.meta.last_row_id));
    }

    for (const barreira of d.barreiras) {
      const barreiraId = uuid();
      await db
        .prepare(
          `INSERT INTO sgso_bowtie_barreiras
           (id, empresa_id, cenario_id, codigo, nome, descricao, tipo_barreira, origem_tipo, status_saude, efetividade_percentual, owner_id, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          barreiraId,
          empresaId,
          cenarioId,
          barreira.codigo ?? `BAR-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          barreira.nome,
          barreira.descricao ?? null,
          barreira.tipo_barreira,
          barreira.origem_tipo ?? null,
          barreira.status_saude,
          barreira.efetividade_percentual ?? null,
          uid,
          uid,
          ts,
          ts,
        )
        .run();

      for (const link of barreira.links) {
        const noId = nodeMap.get(link);
        if (!noId) continue;
        await db
          .prepare(
            'INSERT OR IGNORE INTO sgso_bowtie_barreira_vinculos (barreira_id, no_id, empresa_id, created_at) VALUES (?, ?, ?, ?)',
          )
          .bind(barreiraId, noId, empresaId, ts)
          .run();
      }
    }

    await insertAuditTrail(db, empresaId, 'BOWTIE_CENARIO', cenarioId, 'CRIADO', uid, {
      perigo_id: perigoId,
      total_ameacas: d.ameacas.length,
      total_consequencias: d.consequencias.length,
      total_barreiras: d.barreiras.length,
    });

    return c.json({ success: true, data: { id: cenarioId, perigo_id: perigoId } }, 201);
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao criar cenário Bowtie', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.get('/bowtie/cenarios/:id', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();
    const cenario = await db
      .prepare(
        `SELECT c.*, p.titulo AS perigo_titulo, p.descricao AS perigo_descricao, p.categoria_principal
         FROM sgso_bowtie_cenarios c
         JOIN sgso_perigos p ON p.id = c.perigo_id
         WHERE c.id = ? AND c.empresa_id = ? AND c.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<Record<string, unknown>>();
    if (!cenario) return c.json({ success: false, error: 'Cenário Bowtie não encontrado' }, 404);

    const nos = await db
      .prepare(
        `SELECT * FROM sgso_bowtie_nos WHERE cenario_id = ? AND empresa_id = ? AND deleted_at IS NULL ORDER BY tipo_no ASC, ordem_exibicao ASC, id ASC LIMIT 500`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();
    const barreiras = await db
      .prepare(
        `SELECT * FROM sgso_bowtie_barreiras WHERE cenario_id = ? AND empresa_id = ? AND deleted_at IS NULL ORDER BY tipo_barreira ASC, nome ASC LIMIT 500`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();
    const vinculos = await db
      .prepare(
        `SELECT v.barreira_id, v.no_id, n.tipo_no, n.titulo, n.codigo
         FROM sgso_bowtie_barreira_vinculos v
         JOIN sgso_bowtie_nos n ON n.id = v.no_id
         WHERE v.empresa_id = ? AND n.cenario_id = ?`,
      )
      .bind(empresaId, id)
      .all<Record<string, unknown>>();
    const historico = await db
      .prepare(
        `SELECT * FROM sgso_bowtie_barreira_historico WHERE empresa_id = ? AND barreira_id IN (
           SELECT id FROM sgso_bowtie_barreiras WHERE cenario_id = ?
         ) ORDER BY alterado_em DESC
         LIMIT 1000`,
      )
      .bind(empresaId, id)
      .all<Record<string, unknown>>();

    return c.json({
      success: true,
      data: {
        ...cenario,
        nos: nos.results,
        barreiras: barreiras.results,
        vinculos: vinculos.results,
        historico_barreiras: historico.results,
      },
    });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao buscar cenário Bowtie', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

nextGen.patch('/bowtie/barreiras/:id/status', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();
    const parsed = BowtieBarrierStatusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const barreira = await db
      .prepare(
        'SELECT id, status_saude, cenario_id FROM sgso_bowtie_barreiras WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; status_saude: string; cenario_id: string }>();
    if (!barreira) return c.json({ success: false, error: 'Barreira não encontrada' }, 404);

    const d = parsed.data;
    const ts = now();
    await db
      .prepare(
        'UPDATE sgso_bowtie_barreiras SET status_saude = ?, updated_at = ? WHERE id = ? AND empresa_id = ?',
      )
      .bind(d.status_saude, ts, id, empresaId)
      .run();
    await db
      .prepare(
        `INSERT INTO sgso_bowtie_barreira_historico
         (barreira_id, empresa_id, status_anterior, status_novo, motivo_tipo, motivo_ref_id, observacao, alterado_por, alterado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        empresaId,
        barreira.status_saude,
        d.status_saude,
        d.motivo_tipo ?? null,
        d.motivo_ref_id ?? null,
        d.observacao ?? null,
        uid,
        ts,
      )
      .run();
    await insertAuditTrail(
      db,
      empresaId,
      'BOWTIE_BARREIRA',
      id,
      'STATUS_ATUALIZADO',
      uid,
      d as Record<string, unknown>,
    );
    return c.json({ success: true, data: { id, status_saude: d.status_saude } });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao atualizar barreira', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

// ─── Bowtie: Residual Risk Score ─────────────────────────────────────────────
nextGen.get('/bowtie/cenarios/:id/risk-score', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();

    const cenario = await db
      .prepare(
        'SELECT id, evento_central, probabilidade_base FROM sgso_bowtie_cenarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; evento_central: string; probabilidade_base: number | null }>();

    if (!cenario) return c.json({ success: false, error: 'Cenário não encontrado' }, 404);

    const barreiras = await db
      .prepare(
        `SELECT id, nome, tipo_barreira, status_saude, efetividade_percentual
         FROM sgso_bowtie_barreiras
         WHERE cenario_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .all<{
        id: string;
        nome: string;
        tipo_barreira: string;
        status_saude: string;
        efetividade_percentual: number | null;
      }>();

    const probabilidadeBase = cenario.probabilidade_base ?? 1.0;

    // residual risk = P × ∏(1 – effectiveness_i) for OPERANTE barriers only
    let riskResidual = probabilidadeBase;
    let totalBarreiras = 0;
    let barreirasOperacionais = 0;
    let barreirasAvariadas = 0;

    for (const b of barreiras.results) {
      totalBarreiras++;
      const eff = (b.efetividade_percentual ?? 0) / 100;
      if (b.status_saude === 'OPERANTE' && eff > 0) {
        riskResidual *= 1 - eff;
        barreirasOperacionais++;
      } else if (b.status_saude === 'DEGRADADA' || b.status_saude === 'INOPERANTE') {
        barreirasAvariadas++;
      }
    }

    const nivelRisco =
      riskResidual >= 0.7
        ? 'CRITICO'
        : riskResidual >= 0.4
          ? 'ALTO'
          : riskResidual >= 0.15
            ? 'MEDIO'
            : 'BAIXO';

    return c.json({
      success: true,
      data: {
        cenario_id: id,
        evento_central: cenario.evento_central,
        probabilidade_base: probabilidadeBase,
        risco_residual: Math.round(riskResidual * 10000) / 10000,
        nivel_risco: nivelRisco,
        total_barreiras: totalBarreiras,
        barreiras_operacionais: barreirasOperacionais,
        barreiras_avariadas: barreirasAvariadas,
        barreiras: barreiras.results,
      },
    });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao calcular risk score', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});

// ─── Hazard Register ──────────────────────────────────────────────────────────
nextGen.get('/hazard-register', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;

    const perigos = await db
      .prepare(
        `SELECT
           p.id, p.codigo, p.titulo, p.descricao, p.categoria_principal, p.status, p.updated_at,
           COUNT(DISTINCT rp.relato_id) AS total_relatos,
           COUNT(DISTINCT nc.id)        AS total_ncs_abertas,
           COUNT(DISTINCT b.id)         AS total_barreiras,
           SUM(CASE WHEN b.status_saude IN ('DEGRADADA', 'INOPERANTE') THEN 1 ELSE 0 END) AS barreiras_avariadas,
           MAX(CASE a.nivel_risco
             WHEN 'CRITICO' THEN 4
             WHEN 'ALTO' THEN 3
             WHEN 'MEDIO' THEN 2
             ELSE 1 END) AS risco_rank,
           bc.id                        AS bowtie_cenario_id
         FROM sgso_perigos p
         LEFT JOIN sgso_relato_perigos rp ON rp.perigo_id = p.id
         LEFT JOIN sgso_nao_conformidades nc ON nc.relato_id = rp.relato_id AND nc.status = 'ABERTA' AND nc.deleted_at IS NULL
         LEFT JOIN sgso_avaliacao_risco a ON a.relato_id = rp.relato_id AND a.deleted_at IS NULL
         LEFT JOIN sgso_bowtie_cenarios bc ON bc.perigo_id = p.id AND bc.empresa_id = p.empresa_id AND bc.deleted_at IS NULL
         LEFT JOIN sgso_bowtie_barreiras b ON b.cenario_id = bc.id AND b.deleted_at IS NULL
         WHERE p.empresa_id = ? AND p.deleted_at IS NULL
         GROUP BY p.id, bc.id
         ORDER BY risco_rank DESC, barreiras_avariadas DESC, total_ncs_abertas DESC, total_relatos DESC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    const data = perigos.results.map((row) => ({
      ...row,
      nivel_risco_atual:
        Number(row.risco_rank ?? 1) >= 4
          ? 'CRITICO'
          : Number(row.risco_rank ?? 1) >= 3
            ? 'ALTO'
            : Number(row.risco_rank ?? 1) >= 2
              ? 'MEDIO'
              : 'BAIXO',
      score_prioridade:
        Number(row.total_ncs_abertas ?? 0) * 20 +
        Number(row.barreiras_avariadas ?? 0) * 15 +
        Number(row.total_relatos ?? 0) * 5,
    }));

    return c.json({ success: true, data });
  } catch (error) {
    const errType = error instanceof Error ? error.name : 'UnknownError';
    const errMsg = error instanceof Error ? error.message.substring(0, 150) : 'Sem mensagem';
    const eId = typeof c !== 'undefined' ? String(((c as any).get('tenantContext') || {}).empresaId || 'unknown') : 'unknown';
    const reqM = typeof c !== 'undefined' && c.req ? c.req.method : 'UNKNOWN';
    const reqP = typeof c !== 'undefined' && c.req ? c.req.path : 'UNKNOWN';
    console.error(`[sgso-next] [${reqM} ${reqP}] Falha operacional | Empresa: ${eId} | Tipo: ${errType} | Msg: ${errMsg}`);
return c.json(
      { success: false, error: 'Erro ao listar Hazard Register', code: 'SGSO_NEXT_ERROR' },
      500,
    );
  }
});
export default nextGen;
