import { ApiError } from '../../middleware/error-handler';
import type { Env } from '../../types';
import type { PilotOfflineLeaseEnvelope } from './pilot-offline-lease';

export const PILOT_OFFLINE_SYNC_COMMAND_TYPE = 'rdv_snapshot_upsert_v1' as const;
export const PILOT_OFFLINE_SYNC_ENTITY_TYPE = 'rdv_snapshot' as const;
export const PILOT_OFFLINE_SYNC_OPERATION_TYPE = 'upsert' as const;
export const PILOT_OFFLINE_SYNC_MAX_COMMANDS = 20;

export type PilotOfflineSyncStatus =
  | 'accepted'
  | 'already_accepted'
  | 'conflict'
  | 'rejected_retriable'
  | 'rejected_permanent';

export type PilotOfflineSyncCommand = {
  client_operation_id: string;
  tenant_id: number;
  user_id: number;
  flight_id: number;
  device_id: string;
  command_type: typeof PILOT_OFFLINE_SYNC_COMMAND_TYPE;
  entity_type: typeof PILOT_OFFLINE_SYNC_ENTITY_TYPE;
  operation_type: typeof PILOT_OFFLINE_SYNC_OPERATION_TYPE;
  base_server_version: number;
  base_flight_version: number;
  local_sequence: number;
  claimed_at: string;
  payload_hash: string;
  lease: PilotOfflineLeaseEnvelope;
  payload: Record<string, unknown>;
};

export type PilotOfflineSyncReceiptRow = {
  id: number;
  empresa_id: number;
  client_operation_id: string;
  voo_id: number;
  usuario_id: number;
  funcionario_id: number | null;
  device_id: string;
  command_type: string;
  entity_type: string;
  canonical_entity_id: string | null;
  payload_hash: string;
  base_server_version: number | null;
  server_entity_version: number | null;
  result_status: Exclude<PilotOfflineSyncStatus, 'already_accepted'>;
  result_code: string | null;
  result_json: string | null;
  received_at: string;
  updated_at: string;
};

export type PilotOfflineSyncCommandResult = {
  client_operation_id: string;
  status: PilotOfflineSyncStatus;
  server_received_at: string | null;
  server_entity_version: number | null;
  canonical_entity_id: string | null;
  error_code: string | null;
  conflict: Record<string, unknown> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requirePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(
      `${field} invalido`,
      400,
      'CONTROLE_VOOS_PILOT_SYNC_COMMAND_INVALID',
    );
  }
  return parsed;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(
      `${field} invalido`,
      400,
      'CONTROLE_VOOS_PILOT_SYNC_COMMAND_INVALID',
    );
  }
  return parsed;
}

function requireExactString(value: unknown, expected: string, field: string): string {
  if (value !== expected) {
    throw new ApiError(
      `${field} invalido`,
      400,
      'CONTROLE_VOOS_PILOT_SYNC_COMMAND_INVALID',
    );
  }
  return expected;
}

function validateOperationId(value: unknown): string {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new ApiError(
      'client_operation_id invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_OPERATION_ID_INVALID',
    );
  }
  return id;
}

function validatePayloadHash(value: unknown): string {
  const hash = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new ApiError(
      'payload_hash invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_HASH_INVALID',
    );
  }
  return hash;
}

function validateClaimedAt(value: unknown): string {
  const text = String(value || '').trim();
  const parsed = Date.parse(text);
  if (!text || Number.isNaN(parsed)) {
    throw new ApiError(
      'claimed_at invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_CLAIMED_AT_INVALID',
    );
  }
  return new Date(parsed).toISOString();
}

function normalizeCanonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ApiError(
        'Payload contem numero nao finito',
        400,
        'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_INVALID',
      );
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeCanonicalValue);
  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const nested = value[key];
      if (nested === undefined) {
        throw new ApiError(
          'Payload contem valor indefinido',
          400,
          'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_INVALID',
        );
      }
      normalized[key] = normalizeCanonicalValue(nested);
    }
    return normalized;
  }
  throw new ApiError(
    'Payload contem tipo nao serializavel',
    400,
    'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_INVALID',
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonicalValue(value));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function getOfflineSyncHashMaterial(command: PilotOfflineSyncCommand): Record<string, unknown> {
  return {
    command_type: command.command_type,
    entity_type: command.entity_type,
    operation_type: command.operation_type,
    base_server_version: command.base_server_version,
    base_flight_version: command.base_flight_version,
    local_sequence: command.local_sequence,
    claimed_at: command.claimed_at,
    payload: command.payload,
  };
}

export async function computeOfflineSyncCommandHash(
  command: PilotOfflineSyncCommand,
): Promise<string> {
  return sha256Hex(canonicalJson(getOfflineSyncHashMaterial(command)));
}

export async function assertOfflineSyncCommandHash(
  command: PilotOfflineSyncCommand,
): Promise<void> {
  const expected = await computeOfflineSyncCommandHash(command);
  if (expected !== command.payload_hash) {
    throw new ApiError(
      'payload_hash nao corresponde ao comando recebido',
      409,
      'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_HASH_MISMATCH',
    );
  }
}

function normalizeLease(value: unknown): PilotOfflineLeaseEnvelope {
  if (!isPlainObject(value)) {
    throw new ApiError(
      'lease offline ausente ou invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_LEASE_INVALID',
    );
  }
  return {
    envelope_version: Number(value.envelope_version) as 1,
    alg: String(value.alg || '') as 'ES256',
    key_id: String(value.key_id || ''),
    payload: String(value.payload || ''),
    signature: String(value.signature || ''),
  };
}

export function normalizeOfflineSyncCommand(value: unknown): PilotOfflineSyncCommand {
  if (!isPlainObject(value)) {
    throw new ApiError(
      'Comando offline invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_COMMAND_INVALID',
    );
  }
  const payload = value.payload;
  if (!isPlainObject(payload)) {
    throw new ApiError(
      'Payload do comando offline invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_INVALID',
    );
  }

  return {
    client_operation_id: validateOperationId(value.client_operation_id),
    tenant_id: requirePositiveInteger(value.tenant_id, 'tenant_id'),
    user_id: requirePositiveInteger(value.user_id, 'user_id'),
    flight_id: requirePositiveInteger(value.flight_id, 'flight_id'),
    device_id: String(value.device_id || '').trim(),
    command_type: requireExactString(
      value.command_type,
      PILOT_OFFLINE_SYNC_COMMAND_TYPE,
      'command_type',
    ) as typeof PILOT_OFFLINE_SYNC_COMMAND_TYPE,
    entity_type: requireExactString(
      value.entity_type,
      PILOT_OFFLINE_SYNC_ENTITY_TYPE,
      'entity_type',
    ) as typeof PILOT_OFFLINE_SYNC_ENTITY_TYPE,
    operation_type: requireExactString(
      value.operation_type,
      PILOT_OFFLINE_SYNC_OPERATION_TYPE,
      'operation_type',
    ) as typeof PILOT_OFFLINE_SYNC_OPERATION_TYPE,
    base_server_version: requireNonNegativeInteger(value.base_server_version, 'base_server_version'),
    base_flight_version: requirePositiveInteger(value.base_flight_version, 'base_flight_version'),
    local_sequence: requirePositiveInteger(value.local_sequence, 'local_sequence'),
    claimed_at: validateClaimedAt(value.claimed_at),
    payload_hash: validatePayloadHash(value.payload_hash),
    lease: normalizeLease(value.lease),
    payload,
  };
}

export function parseOfflineSyncBatch(value: unknown): PilotOfflineSyncCommand[] {
  if (!isPlainObject(value) || !Array.isArray(value.commands)) {
    throw new ApiError(
      'Payload de sincronizacao invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_BATCH_INVALID',
    );
  }
  if (value.commands.length < 1 || value.commands.length > PILOT_OFFLINE_SYNC_MAX_COMMANDS) {
    throw new ApiError(
      `Lote offline deve conter entre 1 e ${PILOT_OFFLINE_SYNC_MAX_COMMANDS} comandos`,
      400,
      'CONTROLE_VOOS_PILOT_SYNC_BATCH_SIZE_INVALID',
    );
  }
  const normalized = value.commands.map(normalizeOfflineSyncCommand);
  const ids = new Set<string>();
  for (const command of normalized) {
    if (ids.has(command.client_operation_id)) {
      throw new ApiError(
        'client_operation_id duplicado no mesmo lote',
        400,
        'CONTROLE_VOOS_PILOT_SYNC_DUPLICATE_OPERATION_IN_BATCH',
      );
    }
    ids.add(command.client_operation_id);
  }
  return normalized;
}

export function isPilotOfflineSyncEnabled(env: Env): boolean {
  return String(env.PILOT_OFFLINE_SYNC_ENABLED || '').trim().toLowerCase() === 'true';
}

export function assertPilotOfflineSyncEnabled(env: Env): void {
  if (!isPilotOfflineSyncEnabled(env)) {
    throw new ApiError(
      'Sincronizacao offline do Pilot App ainda nao esta habilitada neste ambiente',
      503,
      'CONTROLE_VOOS_PILOT_SYNC_DISABLED',
    );
  }
}

export async function getOfflineSyncReceipt(
  db: D1Database,
  empresaId: number,
  clientOperationId: string,
): Promise<PilotOfflineSyncReceiptRow | null> {
  return db
    .prepare(
      `
        SELECT
          id, empresa_id, client_operation_id, voo_id, usuario_id, funcionario_id,
          device_id, command_type, entity_type, canonical_entity_id, payload_hash,
          base_server_version, server_entity_version, result_status, result_code,
          result_json, received_at, updated_at
        FROM cv_offline_sync_receipts
        WHERE empresa_id = ? AND client_operation_id = ?
        LIMIT 1
      `,
    )
    .bind(empresaId, clientOperationId)
    .first<PilotOfflineSyncReceiptRow>();
}

export function parseReceiptResultJson(
  receipt: PilotOfflineSyncReceiptRow,
): Record<string, unknown> | null {
  if (!receipt.result_json) return null;
  try {
    const parsed = JSON.parse(receipt.result_json);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function replayReceipt(
  receipt: PilotOfflineSyncReceiptRow,
  command: PilotOfflineSyncCommand,
): PilotOfflineSyncCommandResult {
  if (receipt.payload_hash !== command.payload_hash) {
    throw new ApiError(
      'client_operation_id ja utilizado com payload diferente',
      409,
      'CONTROLE_VOOS_PILOT_SYNC_OPERATION_HASH_CONFLICT',
    );
  }
  if (
    receipt.usuario_id !== command.user_id ||
    receipt.voo_id !== command.flight_id ||
    receipt.device_id !== command.device_id
  ) {
    throw new ApiError(
      'client_operation_id pertence a outro contexto operacional',
      409,
      'CONTROLE_VOOS_PILOT_SYNC_OPERATION_CONTEXT_CONFLICT',
    );
  }

  const detail = parseReceiptResultJson(receipt);
  return {
    client_operation_id: command.client_operation_id,
    status: receipt.result_status === 'accepted' ? 'already_accepted' : receipt.result_status,
    server_received_at: receipt.received_at,
    server_entity_version: receipt.server_entity_version,
    canonical_entity_id: receipt.canonical_entity_id,
    error_code: receipt.result_code,
    conflict:
      receipt.result_status === 'conflict' && detail ? detail : null,
  };
}

export function buildOfflineSyncReceiptInsert(
  db: D1Database,
  input: {
    empresaId: number;
    command: PilotOfflineSyncCommand;
    funcionarioId: number | null;
    canonicalEntityId?: string | null;
    serverEntityVersion?: number | null;
    resultStatus: Exclude<PilotOfflineSyncStatus, 'already_accepted'>;
    resultCode?: string | null;
    resultJson?: Record<string, unknown> | null;
    requirePriorChange?: boolean;
  },
): D1PreparedStatement {
  const selectPrefix = input.requirePriorChange
    ? `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now') WHERE (SELECT changes()) > 0`
    : `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

  return db
    .prepare(
      `
        INSERT INTO cv_offline_sync_receipts (
          empresa_id, client_operation_id, voo_id, usuario_id, funcionario_id,
          device_id, command_type, entity_type, canonical_entity_id, payload_hash,
          base_server_version, server_entity_version, result_status, result_code,
          result_json, received_at, updated_at
        )
        ${selectPrefix}
      `,
    )
    .bind(
      input.empresaId,
      input.command.client_operation_id,
      input.command.flight_id,
      input.command.user_id,
      input.funcionarioId,
      input.command.device_id,
      input.command.command_type,
      input.command.entity_type,
      input.canonicalEntityId ?? null,
      input.command.payload_hash,
      input.command.base_server_version,
      input.serverEntityVersion ?? null,
      input.resultStatus,
      input.resultCode ?? null,
      input.resultJson ? canonicalJson(input.resultJson) : null,
    );
}

export function commandResultFromAccepted(input: {
  command: PilotOfflineSyncCommand;
  serverEntityVersion: number;
  canonicalEntityId: string;
  serverReceivedAt?: string | null;
}): PilotOfflineSyncCommandResult {
  return {
    client_operation_id: input.command.client_operation_id,
    status: 'accepted',
    server_received_at: input.serverReceivedAt ?? null,
    server_entity_version: input.serverEntityVersion,
    canonical_entity_id: input.canonicalEntityId,
    error_code: null,
    conflict: null,
  };
}


export async function assertOfflineSyncReceiptSchemaReady(db: D1Database): Promise<void> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'cv_offline_sync_receipts'",
    )
    .first<{ total: number }>()
    .catch(() => null);
  if (!row || Number(row.total) !== 1) {
    throw new ApiError(
      'Persistencia de idempotencia offline ainda nao esta disponivel neste ambiente',
      503,
      'CONTROLE_VOOS_PILOT_SYNC_SCHEMA_UNAVAILABLE',
    );
  }
}

export async function recordOfflineSyncConflict(
  db: D1Database,
  input: {
    empresaId: number;
    command: PilotOfflineSyncCommand;
    funcionarioId: number | null;
    code: string;
    detail: Record<string, unknown>;
  },
): Promise<PilotOfflineSyncCommandResult> {
  try {
    await buildOfflineSyncReceiptInsert(db, {
      empresaId: input.empresaId,
      command: input.command,
      funcionarioId: input.funcionarioId,
      canonicalEntityId: null,
      serverEntityVersion: null,
      resultStatus: 'conflict',
      resultCode: input.code,
      resultJson: input.detail,
    }).run();
  } catch {
    const raced = await getOfflineSyncReceipt(
      db,
      input.empresaId,
      input.command.client_operation_id,
    );
    if (raced) return replayReceipt(raced, input.command);
    throw new ApiError(
      'Falha ao registrar conflito de sincronizacao',
      503,
      'CONTROLE_VOOS_PILOT_SYNC_RECEIPT_WRITE_FAILED',
    );
  }

  const receipt = await getOfflineSyncReceipt(
    db,
    input.empresaId,
    input.command.client_operation_id,
  );
  if (!receipt) {
    throw new ApiError(
      'Receipt de conflito nao confirmado',
      503,
      'CONTROLE_VOOS_PILOT_SYNC_RECEIPT_MISSING',
    );
  }
  return replayReceipt(receipt, input.command);
}

export function buildAcceptedReceiptForCreatedRdv(
  db: D1Database,
  input: {
    empresaId: number;
    command: PilotOfflineSyncCommand;
    funcionarioId: number | null;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `
        INSERT INTO cv_offline_sync_receipts (
          empresa_id, client_operation_id, voo_id, usuario_id, funcionario_id,
          device_id, command_type, entity_type, canonical_entity_id, payload_hash,
          base_server_version, server_entity_version, result_status, result_code,
          result_json, received_at, updated_at
        )
        SELECT
          ?, ?, ?, ?, ?, ?, ?, ?,
          (
            SELECT CAST(id AS TEXT)
            FROM cv_rdv_operacional
            WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL AND status <> 'cancelado'
            ORDER BY id DESC
            LIMIT 1
          ),
          ?, ?, 1, 'accepted', NULL, NULL, datetime('now'), datetime('now')
        WHERE (SELECT changes()) > 0
      `,
    )
    .bind(
      input.empresaId,
      input.command.client_operation_id,
      input.command.flight_id,
      input.command.user_id,
      input.funcionarioId,
      input.command.device_id,
      input.command.command_type,
      input.command.entity_type,
      input.empresaId,
      input.command.flight_id,
      input.command.payload_hash,
      input.command.base_server_version,
    );
}
