function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalize(value[key]);
  }
  return result;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(value) {
  const input = typeof value === 'string' ? value : canonicalJson(value);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildReadyToTransmitCommand({
  syncPayload,
  rdvDraft,
  stageDrafts,
  localSequence,
  deviceId,
}) {
  const payload = structuredClone(syncPayload);
  payload.identity = {
    ...payload.identity,
    device_id: String(deviceId),
  };

  const payloadHash = await sha256Hex(payload);
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    client_operation_id: crypto.randomUUID(),
    tenant_id: Number(rdvDraft.tenant_id),
    user_id: Number(rdvDraft.user_id),
    flight_id: Number(rdvDraft.flight_id),
    device_id: String(deviceId),
    entity_type: 'rdv_bundle',
    entity_id: rdvDraft.source_rdv_id ?? rdvDraft.entity_local_id,
    operation_type: 'upsert_rdv_bundle',
    base_server_version: {
      flight: Number(rdvDraft.source_flight_version || 0),
      rdv: Number(rdvDraft.source_rdv_version || 0),
      stages: stageDrafts.map((stage) => ({
        id: stage.source_stage_id ?? null,
        updated_at: stage.source_stage_updated_at || null,
      })),
    },
    local_sequence: Number(localSequence),
    claimed_at: now,
    payload,
    payload_hash: payloadHash,
    created_at_local: now,
    state: 'ready_to_transmit',
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
  };
}

export function isTransmitPending(command) {
  return command?.state === 'ready_to_transmit' || command?.state === 'rejected_retriable';
}

export function supersedeLocalCommand(command) {
  return {
    ...command,
    state: 'superseded_local',
    superseded_at: new Date().toISOString(),
  };
}
