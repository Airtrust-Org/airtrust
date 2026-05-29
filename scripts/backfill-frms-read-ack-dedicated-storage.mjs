#!/usr/bin/env node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const EVENT_KIND = 'FRMS_READ_ACK_EVENT';
const ACK_KIND = 'FRMS_READ_ACK_ACK';

export function parseArgs(argv) {
  const args = {
    apply: false,
    database: 'airtrust-db',
    env: 'production',
    remote: true,
    maxApplyEvents: 50,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--empresa-id') args.empresaId = Number(argv[++i]);
    else if (arg === '--data-inicio') args.dataInicio = argv[++i];
    else if (arg === '--data-fim') args.dataFim = argv[++i];
    else if (arg === '--database') args.database = argv[++i];
    else if (arg === '--env') args.env = argv[++i];
    else if (arg === '--local') args.remote = false;
    else if (arg === '--remote') args.remote = true;
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--max-apply-events') args.maxApplyEvents = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Uso: node scripts/backfill-frms-read-ack-dedicated-storage.mjs [--dry-run|--apply] --empresa-id <id> --data-inicio YYYY-MM-DD --data-fim YYYY-MM-DD [--limit N]

Backfill controlado de FRMS_READ_ACK_EVENT/FRMS_READ_ACK_ACK legado para frms_read_ack_events/frms_read_ack_event_audit.
Dry-run e obrigatorio por padrao. Apply exige empresa/data e usa INSERT OR IGNORE/WHERE NOT EXISTS.`);
}

export function assertRequiredFilters(args) {
  if (!Number.isInteger(args.empresaId) || args.empresaId <= 0) {
    throw new Error('--empresa-id inteiro positivo e obrigatorio');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dataInicio || '')) {
    throw new Error('--data-inicio YYYY-MM-DD e obrigatorio');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dataFim || '')) {
    throw new Error('--data-fim YYYY-MM-DD e obrigatorio');
  }
  if (args.dataFim < args.dataInicio) {
    throw new Error('--data-fim deve ser >= --data-inicio');
  }
  if (args.apply && (!Number.isFinite(args.maxApplyEvents) || args.maxApplyEvents <= 0)) {
    throw new Error('--max-apply-events deve ser positivo');
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error('--limit deve ser inteiro positivo');
  }
}

export function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return Number.isFinite(Number(value)) ? String(Number(value)) : 'NULL';
}

export function runWrangler(args, extra) {
  const command = ['wrangler', 'd1', 'execute', args.database, '--env', args.env, args.remote ? '--remote' : '--local', '--json', ...extra];
  const { CLOUDFLARE_API_TOKEN: _cloudflareApiToken, ...env } = process.env;
  const result = spawnSync('npx', command, {
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0) {
    throw new Error(`wrangler falhou (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  const output = result.stdout.trim();
  return output ? parseWranglerJsonOutput(output) : [];
}

function parseWranglerJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch {
    for (let index = 0; index < output.length; index += 1) {
      const char = output[index];
      if (char !== '[' && char !== '{') continue;
      try {
        return JSON.parse(output.slice(index));
      } catch {
        // Wrangler can print progress lines before JSON for --file.
      }
    }
  }
  throw new Error(`Nao foi possivel interpretar JSON do wrangler: ${output.slice(0, 500)}`);
}

function query(args, command) {
  return runWrangler(args, ['--command', command]);
}

function executeFile(args, file) {
  return runWrangler(args, ['--file', file]);
}

function rowsFrom(result) {
  return result.flatMap((entry) => entry.results || []);
}

function parseJsonPayload(row) {
  if (!row.payload_json) return null;
  try {
    const parsed = JSON.parse(row.payload_json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validEventPayload(row, payload) {
  const missing = [];
  if (!payload?.data_operacional) missing.push('data_operacional');
  if (!payload?.funcionario_id) missing.push('funcionario_id');
  if (!payload?.event_type) missing.push('event_type');
  if (!payload?.severity) missing.push('severity');
  if (missing.length) return { ok: false, reason: `campos_ausentes:${missing.join(',')}` };
  return { ok: true };
}

function mapEvent(row) {
  const payload = parseJsonPayload(row);
  if (!payload) return { invalid: { id: row.id, tipo: row.tipo, reason: 'payload_json_invalido' } };
  const validation = validEventPayload(row, payload);
  if (!validation.ok) return { invalid: { id: row.id, tipo: row.tipo, reason: validation.reason } };
  return {
    event: {
      id: row.id,
      empresa_id: Number(payload.empresa_id || row.empresa_id),
      data_operacional: payload.data_operacional,
      funcionario_id: Number(payload.funcionario_id),
      event_type: payload.event_type,
      severity: payload.severity,
      source: 'OPERATIONAL_SNAPSHOT',
      lifecycle_status: payload.status === 'ACKED' ? 'ACKED' : 'PENDING',
      snapshot_status: stringOrNull(payload.snapshot_status) || 'INCOMPLETO',
      snapshot_alertas_json: JSON.stringify(stringArray(payload.snapshot_alertas)),
      data_sources_json: JSON.stringify({
        checkin_status: stringOrNull(payload.checkin_status) || 'AUSENTE',
        sleep_data_source: stringOrNull(payload.sleep_data_source) || 'AUSENTE',
        wake_data_source: stringOrNull(payload.wake_data_source) || 'AUSENTE',
        jornada_data_source: stringOrNull(payload.jornada_data_source) || 'AUSENTE',
        fortnight_status: stringOrNull(payload.fortnight_status),
      }),
      limitations_json: JSON.stringify(stringArray(payload.limitations)),
      snapshot_payload_json: row.payload_json,
      event_hash: row.id,
      created_at: stringOrNull(payload.created_at) || row.created_at,
      created_by: null,
      acknowledged_at: stringOrNull(payload.acknowledged_at),
      acknowledged_by: numberOrNull(payload.acknowledged_by),
      ack_note: stringOrNull(payload.ack_note),
    },
  };
}

function deterministicAuditId(rowId) {
  return `frms_read_ack_backfill_ack_${String(rowId).replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function mapAck(row, eventPayloadById) {
  const payload = parseJsonPayload(row);
  if (!payload) return { invalid: { id: row.id, tipo: row.tipo, reason: 'payload_json_invalido' } };
  const eventId = stringOrNull(payload.event_id);
  if (!eventId) return { invalid: { id: row.id, tipo: row.tipo, reason: 'event_id_ausente' } };
  if (!eventPayloadById.has(eventId)) {
    return { invalid: { id: row.id, tipo: row.tipo, reason: 'evento_referenciado_nao_encontrado' } };
  }
  return {
    audit: {
      id: deterministicAuditId(row.id),
      empresa_id: Number(row.empresa_id),
      event_id: eventId,
      action: 'ACK',
      actor_user_id: numberOrNull(payload.acknowledged_by),
      action_at: stringOrNull(payload.acknowledged_at) || row.created_at,
      note: stringOrNull(payload.ack_note),
      payload_before_json: null,
      payload_after_json: eventPayloadById.get(eventId),
    },
  };
}

export function eventInsertSql(event) {
  return `INSERT OR IGNORE INTO frms_read_ack_events
(id, empresa_id, data_operacional, funcionario_id, event_type, severity, source, lifecycle_status, snapshot_status, snapshot_alertas_json, data_sources_json, limitations_json, snapshot_payload_json, event_hash, created_at, created_by, acknowledged_at, acknowledged_by, ack_note, schema_version)
VALUES (${sqlString(event.id)}, ${sqlNumber(event.empresa_id)}, ${sqlString(event.data_operacional)}, ${sqlNumber(event.funcionario_id)}, ${sqlString(event.event_type)}, ${sqlString(event.severity)}, ${sqlString(event.source)}, ${sqlString(event.lifecycle_status)}, ${sqlString(event.snapshot_status)}, ${sqlString(event.snapshot_alertas_json)}, ${sqlString(event.data_sources_json)}, ${sqlString(event.limitations_json)}, ${sqlString(event.snapshot_payload_json)}, ${sqlString(event.event_hash)}, ${sqlString(event.created_at)}, ${sqlNumber(event.created_by)}, ${sqlString(event.acknowledged_at)}, ${sqlNumber(event.acknowledged_by)}, ${sqlString(event.ack_note)}, 1);`;
}

export function auditInsertSql(audit) {
  return `INSERT INTO frms_read_ack_event_audit
(id, empresa_id, event_id, action, actor_user_id, action_at, note, payload_before_json, payload_after_json, schema_version)
SELECT ${sqlString(audit.id)}, ${sqlNumber(audit.empresa_id)}, ${sqlString(audit.event_id)}, 'ACK', ${sqlNumber(audit.actor_user_id)}, ${sqlString(audit.action_at)}, ${sqlString(audit.note)}, ${sqlString(audit.payload_before_json)}, ${sqlString(audit.payload_after_json)}, 1
WHERE NOT EXISTS (
  SELECT 1 FROM frms_read_ack_event_audit
   WHERE empresa_id = ${sqlNumber(audit.empresa_id)}
     AND event_id = ${sqlString(audit.event_id)}
     AND action = 'ACK'
);`;
}

function summarizePlan({ legacyEvents, legacyAcks, dedicatedExisting, auditExisting, eventsToInsert, auditsToInsert, invalidPayloads, skipped }) {
  return {
    legacy_events_found: legacyEvents.length,
    legacy_acks_found: legacyAcks.length,
    dedicated_events_existing: dedicatedExisting.length,
    audit_existing: auditExisting.length,
    events_to_insert: eventsToInsert.length,
    audits_to_insert: auditsToInsert.length,
    invalid_payloads: invalidPayloads.length,
    skipped: skipped.length,
    event_ids_to_insert: eventsToInsert.map((event) => event.id),
    audit_event_ids_to_insert: auditsToInsert.map((audit) => audit.event_id),
    invalid_payload_details: invalidPayloads,
    skipped_details: skipped,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertRequiredFilters(args);
  const limitClause = args.limit ? `\nLIMIT ${sqlNumber(args.limit)}` : '';

  const eventSql = `SELECT id, empresa_id, tipo, created_at, payload_json
FROM frms_fadiga_evento
WHERE empresa_id = ${sqlNumber(args.empresaId)}
  AND tipo = '${EVENT_KIND}'
  AND json_extract(payload_json, '$.data_operacional') >= ${sqlString(args.dataInicio)}
  AND json_extract(payload_json, '$.data_operacional') <= ${sqlString(args.dataFim)}
ORDER BY created_at, id${limitClause}`;

  const ackSql = `SELECT a.id, a.empresa_id, a.tipo, a.created_at, a.payload_json
FROM frms_fadiga_evento a
WHERE a.empresa_id = ${sqlNumber(args.empresaId)}
  AND a.tipo = '${ACK_KIND}'
  AND json_extract(a.payload_json, '$.event_id') IN (
    SELECT e.id
      FROM frms_fadiga_evento e
     WHERE e.empresa_id = ${sqlNumber(args.empresaId)}
       AND e.tipo = '${EVENT_KIND}'
       AND json_extract(e.payload_json, '$.data_operacional') >= ${sqlString(args.dataInicio)}
       AND json_extract(e.payload_json, '$.data_operacional') <= ${sqlString(args.dataFim)}
     ORDER BY e.created_at, e.id${limitClause}
  )
ORDER BY a.created_at, a.id`;

  const dedicatedSql = `SELECT id FROM frms_read_ack_events
WHERE empresa_id = ${sqlNumber(args.empresaId)}
  AND data_operacional >= ${sqlString(args.dataInicio)}
  AND data_operacional <= ${sqlString(args.dataFim)}`;

  const auditSql = `SELECT event_id FROM frms_read_ack_event_audit
WHERE empresa_id = ${sqlNumber(args.empresaId)}
  AND action = 'ACK'`;

  const legacyEvents = rowsFrom(query(args, eventSql));
  const legacyAcks = rowsFrom(query(args, ackSql));
  const dedicatedExisting = rowsFrom(query(args, dedicatedSql));
  const auditExisting = rowsFrom(query(args, auditSql));

  const dedicatedIds = new Set(dedicatedExisting.map((row) => row.id));
  const auditEventIds = new Set(auditExisting.map((row) => row.event_id));
  const invalidPayloads = [];
  const skipped = [];
  const eventsToInsert = [];
  const auditsToInsert = [];
  const eventPayloadById = new Map();

  for (const row of legacyEvents) {
    if (row.payload_json) eventPayloadById.set(row.id, row.payload_json);
    const mapped = mapEvent(row);
    if (mapped.invalid) {
      invalidPayloads.push(mapped.invalid);
      continue;
    }
    if (dedicatedIds.has(mapped.event.id)) {
      skipped.push({ id: mapped.event.id, tipo: row.tipo, reason: 'dedicated_event_exists' });
      continue;
    }
    eventsToInsert.push(mapped.event);
  }

  for (const row of legacyAcks) {
    const mapped = mapAck(row, eventPayloadById);
    if (mapped.invalid) {
      invalidPayloads.push(mapped.invalid);
      continue;
    }
    if (auditEventIds.has(mapped.audit.event_id)) {
      skipped.push({ id: mapped.audit.id, tipo: row.tipo, reason: 'audit_ack_exists' });
      continue;
    }
    auditsToInsert.push(mapped.audit);
  }

  const summary = summarizePlan({ legacyEvents, legacyAcks, dedicatedExisting, auditExisting, eventsToInsert, auditsToInsert, invalidPayloads, skipped });

  if (invalidPayloads.length > 0) {
    console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', ok: false, summary }, null, 2));
    process.exit(2);
  }

  if (!args.apply) {
    console.log(JSON.stringify({ mode: 'dry-run', ok: true, summary }, null, 2));
    return;
  }

  if (eventsToInsert.length > args.maxApplyEvents) {
    throw new Error(`events_to_insert=${eventsToInsert.length} excede --max-apply-events=${args.maxApplyEvents}`);
  }

  if (eventsToInsert.length === 0 && auditsToInsert.length === 0) {
    console.log(JSON.stringify({ mode: 'apply', ok: true, applied: false, summary }, null, 2));
    return;
  }

  const sql = [
    '-- Backfill FRMS read/ack legado para storage dedicado. Nao altera legado.',
    ...eventsToInsert.map(eventInsertSql),
    ...auditsToInsert.map(auditInsertSql),
    '',
  ].join('\n');

  const tempDir = mkdtempSync(join(tmpdir(), 'frms-read-ack-backfill-'));
  const file = join(tempDir, 'backfill.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  try {
    const applyResult = executeFile(args, file);
    console.log(JSON.stringify({ mode: 'apply', ok: true, applied: true, summary, apply_result: applyResult }, null, 2));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exit(1);
  });
}
