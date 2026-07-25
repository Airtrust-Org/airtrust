import crypto from 'node:crypto';
import { sha256, stableJson } from './matriz-import-plan.mjs';

export const REMEDIATION_PLAN_SCHEMA_VERSION = 1;
export const EXPECTED_MAPPING_COUNT = 5;
export const EXPECTED_MODEL_COUNT = 9;
export const EXPECTED_LINK_COUNT = 13;
export const EXPECTED_LINKS_PER_MODEL = 18;

function fail(message) {
  throw new Error(`Plano de remediação recusado: ${message}`);
}

/**
 * Fingerprints the discovered remediation target set (never the private
 * mapping file itself, which may carry human-authored notes): the five
 * canonical codes with their wrong/correct manobra ids, and the exact set of
 * affected model/link identities. Any drift between plan time and apply time
 * changes this hash, so a stale plan fails closed instead of silently
 * re-resolving against a moved target.
 */
export function buildRemediationFingerprint({ empresaId, versaoMatriz, mappingResolutions, affectedLinks }) {
  const payload = {
    empresa_id: Number(empresaId),
    versao_matriz: String(versaoMatriz),
    mappings: [...mappingResolutions]
      .map((m) => ({
        codigo_canonico: m.codigo_canonico,
        wrong_manobra_id: m.wrong_manobra_id,
        correct_manobra_id: m.correct_manobra_id,
      }))
      .sort((a, b) => a.codigo_canonico.localeCompare(b.codigo_canonico)),
    links: [...affectedLinks]
      .map((l) => ({ link_id: l.id, modelo_id: l.modelo_id, ordem: l.ordem, manobra_id: l.manobra_id }))
      .sort((a, b) => a.link_id - b.link_id),
  };
  return { payload, fingerprint: sha256(payload), canonical: stableJson(payload) };
}

export function sealRemediationPlan(planWithoutHash) {
  if (!planWithoutHash || typeof planWithoutHash !== 'object') fail('plano inválido');
  if (Object.hasOwn(planWithoutHash, 'plan_sha256')) fail('sealRemediationPlan recebe plano sem plan_sha256');
  return { ...planWithoutHash, plan_sha256: sha256(planWithoutHash) };
}

export function assertRemediationPlanIntegrity(plan, { baseFingerprint, expectedHash } = {}) {
  if (!plan?.plan_sha256) fail('plan_sha256 ausente');
  if (plan.schema_version !== REMEDIATION_PLAN_SCHEMA_VERSION) fail(`schema de plano incompatível: ${plan.schema_version}`);
  const { plan_sha256: _ignored, ...payload } = plan;
  const expected = sha256(payload);
  const received = String(plan.plan_sha256);
  if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    fail('plan_sha256 adulterado');
  }
  if (baseFingerprint && plan.base_fingerprint !== baseFingerprint) fail('base_fingerprint adulterado');
  if (expectedHash && plan.expected_hash !== expectedHash) fail('expected_hash adulterado');
  if (!plan.remediation_uuid) fail('remediation_uuid ausente');
  if (Number(plan.empresa_id) !== 6) fail('empresa_id não autorizado para esta remediação');
  if (plan.mapping_count !== EXPECTED_MAPPING_COUNT) fail(`esperados ${EXPECTED_MAPPING_COUNT} mappings`);
  if (plan.model_count !== EXPECTED_MODEL_COUNT) fail(`esperados ${EXPECTED_MODEL_COUNT} modelos`);
  if (plan.link_count !== EXPECTED_LINK_COUNT) fail(`esperados ${EXPECTED_LINK_COUNT} vínculos`);
  return true;
}
