/**
 * ESCALAS — Status transitions + Snapshot publicação
 * PATCH /:id/status   — rascunho → em_revisao → aprovada → publicada → arquivada
 * GET   /:id/snapshot-publicado — último snapshot real da publicação
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getEmpresaIdSafe,
  getEscalaVerificada,
  parseBody,
  AlterarStatusSchema,
} from './escalas-shared';
import { publishDomainEvent } from '../shared/domainEvents';

const status = new Hono<{ Bindings: Env }>();

type SnapshotMetadata = {
  status?: string | null;
  created_by?: string | null;
  criado_por_nome?: string | null;
  created_at?: string | null;
  aprovado_por?: string | null;
  aprovado_por_nome?: string | null;
  aprovado_em?: string | null;
  publicado_por?: string | null;
  publicado_por_nome?: string | null;
  publicado_em?: string | null;
  numero_revisao?: number | null;
};

function parseSnapshotMetadata(payloadJson?: string | null): SnapshotMetadata | null {
  if (!payloadJson) return null;

  try {
    const parsed = JSON.parse(payloadJson) as { metadata?: unknown };
    if (!parsed.metadata || typeof parsed.metadata !== 'object') return null;
    return parsed.metadata as SnapshotMetadata;
  } catch {
    return null;
  }
}

// PATCH /:id/status — alterar status (state machine)
status.patch('/:id/status', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  const body = await c.req.json();
  const parsed = parseBody(AlterarStatusSchema, body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  try {
    const escala = (await getEscalaVerificada(db, id, empresaId)) as Record<string, unknown> | null;
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    // Validar transição de status
    // publicada → em_revisao: abre para edição (nova revisão ao re-publicar)
    // publicada → publicada: re-publicação direta (atalho, cria nova revisão)
    const transicoesValidas: Record<string, string[]> = {
      rascunho: ['em_revisao'],
      em_revisao: ['aprovada', 'rascunho'],
      aprovada: ['publicada', 'em_revisao'],
      publicada: ['em_revisao', 'publicada', 'arquivada'],
      arquivada: [],
    };

    const statusAtual = escala.status as string;
    if (!transicoesValidas[statusAtual]?.includes(parsed.data.status)) {
      return c.json(
        { success: false, error: `Transição inválida: ${statusAtual} → ${parsed.data.status}` },
        400,
      );
    }

    const now = new Date().toISOString();
    let numeroRevisao = Number(escala.numero_revisao ?? 0);
    let isRepublicacao = false;

    if (parsed.data.status === 'publicada') {
      // Verifica se já existe algum snapshot anterior — se sim, é uma re-publicação (nova revisão)
      const snapshotExistente = await db
        .prepare(
          `SELECT id FROM escala_publicacao_snapshots WHERE escala_id = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .bind(id)
        .first<{ id: string }>();

      if (snapshotExistente) {
        // Re-publicação: incrementa numero_revisao
        numeroRevisao += 1;
        isRepublicacao = true;
      }
      // Primeira publicação: numero_revisao permanece 0

      await db
        .prepare(
          `UPDATE escalas_mensais
              SET status = 'publicada',
                  numero_revisao = ?,
                  publicado_por = ?,
                  publicado_em = ?,
                  updated_at = ?
            WHERE id = ?`,
        )
        .bind(numeroRevisao, userId, now, now, id)
        .run();
    } else {
      const updates: string[] = ['status = ?', 'updated_at = ?'];
      const vals: unknown[] = [parsed.data.status, now];

      if (parsed.data.status === 'aprovada') {
        updates.push('aprovado_por = ?', 'aprovado_em = ?');
        vals.push(userId, now);
      }

      vals.push(id);
      await db
        .prepare(`UPDATE escalas_mensais SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...vals)
        .run();
    }

    // Auditoria
    const auditId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO escala_auditoria (id, escala_id, acao, campo_alterado, valor_anterior, valor_novo, justificativa, realizado_por, realizado_em)
         VALUES (?, ?, ?, 'status', ?, ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        id,
        isRepublicacao
          ? `republicado_revisao_${numeroRevisao}`
          : `status_alterado_para_${parsed.data.status}`,
        statusAtual,
        parsed.data.status,
        parsed.data.justificativa || null,
        userId,
        now,
      )
      .run();

    // ── Snapshot de publicação ──
    if (parsed.data.status === 'publicada') {
      try {
        const tripulacoesRows = await db
          .prepare(
            `SELECT et.*
               FROM escala_tripulacoes et
               JOIN escalas_mensais em ON em.id = et.escala_id
              WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
              ORDER BY et.data_inicio, et.created_at`,
          )
          .bind(id, empresaId)
          .all<Record<string, unknown>>();

        const eventosRows = await db
          .prepare(
            `SELECT ee.*
               FROM escala_eventos ee
               JOIN escalas_mensais em ON em.id = ee.escala_id
              WHERE ee.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND ee.deleted_at IS NULL
              ORDER BY ee.data_inicio, ee.created_at`,
          )
          .bind(id, empresaId)
          .all<Record<string, unknown>>();

        const alocacoesRows = await db
          .prepare(
            `SELECT ea.*
               FROM escala_alocacoes ea
               JOIN escalas_mensais em ON em.id = ea.escala_id
              WHERE ea.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND ea.deleted_at IS NULL
              ORDER BY ea.data_inicio, ea.created_at`,
          )
          .bind(id, empresaId)
          .all<Record<string, unknown>>();

        const metadataRow = await db
          .prepare(
            `SELECT
               em.status,
               em.created_by,
               em.created_at,
               em.aprovado_por,
               em.aprovado_em,
               em.publicado_por,
               em.publicado_em,
               em.numero_revisao,
               f_criador.nome AS criado_por_nome,
               f_aprovador.nome AS aprovado_por_nome,
               f_publicador.nome AS publicado_por_nome
             FROM escalas_mensais em
             LEFT JOIN funcionarios f_criador
               ON em.created_by = f_criador.id
              AND (f_criador.empresa_id IS NULL OR f_criador.empresa_id = em.empresa_id)
             LEFT JOIN funcionarios f_aprovador
               ON em.aprovado_por = f_aprovador.id
              AND (f_aprovador.empresa_id IS NULL OR f_aprovador.empresa_id = em.empresa_id)
             LEFT JOIN funcionarios f_publicador
               ON em.publicado_por = f_publicador.id
              AND (f_publicador.empresa_id IS NULL OR f_publicador.empresa_id = em.empresa_id)
            WHERE em.id = ?
              AND em.deleted_at IS NULL
              ${empresaId ? 'AND em.empresa_id = ?' : ''}
            LIMIT 1`,
          )
          .bind(...(empresaId ? [id, empresaId] : [id]))
          .first<SnapshotMetadata>();

        const snapshotPayload = {
          tripulacoes: tripulacoesRows.results || [],
          eventos: eventosRows.results || [],
          alocacoes: alocacoesRows.results || [],
          metadata: {
            status: metadataRow?.status || 'publicada',
            created_by: metadataRow?.created_by || null,
            criado_por_nome: metadataRow?.criado_por_nome || null,
            created_at: metadataRow?.created_at || null,
            aprovado_por: metadataRow?.aprovado_por || null,
            aprovado_por_nome: metadataRow?.aprovado_por_nome || null,
            aprovado_em: metadataRow?.aprovado_em || null,
            publicado_por: metadataRow?.publicado_por || userId || null,
            publicado_por_nome: metadataRow?.publicado_por_nome || null,
            publicado_em: metadataRow?.publicado_em || now,
            numero_revisao:
              typeof metadataRow?.numero_revisao === 'number'
                ? metadataRow.numero_revisao
                : numeroRevisao,
          },
          savedAt: now,
          revisao: numeroRevisao,
        };

        await db
          .prepare(
            `INSERT INTO escala_publicacao_snapshots
               (id, escala_id, empresa_id, publicado_por, publicado_em, payload_json, revisao, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            id,
            empresaId || null,
            userId || null,
            now,
            JSON.stringify(snapshotPayload),
            numeroRevisao,
            now,
            now,
          )
          .run();
      } catch (snapshotErr) {
        console.warn('[ESCALAS] Aviso: falha ao persistir snapshot:', String(snapshotErr));
      }
    }

    // ── Integração FRMS: ao publicar, criar jornadas para eventos de voo ──
    if (parsed.data.status === 'publicada') {
      try {
        const voosRows = await db
          .prepare(
            `SELECT ee.id, ee.funcionario_id, ee.data_inicio, ee.data_fim, ee.turno, ee.observacoes
             FROM escala_eventos ee
             JOIN escalas_mensais em ON em.id = ee.escala_id
             WHERE ee.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL
               AND ee.tipo_evento = 'voo' AND ee.deleted_at IS NULL`,
          )
          .bind(id, empresaId)
          .all<{
            id: string;
            funcionario_id: string;
            data_inicio: string;
            data_fim: string;
            turno: string | null;
            observacoes: string | null;
          }>();

        const voosParaFRMS = voosRows.results || [];
        if (voosParaFRMS.length > 0) {
          const frmsStmts = voosParaFRMS.map((voo) => {
            const jornId = crypto.randomUUID();
            const inicioMs = new Date(voo.data_inicio).getTime();
            const fimMs = new Date(voo.data_fim).getTime();
            const duracaoMin = fimMs > inicioMs ? Math.round((fimMs - inicioMs) / 60000) : 0;
            const obs = `[ESCALA:${id}][EVENTO:${voo.id}]${voo.observacoes ? ` ${voo.observacoes}` : ''}`;
            return db
              .prepare(
                `INSERT OR IGNORE INTO frms_jornada
                   (id, tripulante_id, data, status, horas_voo_minutos, observacao, registrado_por, origem, created_at, updated_at)
                 VALUES (?, ?, ?, 'ES', ?, ?, ?, 'MANUAL', ?, ?)`,
              )
              .bind(
                jornId,
                voo.funcionario_id,
                voo.data_inicio.slice(0, 10),
                duracaoMin > 0 ? duracaoMin : null,
                obs.slice(0, 500),
                userId,
                now,
                now,
              );
          });

          await db.batch(frmsStmts).catch((err: unknown) => {
            console.warn('[ESCALAS] Aviso: falha ao sincronizar FRMS:', String(err));
          });
        }
      } catch (frmsErr) {
        console.warn('[ESCALAS] Aviso: integração FRMS falhou silenciosamente:', String(frmsErr));
      }

      try {
        await publishDomainEvent(db, 'escalas', 'ESCALA_PUBLICADA', {
          empresa_id: empresaId,
          origem_modulo: 'escalas',
          origem_usuario_id: userId,
          escala_id: id,
          mes: escala.mes,
          ano: escala.ano,
          status: 'publicada',
        });
      } catch (error) {
        console.error('domain_event_error', error);
      }
    }

    if (parsed.data.status === 'arquivada') {
      try {
        await publishDomainEvent(db, 'escalas', 'ESCALA_ARQUIVADA', {
          empresa_id: empresaId,
          origem_modulo: 'escalas',
          origem_usuario_id: userId,
          escala_id: id,
          mes: escala.mes,
          ano: escala.ano,
          status: 'arquivada',
        });
      } catch (error) {
        console.error('domain_event_error', error);
      }
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// GET /:id/snapshot-publicado — último snapshot real da publicação
status.get('/:id/snapshot-publicado', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    type SnapshotRow = {
      payload_json: string;
      publicado_em: string | null;
      revisao: number;
      publicado_por: string | null;
    };
    let row: SnapshotRow | null = null;
    if (empresaId) {
      row = await db
        .prepare(
          `SELECT payload_json, publicado_em, revisao, publicado_por
             FROM escala_publicacao_snapshots
            WHERE escala_id = ? AND empresa_id = ? AND deleted_at IS NULL
            ORDER BY revisao DESC, publicado_em DESC LIMIT 1`,
        )
        .bind(id, empresaId)
        .first<SnapshotRow>();
    } else {
      row = await db
        .prepare(
          `SELECT payload_json, publicado_em, revisao, publicado_por
             FROM escala_publicacao_snapshots
            WHERE escala_id = ? AND deleted_at IS NULL
            ORDER BY revisao DESC, publicado_em DESC LIMIT 1`,
        )
        .bind(id)
        .first<SnapshotRow>();
    }

    if (!row?.payload_json) {
      return c.json({ success: true, data: null });
    }

    let parsedPayload: {
      tripulacoes?: unknown[];
      eventos?: unknown[];
      alocacoes?: unknown[];
      savedAt?: string;
      revisao?: number;
    } | null = null;
    try {
      parsedPayload = JSON.parse(row.payload_json);
    } catch {
      parsedPayload = null;
    }

    if (!parsedPayload) {
      return c.json({ success: true, data: null });
    }

    return c.json({
      success: true,
      data: {
        tripulacoes: Array.isArray(parsedPayload.tripulacoes) ? parsedPayload.tripulacoes : [],
        eventos: Array.isArray(parsedPayload.eventos) ? parsedPayload.eventos : [],
        alocacoes: Array.isArray(parsedPayload.alocacoes) ? parsedPayload.alocacoes : [],
        savedAt: parsedPayload.savedAt || row.publicado_em || new Date().toISOString(),
        revisao: row.revisao ?? 0,
        publicado_por: row.publicado_por,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// GET /:id/revisoes — lista todas as revisões publicadas (snapshots) desta escala
status.get('/:id/revisoes', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const rows = await db
      .prepare(
        `SELECT
           s.id,
           s.revisao,
           s.publicado_por,
           s.publicado_em,
           f.nome AS publicado_por_nome,
           s.payload_json,
           s.created_at
         FROM escala_publicacao_snapshots s
         LEFT JOIN funcionarios f ON f.id = s.publicado_por AND f.deleted_at IS NULL
        WHERE s.escala_id = ?
          AND s.deleted_at IS NULL
          ${empresaId ? 'AND s.empresa_id = ?' : ''}
        ORDER BY s.revisao DESC, s.publicado_em DESC`,
      )
      .bind(...(empresaId ? [id, empresaId] : [id]))
      .all<{
        id: string;
        revisao: number;
        publicado_por: string | null;
        publicado_em: string;
        publicado_por_nome: string | null;
        payload_json: string | null;
        created_at: string;
      }>();

    const data = (rows.results || []).map((row) => {
      const metadata = parseSnapshotMetadata(row.payload_json);

      return {
        id: row.id,
        revisao: row.revisao,
        publicado_por: row.publicado_por,
        publicado_em: row.publicado_em,
        publicado_por_nome: row.publicado_por_nome || metadata?.publicado_por_nome || null,
        elaborado_por: metadata?.created_by || null,
        elaborado_em: metadata?.created_at || null,
        elaborado_por_nome: metadata?.criado_por_nome || null,
        aprovado_por: metadata?.aprovado_por || null,
        aprovado_em: metadata?.aprovado_em || null,
        aprovado_por_nome: metadata?.aprovado_por_nome || null,
        created_at: row.created_at,
      };
    });

    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// GET /:id/revisoes/:rev — snapshot de uma revisão específica
status.get('/:id/revisoes/:rev', auth(), async (c) => {
  const { id, rev } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const revisaoNum = Number(rev);

  if (!Number.isFinite(revisaoNum) || revisaoNum < 0) {
    return c.json({ success: false, error: 'Número de revisão inválido' }, 400);
  }

  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const row = await db
      .prepare(
        `SELECT payload_json, publicado_em, revisao, publicado_por
           FROM escala_publicacao_snapshots
          WHERE escala_id = ? AND revisao = ? AND deleted_at IS NULL
            ${empresaId ? 'AND empresa_id = ?' : ''}
          LIMIT 1`,
      )
      .bind(...(empresaId ? [id, revisaoNum, empresaId] : [id, revisaoNum]))
      .first<{
        payload_json: string;
        publicado_em: string | null;
        revisao: number;
        publicado_por: string | null;
      }>();

    if (!row?.payload_json) {
      return c.json({ success: false, error: `Revisão ${revisaoNum} não encontrada` }, 404);
    }

    let parsedPayload: Record<string, unknown> | null = null;
    try {
      parsedPayload = JSON.parse(row.payload_json);
    } catch {
      parsedPayload = null;
    }

    if (!parsedPayload) {
      return c.json({ success: false, error: 'Payload corrompido' }, 500);
    }

    return c.json({
      success: true,
      data: {
        tripulacoes: Array.isArray(parsedPayload.tripulacoes) ? parsedPayload.tripulacoes : [],
        eventos: Array.isArray(parsedPayload.eventos) ? parsedPayload.eventos : [],
        alocacoes: Array.isArray(parsedPayload.alocacoes) ? parsedPayload.alocacoes : [],
        metadata: parseSnapshotMetadata(row.payload_json),
        savedAt: (parsedPayload.savedAt as string) || row.publicado_em || new Date().toISOString(),
        revisao: row.revisao,
        publicado_por: row.publicado_por,
        publicado_em: row.publicado_em,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

export default status;
