import crypto from 'node:crypto';

export const PLAN_SCHEMA_VERSION = 2;

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
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
    const current = items.filter((item) => item.modelo === model.codigo).sort((a, b) => a.ordem - b.ordem);
    if (current.length !== 18) throw new Error(`${model.codigo}: exige 18 posições`);
    const orders = new Set(current.map((item) => item.ordem));
    if (orders.size !== 18 || [...orders].some((order) => !Number.isInteger(order) || order < 1 || order > 18)) {
      throw new Error(`${model.codigo}: ordens devem ser únicas de 1 a 18`);
    }
    if (current.some((item) => !item.codigo || !item.nome || !item.execucao_pf)) {
      throw new Error(`${model.codigo}: metadado obrigatório ausente`);
    }
  }
}

export function createDeterministicPlan({ empresaId, sourceHashes, aw139, sk76, loft }) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) throw new Error('empresa_id inválido');
  validateModelItems(aw139.models, aw139.items);
  validateModelItems(sk76.models, sk76.items);
  const payload = {
    schema_version: PLAN_SCHEMA_VERSION,
    empresa_id: empresaId,
    source_hashes: sourceHashes,
    matrices: { AW139: aw139, SK76: sk76 },
    totals: { modelos: aw139.models.length + sk76.models.length, vinculos: aw139.items.length + sk76.items.length, loft },
  };
  return { ...payload, plan_sha256: sha256(payload) };
}
