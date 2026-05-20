/**
 * SGSO Next-Gen — Shared helpers
 * Extracted from sgso-next-gen.ts for use by sub-route modules.
 */

import { z } from 'zod';
import type { Context } from 'hono';
import type { Env } from '../types';

export type AppCtx = Context<{ Bindings: Env; Variables: { userId?: string } }>;

export function getUid(c: AppCtx): number {
  return Number(c.get('userId') ?? 0);
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export async function gerarProtocolo(db: D1Database, empresaId: number): Promise<string> {
  const ano = new Date().getFullYear();
  await db
    .prepare(
      'INSERT OR IGNORE INTO sgso_protocolo_sequencia (empresa_id, ano, ultimo_numero) VALUES (?, ?, 0)',
    )
    .bind(empresaId, ano)
    .run();
  await db
    .prepare(
      'UPDATE sgso_protocolo_sequencia SET ultimo_numero = ultimo_numero + 1 WHERE empresa_id = ? AND ano = ?',
    )
    .bind(empresaId, ano)
    .run();
  const row = await db
    .prepare('SELECT ultimo_numero FROM sgso_protocolo_sequencia WHERE empresa_id = ? AND ano = ?')
    .bind(empresaId, ano)
    .first<{ ultimo_numero: number }>();
  return `REL-${ano}-${String(row?.ultimo_numero ?? 1).padStart(4, '0')}`;
}

export async function getDefaultRiskProfile(
  db: D1Database,
  empresaId: number,
  explicitProfileId?: number,
): Promise<{ id: number; codigo: string } | null> {
  if (explicitProfileId) {
    const explicit = await db
      .prepare(
        'SELECT id, codigo FROM sgso_matriz_risco_perfis WHERE id = ? AND (empresa_id = ? OR empresa_id = 0) AND ativo = 1',
      )
      .bind(explicitProfileId, empresaId)
      .first<{ id: number; codigo: string }>();
    if (explicit) return explicit;
  }

  const byEmpresa = await db
    .prepare(
      'SELECT id, codigo FROM sgso_matriz_risco_perfis WHERE empresa_id = ? AND ativo = 1 ORDER BY padrao DESC, id ASC LIMIT 1',
    )
    .bind(empresaId)
    .first<{ id: number; codigo: string }>();
  if (byEmpresa) return byEmpresa;

  return db
    .prepare(
      'SELECT id, codigo FROM sgso_matriz_risco_perfis WHERE empresa_id = 0 AND ativo = 1 ORDER BY padrao DESC, id ASC LIMIT 1',
    )
    .first<{ id: number; codigo: string }>();
}

export async function insertAuditTrail(
  db: D1Database,
  empresaId: number,
  agregadoTipo: string,
  agregadoId: string,
  acao: string,
  atorId: number,
  payload: Record<string, unknown>,
) {
  const payloadJson = JSON.stringify(payload);
  await db
    .prepare(
      `INSERT INTO sgso_audit_trail
       (empresa_id, agregado_tipo, agregado_id, acao, ator_id, origem, payload_hash, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'API', ?, ?, ?)`,
    )
    .bind(
      empresaId,
      agregadoTipo,
      agregadoId,
      acao,
      atorId,
      `sha1:${payloadJson.length}`,
      payloadJson,
      now(),
    )
    .run();
}

export async function insertWorkflowEvent(
  db: D1Database,
  relatoId: string,
  empresaId: number,
  tipoEvento: string,
  statusEvento: string,
  atorId: number,
  payload: Record<string, unknown>,
  visivelRelator = true,
) {
  await db
    .prepare(
      `INSERT INTO sgso_relato_workflow_eventos
       (relato_id, empresa_id, tipo_evento, status_evento, visivel_relator, payload_json, ator_id, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      relatoId,
      empresaId,
      tipoEvento,
      statusEvento,
      visivelRelator ? 1 : 0,
      JSON.stringify(payload),
      atorId,
      now(),
    )
    .run();
}

export async function enqueueNotification(
  db: D1Database,
  relatoId: string,
  empresaId: number,
  templateCodigo: string,
  destinoTipo: 'RELATOR' | 'GSO' | 'GESTOR_OPERACIONAL' | 'SISTEMA',
  payload: Record<string, unknown>,
) {
  await db
    .prepare(
      `INSERT INTO sgso_relato_notificacoes
       (relato_id, empresa_id, template_codigo, canal, destino_tipo, status, payload_json, created_at)
       VALUES (?, ?, ?, 'INAPP', ?, 'PENDENTE', ?, ?)`,
    )
    .bind(relatoId, empresaId, templateCodigo, destinoTipo, JSON.stringify(payload), now())
    .run();
}

export const InvestigationTypeSchema = z.enum(['OBSERVACAO', 'INCIDENTE_GRAVE', 'ACIDENTE']);

export const WorkflowTransitionRequestSchema = z.object({
  status: z.enum(['EM_TRIAGEM', 'EM_INVESTIGACAO', 'CONCLUIDO']),
  investigador_id: z.number().int().optional(),
  observacao: z.string().max(1000).optional(),
  tipo_investigacao: InvestigationTypeSchema.optional(),
  resumo_fechamento: z.string().max(4000).optional(),
  licoes_aprendidas: z.array(z.string().min(3).max(500)).max(20).optional(),
  curso_edapp_titulo: z.string().min(3).max(160).optional(),
});

export const MocRecordSchema = z.object({
  titulo: z.string().min(3).max(160),
  descricao_mudanca: z.string().min(10).max(4000),
  motivo: z.string().min(3).max(1000),
  impacto_operacional: z.string().min(3).max(2000),
  risco_nivel: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']),
  data_planejada: z.string().optional(),
  owner_id: z.number().int().optional(),
  areas_afetadas: z.array(z.string().min(2).max(120)).max(20).default([]),
  mitigacoes_planejadas: z.array(z.string().min(3).max(500)).max(20).default([]),
});

export const MocWorkflowSchema = z.object({
  status: z.enum(['EM_AVALIACAO', 'APROVADO', 'IMPLEMENTADO', 'REJEITADO', 'CANCELADO']),
  observacao: z.string().max(2000).optional(),
});

export type InvestigationType = z.infer<typeof InvestigationTypeSchema>;

export const INVESTIGATION_TYPE_BY_RELATO: Record<string, InvestigationType> = {
  PERIGO: 'OBSERVACAO',
  OCORRENCIA: 'OBSERVACAO',
  INCIDENTE: 'INCIDENTE_GRAVE',
  ACIDENTE: 'ACIDENTE',
};

export const WORKFLOW_SLA_BY_TYPE: Record<
  InvestigationType,
  { TRIAGEM: number; INVESTIGACAO: number; RESOLUCAO: number }
> = {
  OBSERVACAO: { TRIAGEM: 24, INVESTIGACAO: 48, RESOLUCAO: 120 },
  INCIDENTE_GRAVE: { TRIAGEM: 12, INVESTIGACAO: 72, RESOLUCAO: 168 },
  ACIDENTE: { TRIAGEM: 4, INVESTIGACAO: 120, RESOLUCAO: 240 },
};

export function inferInvestigationType(relatoTipo: string): InvestigationType {
  return INVESTIGATION_TYPE_BY_RELATO[relatoTipo] ?? 'OBSERVACAO';
}

export async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .bind(tableName)
    .first<{ ok: number }>();
  return row?.ok === 1;
}

export async function callEdAppApi(
  env: Env,
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  if (!env.EDAPP_API_TOKEN) throw new Error('EDAPP_API_TOKEN não configurado');

  const response = await fetch(`https://rest.edapp.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.EDAPP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`EdApp API Error: ${response.status} - ${text}`);
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export async function persistLessonLearned(
  db: D1Database,
  payload: {
    relatoId: string;
    empresaId: number;
    protocolo: string;
    investigationType: InvestigationType;
    resumo: string | null;
    licoes: string[];
    uid: number;
  },
) {
  const ts = now();
  const titulo = `Lições aprendidas ${payload.protocolo}`;

  await db
    .prepare(
      `INSERT INTO sgso_licoes_aprendidas
       (relato_id, empresa_id, titulo, resumo, licoes_json, investigation_type, status_publicacao, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?)
       ON CONFLICT(relato_id) DO UPDATE SET
         titulo = excluded.titulo,
         resumo = excluded.resumo,
         licoes_json = excluded.licoes_json,
         investigation_type = excluded.investigation_type,
         updated_at = excluded.updated_at`,
    )
    .bind(
      payload.relatoId,
      payload.empresaId,
      titulo,
      payload.resumo,
      JSON.stringify(payload.licoes),
      payload.investigationType,
      payload.uid,
      ts,
      ts,
    )
    .run();
}

export async function publishLessonToEdApp(
  db: D1Database,
  env: Env,
  payload: {
    relatoId: string;
    empresaId: number;
    protocolo: string;
    investigationType: InvestigationType;
    resumo: string | null;
    licoes: string[];
  },
): Promise<{ status: string; edappCourseId: string | null; erro: string | null }> {
  const ts = now();

  if (!env.EDAPP_API_TOKEN) {
    await db
      .prepare(
        `UPDATE sgso_licoes_aprendidas
         SET status_publicacao = 'PENDENTE_CONFIG', updated_at = ?
         WHERE relato_id = ? AND empresa_id = ?`,
      )
      .bind(ts, payload.relatoId, payload.empresaId)
      .run();
    return { status: 'PENDENTE_CONFIG', edappCourseId: null, erro: null };
  }

  try {
    const response = await callEdAppApi(env, 'POST', '/v2/courses', {
      title: `SGSO ${payload.protocolo} - ${payload.investigationType}`,
      description: payload.resumo ?? payload.licoes.join('\n'),
      course_code: `SGSO-${payload.protocolo}`,
    });

    const edappCourseId = String(
      response.id ??
        response.courseId ??
        response.course_id ??
        (response.data as Record<string, unknown> | undefined)?.id ??
        '',
    );

    await db
      .prepare(
        `UPDATE sgso_licoes_aprendidas
         SET status_publicacao = 'PUBLICADO', edapp_course_id = ?, edapp_publicado_em = ?, updated_at = ?
         WHERE relato_id = ? AND empresa_id = ?`,
      )
      .bind(edappCourseId || null, ts, ts, payload.relatoId, payload.empresaId)
      .run();

    return { status: 'PUBLICADO', edappCourseId: edappCourseId || null, erro: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao publicar no EdApp';
    await db
      .prepare(
        `UPDATE sgso_licoes_aprendidas
         SET status_publicacao = 'FALHA_PUBLICACAO', erro_publicacao = ?, updated_at = ?
         WHERE relato_id = ? AND empresa_id = ?`,
      )
      .bind(message, ts, payload.relatoId, payload.empresaId)
      .run();
    return { status: 'FALHA_PUBLICACAO', edappCourseId: null, erro: message };
  }
}
