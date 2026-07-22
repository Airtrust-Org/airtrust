import crypto from 'node:crypto';
import { EXPECTED_TOTALS } from './matriz-session-contract.mjs';

export const PLAN_SCHEMA_VERSION = 2;
export const EXPECTED_SOURCE_HASH_COUNT = 61;

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  if (typeof value === 'string' || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function validateModelItems(models, items) {
  for (const model of models) {
    const current = items
      .filter((item) => item.modelo === model.codigo)
      .sort((a, b) => a.ordem - b.ordem);
    if (current.length !== 18) throw new Error(`${model.codigo}: exige 18 posições`);
    const orders = new Set(current.map((item) => item.ordem));
    if (
      orders.size !== 18 ||
      [...orders].some((order) => !Number.isInteger(order) || order < 1 || order > 18)
    ) {
      throw new Error(`${model.codigo}: ordens devem ser únicas de 1 a 18`);
    }
    if (current.some((item) => !item.codigo || !item.nome || !item.execucao_pf)) {
      throw new Error(`${model.codigo}: metadado obrigatório ausente`);
    }
  }
}

export function createDeterministicPlan({
  empresaId,
  sourceHashes,
  aw139,
  sk76,
  loft,
  contract = null,
  baseFingerprint = null,
  expectedCurrentVersions = [],
  loftSummary = null,
  safeguards = [
    'tenant obrigatório',
    'somente D1 local',
    'requer snapshot e revisão antes de aplicar',
    'modelos históricos devem ser versionados, não sobrescritos',
    'rollback compensatório append-only (COMPENSATE)',
  ],
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) throw new Error('empresa_id inválido');
  validateModelItems(aw139.models, aw139.items);
  validateModelItems(sk76.models, sk76.items);
  const hashCount = Object.keys(sourceHashes || {}).length;
  if (hashCount !== EXPECTED_SOURCE_HASH_COUNT) {
    throw new Error(
      `esperados ${EXPECTED_SOURCE_HASH_COUNT} hashes de fonte; encontrados ${hashCount}`,
    );
  }
  const totals = {
    modelos: aw139.models.length + sk76.models.length,
    vinculos: aw139.items.length + sk76.items.length,
    loft,
  };
  if (
    totals.modelos !== EXPECTED_TOTALS.modelos ||
    totals.vinculos !== EXPECTED_TOTALS.vinculos ||
    totals.loft !== EXPECTED_TOTALS.loft
  ) {
    throw new Error('plano fora do contrato 51/918/22');
  }
  const payload = {
    schema_version: PLAN_SCHEMA_VERSION,
    empresa_id: empresaId,
    source_hashes: sourceHashes,
    contract_ref: contract
      ? { schema_version: contract.schema_version, totals: contract.totals }
      : null,
    matrices: { AW139: aw139, SK76: sk76 },
    totals,
    base_fingerprint: baseFingerprint,
    expected_current_versions: expectedCurrentVersions,
    loft_summary: loftSummary,
    safeguards,
  };
  return { ...payload, plan_sha256: sha256(payload) };
}

export function assertPlanIntegrity(plan, { sourceHashes, baseFingerprint } = {}) {
  if (!plan?.plan_sha256) throw new Error('plan_sha256 ausente');
  const { plan_sha256: _ignored, ...payload } = plan;
  const expected = sha256(payload);
  if (expected !== plan.plan_sha256) throw new Error('plan_sha256 adulterado');
  if (sourceHashes) {
    for (const [key, value] of Object.entries(sourceHashes)) {
      if (plan.source_hashes?.[key] !== value) throw new Error(`hash de fonte adulterado: ${key}`);
    }
  }
  if (baseFingerprint && plan.base_fingerprint !== baseFingerprint)
    throw new Error('fingerprint adulterado');
  return true;
}
