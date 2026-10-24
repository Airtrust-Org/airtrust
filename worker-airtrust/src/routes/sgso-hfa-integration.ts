import { Hono, type Context } from 'hono';
import type { Env, Variables } from '../types';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { insertAuditTrail } from './sgso-next-gen-helpers';
import {
  decryptHfaToken,
  encryptHfaToken,
  hfaEncryptionSecret,
  normalizeHfaBaseUrl,
  readHfaJson,
} from '../lib/hfa-integration';

type AppCtx = Context<{ Bindings: Env; Variables: Variables }>;

interface HfaLinkRow {
  id: string; relato_id: string; hfa_event_id: string | null; sync_status: string;
  hfa_analysis_status: string | null; hfa_review_status: string | null;
  last_sync_at: string | null; last_checked_at: string | null; last_error: string | null; updated_at: string;
}

interface RelatoHfaRow {
  id: string; numero_protocolo: string | null; tipo: string | null; anonimo: number | null;
  data_ocorrencia: string | null; descricao: string | null; aeronave_modelo: string | null; created_at: string | null;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const manager = requireRole('admin', 'manager');
const adminOnly = requireRole('admin');

function uid(c: AppCtx): number { return Number(c.get('userId') ?? 0); }
function now(): string { return new Date().toISOString(); }
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function getConfig(db: D1Database, empresaId: number) {
  return db.prepare(`SELECT empresa_id, base_url, token_encrypted, enabled, last_sync_at, updated_at
    FROM integracoes_hfa_config WHERE empresa_id = ? LIMIT 1`)
    .bind(empresaId)
    .first<{ empresa_id: number; base_url: string; token_encrypted: string; enabled: number; last_sync_at: string | null; updated_at: string }>();
}

async function credential(c: AppCtx, empresaId: number) {
  const config = await getConfig(c.env.DB, empresaId);
  if (!config || config.enabled !== 1) throw new Error('HFA_NOT_CONFIGURED');
  const token = await decryptHfaToken(config.token_encrypted, hfaEncryptionSecret(c.env));
  return { baseUrl: config.base_url.replace(/\/+$/, ''), token };
}

app.get('/config', manager, async (c) => {
  const empresaId = getEmpresaId(c);
  const config = await getConfig(c.env.DB, empresaId);
  return c.json({ success: true, data: config ? {
    configured: true,
    base_url: config.base_url,
    enabled: config.enabled === 1,
    token_configured: Boolean(config.token_encrypted),
    last_sync_at: config.last_sync_at,
    updated_at: config.updated_at,
  } : { configured: false, enabled: false, token_configured: false } });
});

app.put('/config', adminOnly, async (c) => {
  const empresaId = getEmpresaId(c);
  const actorId = uid(c);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  let baseUrl: string;
  try { baseUrl = normalizeHfaBaseUrl(clean(body.base_url, 500), c.env); }
  catch { return c.json({ success: false, error: 'URL HFA inválida. Use HTTPS.' }, 400); }
  const existing = await getConfig(c.env.DB, empresaId);
  let encrypted = existing?.token_encrypted ?? '';
  const rawToken = clean(body.api_token, 1000);
  if (rawToken) {
    try { encrypted = await encryptHfaToken(rawToken, hfaEncryptionSecret(c.env)); }
    catch { return c.json({ success: false, error: 'Chave dedicada da integração HFA não configurada.' }, 503); }
  }
  if (!encrypted) return c.json({ success: false, error: 'Token HFA é obrigatório na primeira configuração.' }, 400);
  const enabled = body.enabled === false ? 0 : 1;
  const ts = now();
  await c.env.DB.prepare(`INSERT INTO integracoes_hfa_config
    (empresa_id, base_url, token_encrypted, enabled, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id) DO UPDATE SET
      base_url=excluded.base_url, token_encrypted=excluded.token_encrypted,
      enabled=excluded.enabled, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .bind(empresaId, baseUrl, encrypted, enabled, actorId, actorId, ts, ts).run();
  await insertAuditTrail(c.env.DB, empresaId, 'HFA_INTEGRACAO', String(empresaId), 'CONFIG_ATUALIZADA', actorId, {
    base_url: baseUrl, enabled: enabled === 1, token_rotated: Boolean(rawToken),
  });
  return c.json({ success: true, data: { configured: true, base_url: baseUrl, enabled: enabled === 1, token_configured: true } });
});

async function getLink(db: D1Database, empresaId: number, relatoId: string) {
  return db.prepare(`SELECT id, relato_id, hfa_event_id, sync_status, hfa_analysis_status, hfa_review_status,
      last_sync_at, last_checked_at, last_error, updated_at
    FROM integracoes_hfa_eventos WHERE empresa_id = ? AND relato_id = ? LIMIT 1`)
    .bind(empresaId, relatoId).first<HfaLinkRow>();
}

app.get('/relprev/:id', manager, async (c) => {
  const empresaId = getEmpresaId(c);
  const relatoId = c.req.param('id');
  const relato = await c.env.DB.prepare('SELECT id FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(relatoId, empresaId).first();
  if (!relato) return c.json({ success: false, error: 'Relato não encontrado.' }, 404);
  const config = await getConfig(c.env.DB, empresaId);
  let link = await getLink(c.env.DB, empresaId, relatoId);
  if (c.req.query('refresh') === '1' && config?.enabled === 1 && link?.hfa_event_id) {
    try {
      const auth = await credential(c, empresaId);
      const response = await fetch(`${auth.baseUrl}/api/integrations/airtrust/events?external_reference=${encodeURIComponent(relatoId)}`, {
        headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
      });
      const json = await readHfaJson(response);
      if (!response.ok) throw new Error(clean(json.detail ?? json.error, 300) || `HFA HTTP ${response.status}`);
      const analysis = json.hfa_analysis && typeof json.hfa_analysis === 'object' ? json.hfa_analysis as Record<string, unknown> : null;
      const ts = now();
      await c.env.DB.prepare(`UPDATE integracoes_hfa_eventos SET hfa_analysis_status=?, hfa_review_status=?,
        last_checked_at=?, last_error=NULL, updated_at=? WHERE empresa_id=? AND relato_id=?`)
        .bind(clean(analysis?.status, 80) || null, clean(analysis?.review_status, 80) || null, ts, ts, empresaId, relatoId).run();
      link = await getLink(c.env.DB, empresaId, relatoId);
    } catch (error) {
      const ts = now();
      await c.env.DB.prepare(`UPDATE integracoes_hfa_eventos SET last_checked_at=?, last_error=?, updated_at=?
        WHERE empresa_id=? AND relato_id=?`)
        .bind(ts, error instanceof Error ? error.message.slice(0, 300) : 'Falha HFA', ts, empresaId, relatoId).run();
      link = await getLink(c.env.DB, empresaId, relatoId);
    }
  }
  return c.json({ success: true, data: { configured: Boolean(config && config.enabled === 1), link: link ?? null } });
});

app.post('/relprev/:id/sync', manager, async (c) => {
  const empresaId = getEmpresaId(c);
  const actorId = uid(c);
  const relatoId = c.req.param('id');
  const relato = await c.env.DB.prepare(`SELECT id, numero_protocolo, tipo, anonimo, data_ocorrencia,
      descricao, aeronave_modelo, created_at
    FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`)
    .bind(relatoId, empresaId).first<RelatoHfaRow>();
  if (!relato) return c.json({ success: false, error: 'Relato não encontrado.' }, 404);
  let auth: { baseUrl: string; token: string };
  try { auth = await credential(c, empresaId); }
  catch { return c.json({ success: false, error: 'Integração HFA não configurada ou indisponível.' }, 409); }
  const payload = {
    external_tenant_ref: String(empresaId),
    external_reference: String(relato.id),
    title: `${relato.tipo ?? 'RELPREV'} ${relato.numero_protocolo ?? relato.id}`,
    narrative: String(relato.descricao ?? ''),
    occurred_at: relato.data_ocorrencia ?? null,
    reported_at: relato.created_at ?? null,
    operation_type: relato.tipo ?? null,
    aircraft_type: relato.aeronave_modelo ?? null,
    confidentiality_level: Number(relato.anonimo) === 1 ? 'CONFIDENTIAL' : 'STANDARD',
  };
  const ts = now();
  try {
    const response = await fetch(`${auth.baseUrl}/api/integrations/airtrust/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await readHfaJson(response);
    if (!response.ok) throw new Error(clean(json.detail ?? json.error, 300) || `HFA HTTP ${response.status}`);
    const hfaEventId = clean(json.event_id, 100);
    if (!hfaEventId) throw new Error('HFA_RESPONSE_MISSING_EVENT_ID');
    const linkId = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO integracoes_hfa_eventos
      (id, empresa_id, relato_id, hfa_event_id, sync_status, last_sync_at, last_checked_at, last_error, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'SYNCED', ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(empresa_id, relato_id) DO UPDATE SET
        hfa_event_id=excluded.hfa_event_id, sync_status='SYNCED', last_sync_at=excluded.last_sync_at,
        last_checked_at=excluded.last_checked_at, last_error=NULL, updated_at=excluded.updated_at`)
      .bind(linkId, empresaId, relatoId, hfaEventId, ts, ts, actorId, ts, ts).run();
    await c.env.DB.prepare('UPDATE integracoes_hfa_config SET last_sync_at=?, updated_at=? WHERE empresa_id=?')
      .bind(ts, ts, empresaId).run();
    await insertAuditTrail(c.env.DB, empresaId, 'SGSO_RELATO', relatoId, 'HFA_SINCRONIZADO', actorId, {
      hfa_event_id: hfaEventId, hfa_created: Boolean(json.created), hfa_updated: Boolean(json.updated), analysis_started: false,
    });
    return c.json({ success: true, data: { hfa_event_id: hfaEventId, created: Boolean(json.created), updated: Boolean(json.updated), analysis_started: false } });
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : 'Falha ao sincronizar com HFA';
    const linkId = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO integracoes_hfa_eventos
      (id, empresa_id, relato_id, sync_status, last_checked_at, last_error, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'ERROR', ?, ?, ?, ?, ?)
      ON CONFLICT(empresa_id, relato_id) DO UPDATE SET sync_status='ERROR', last_checked_at=excluded.last_checked_at,
        last_error=excluded.last_error, updated_at=excluded.updated_at`)
      .bind(linkId, empresaId, relatoId, ts, reason, actorId, ts, ts).run();
    await insertAuditTrail(c.env.DB, empresaId, 'SGSO_RELATO', relatoId, 'HFA_SINCRONIZACAO_FALHOU', actorId, { reason });
    return c.json({ success: false, error: 'Não foi possível sincronizar o relato com o HFA.' }, 502);
  }
});

export default app;
