import {
  assertPackageIdentity,
  fromInputDateTime,
  parseInteger,
  parseNumber,
} from '/pilot/pilot-rdv-draft.js';

export const PILOT_SYNC_COMMAND_TYPE = 'rdv_snapshot_upsert_v1';
export const PILOT_SYNC_ENTITY_TYPE = 'rdv_snapshot';
export const PILOT_SYNC_OPERATION_TYPE = 'upsert';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCanonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Comando offline contém número não finito.');
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeCanonicalValue);
  if (isPlainObject(value)) {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) {
        throw new Error('Comando offline contém valor indefinido.');
      }
      normalized[key] = normalizeCanonicalValue(value[key]);
    }
    return normalized;
  }
  throw new Error('Comando offline contém tipo não serializável.');
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeCanonicalValue(value));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function rdvPayload(form) {
  return {
    numero: optionalText(form.numero),
    data_voo: optionalText(form.data_voo),
    horario_decolagem_real: fromInputDateTime(form.horario_decolagem_real),
    horario_pouso_real: fromInputDateTime(form.horario_pouso_real),
    horas_voadas: parseNumber(form.horas_voadas),
    numero_pousos: parseInteger(form.numero_pousos),
    ciclos: parseInteger(form.ciclos),
    combustivel_decolagem: parseNumber(form.combustivel_decolagem),
    combustivel_pouso: parseNumber(form.combustivel_pouso),
    combustivel_consumo: parseNumber(form.combustivel_consumo),
    pob: parseInteger(form.pob),
    carga_kg: parseNumber(form.carga_kg),
    ocorrencias: optionalText(form.ocorrencias),
    divergencias: optionalText(form.divergencias),
  };
}

function stagePayload(stageDraft) {
  const fields = stageDraft.fields || {};
  return {
    source_stage_id:
      stageDraft.source_stage_id == null ? null : Number(stageDraft.source_stage_id),
    source_stage_updated_at: stageDraft.source_stage_updated_at || null,
    fields: {
      numero_etapa: parseInteger(fields.numero_etapa),
      origem_icao: optionalText(fields.origem_icao),
      destino_icao: optionalText(fields.destino_icao),
      horario_motor_ligado: fromInputDateTime(fields.horario_motor_ligado),
      horario_decolagem: fromInputDateTime(fields.horario_decolagem),
      horario_pouso: fromInputDateTime(fields.horario_pouso),
      horario_motor_desligado: fromInputDateTime(fields.horario_motor_desligado),
      tempo_ifr: optionalText(fields.tempo_ifr),
      tempo_noturno: optionalText(fields.tempo_noturno),
      pousos_diurnos: parseInteger(fields.pousos_diurnos),
      pousos_noturnos: parseInteger(fields.pousos_noturnos),
      starts: parseInteger(fields.starts),
      pax: parseInteger(fields.pax),
      payload: parseNumber(fields.payload),
      combustivel_inicio: parseNumber(fields.combustivel_inicio),
      combustivel_fim: parseNumber(fields.combustivel_fim),
      unidade_combustivel: optionalText(fields.unidade_combustivel),
    },
  };
}

export function getSyncHashMaterial(command) {
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

export async function buildOfflineSyncCommand({
  packageData,
  rdvDraft,
  stageDrafts,
  leaseEnvelope,
  deviceId,
  operationId = crypto.randomUUID(),
}) {
  const identity = assertPackageIdentity(packageData);
  if (!rdvDraft || !Array.isArray(stageDrafts) || stageDrafts.length === 0) {
    throw new Error('Rascunho operacional incompleto para transmissão.');
  }
  if (!leaseEnvelope) throw new Error('Lease assinado não encontrado no tablet.');
  if (Number(rdvDraft.flight_id) !== identity.flightId) {
    throw new Error('Rascunho RDV pertence a outro voo.');
  }
  if (
    Number(rdvDraft.tenant_id) !== identity.tenantId ||
    Number(rdvDraft.user_id) !== identity.userId
  ) {
    throw new Error('Rascunho RDV pertence a outra identidade.');
  }

  const localSequence = Number(rdvDraft.local_sequence || 0);
  if (!Number.isInteger(localSequence) || localSequence < 1) {
    throw new Error('Salve ao menos uma revisão local antes de transmitir.');
  }
  const claimedAt = String(rdvDraft.updated_at_claimed || '').trim();
  if (!claimedAt || Number.isNaN(Date.parse(claimedAt))) {
    throw new Error('Rascunho sem horário local confiável de atualização.');
  }

  const command = {
    client_operation_id: String(operationId).toLowerCase(),
    tenant_id: identity.tenantId,
    user_id: identity.userId,
    flight_id: identity.flightId,
    device_id: String(deviceId),
    command_type: PILOT_SYNC_COMMAND_TYPE,
    entity_type: PILOT_SYNC_ENTITY_TYPE,
    operation_type: PILOT_SYNC_OPERATION_TYPE,
    base_server_version: Number(rdvDraft.source_rdv_version || 0),
    base_flight_version: Number(rdvDraft.source_flight_version || 0),
    local_sequence: localSequence,
    claimed_at: new Date(claimedAt).toISOString(),
    payload_hash: '',
    lease: structuredClone(leaseEnvelope),
    payload: {
      source_package_id: String(rdvDraft.source_package_id),
      source_rdv_id: rdvDraft.source_rdv_id == null ? null : Number(rdvDraft.source_rdv_id),
      rdv: rdvPayload(rdvDraft.form || {}),
      stages: stageDrafts
        .slice()
        .sort(
          (left, right) =>
            Number(left?.fields?.numero_etapa || 0) -
            Number(right?.fields?.numero_etapa || 0),
        )
        .map(stagePayload),
    },
  };

  command.payload_hash = await sha256Hex(canonicalJson(getSyncHashMaterial(command)));
  return command;
}

export async function verifyOfflineSyncCommandHash(command) {
  const expected = await sha256Hex(canonicalJson(getSyncHashMaterial(command)));
  return expected === String(command?.payload_hash || '').toLowerCase();
}
