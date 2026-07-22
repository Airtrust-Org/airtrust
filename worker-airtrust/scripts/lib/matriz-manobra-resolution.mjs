import { sha256, stableJson } from './matriz-import-plan.mjs';

export const EXPECTED_MANOEUVRE_CODE_COUNT = 301;
export const RESOLUTION_TYPES = [
  'EXACT_UNIQUE',
  'FORMAL_ALIAS',
  'LEGACY_EQUIVALENT',
  'TRUE_MISSING',
  'COLLISION',
  'CROSS_TENANT_ONLY',
];
const REUSE_TYPES = new Set(['EXACT_UNIQUE', 'FORMAL_ALIAS', 'LEGACY_EQUIVALENT']);
const CREATE_TYPES = new Set(['TRUE_MISSING', 'COLLISION', 'CROSS_TENANT_ONLY']);

function fail(message) {
  throw new Error(`Resolução de manobras recusada: ${message}`);
}

/**
 * Classifies one canonical code against the tenant's own active manobras and,
 * optionally, the full cross-tenant table. Only detects the mechanically safe
 * outcomes (exact match, collision, missing, cross-tenant-only): FORMAL_ALIAS
 * and LEGACY_EQUIVALENT require human-reviewed evidence and must be supplied
 * as an override, never inferred here.
 */
export function classifyManoeuvreCode({ codigoCanonico, empresaId, tenantManobras, allManobras }) {
  const tenantExact = tenantManobras.filter(
    (m) => m.codigo === codigoCanonico && !m.deleted_at && Number(m.empresa_id) === empresaId,
  );
  if (tenantExact.length === 1) {
    return { resolution_type: 'EXACT_UNIQUE', existing_manobra_id: tenantExact[0].id };
  }
  if (tenantExact.length > 1) {
    return { resolution_type: 'COLLISION', candidates: tenantExact };
  }
  if (Array.isArray(allManobras)) {
    const crossTenantExact = allManobras.filter(
      (m) => m.codigo === codigoCanonico && !m.deleted_at && Number(m.empresa_id) !== empresaId,
    );
    if (crossTenantExact.length > 0) {
      return { resolution_type: 'CROSS_TENANT_ONLY', candidates: crossTenantExact };
    }
  }
  return { resolution_type: 'TRUE_MISSING' };
}

function buildCreatePayload(sampleItem) {
  if (!sampleItem?.codigo || !sampleItem?.nome || !sampleItem?.categoria) return null;
  return {
    codigo: sampleItem.codigo,
    nome: sampleItem.nome,
    categoria: sampleItem.categoria,
    tipo_aeronave: sampleItem.aeronave || null,
    fase_voo: sampleItem.fase_voo ?? null,
    tipo_conteudo: sampleItem.tipo_conteudo ?? null,
    referencia_tecnica: sampleItem.referencia_tecnica ?? null,
    descricao: sampleItem.desempenho_esperado ?? null,
  };
}

/**
 * Builds the deterministic 301-row resolution block. `overrides` carries
 * human-reviewed FORMAL_ALIAS/LEGACY_EQUIVALENT decisions keyed by canonical
 * code; every other code is classified mechanically from the tenant state.
 */
export function buildManoeuvreResolutionEntries({
  empresaId,
  items,
  tenantManobras,
  allManobras,
  overrides = {},
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) fail('empresa_id inválido');
  if (!Array.isArray(items) || items.length === 0) fail('itens de matriz ausentes');
  if (!Array.isArray(tenantManobras)) fail('manobras do tenant ausentes');

  const byCode = new Map();
  for (const item of items) {
    const codigo = String(item.codigo || '');
    if (!codigo) fail('item de matriz sem código de manobra');
    if (!byCode.has(codigo)) byCode.set(codigo, { models: new Set(), count: 0, sample: item });
    const entry = byCode.get(codigo);
    entry.models.add(item.modelo);
    entry.count += 1;
  }

  const codes = [...byCode.keys()].sort();
  return codes.map((codigo) => {
    const info = byCode.get(codigo);
    const override = overrides[codigo];
    const classified = override
      ? { resolution_type: override.resolution_type, existing_manobra_id: override.existing_manobra_id }
      : classifyManoeuvreCode({ codigoCanonico: codigo, empresaId, tenantManobras, allManobras });

    const resolutionType = classified.resolution_type;
    const entry = {
      codigo_canonico: codigo,
      resolution_type: resolutionType,
      existing_manobra_id: REUSE_TYPES.has(resolutionType) ? classified.existing_manobra_id ?? null : null,
      create_payload: CREATE_TYPES.has(resolutionType) ? buildCreatePayload(info.sample) : null,
      evidence: override?.evidence ?? null,
      source_hash: sha256(stableJson(info.sample)),
      models_using: [...info.models].sort(),
      expected_link_count: info.count,
    };
    entry.evidence_hash = entry.evidence ? sha256(stableJson(entry.evidence)) : null;
    return entry;
  });
}

/**
 * Validates the resolution block in isolation (shape, counts, completeness).
 * Tenant-ownership of `existing_manobra_id` values must be checked against
 * the live database at apply time — this function has no DB access.
 */
export function validateManoeuvreResolution(entries, { requestedCodes }) {
  if (!Array.isArray(entries)) fail('bloco de resolução ausente');
  if (entries.length !== EXPECTED_MANOEUVRE_CODE_COUNT) {
    fail(`esperadas ${EXPECTED_MANOEUVRE_CODE_COUNT} resoluções; encontradas ${entries.length}`);
  }

  const seenCodes = new Set();
  const seenManobraIds = new Set();
  for (const entry of entries) {
    const codigo = entry?.codigo_canonico;
    if (!codigo) fail('resolução sem codigo_canonico');
    if (seenCodes.has(codigo)) fail(`código de manobra duplicado na resolução: ${codigo}`);
    seenCodes.add(codigo);

    if (!RESOLUTION_TYPES.includes(entry.resolution_type)) {
      fail(`resolution_type inválido para ${codigo}: ${entry.resolution_type}`);
    }

    if (REUSE_TYPES.has(entry.resolution_type)) {
      if (!Number.isInteger(entry.existing_manobra_id)) {
        fail(`${codigo}: existing_manobra_id ausente para ${entry.resolution_type}`);
      }
      if (seenManobraIds.has(entry.existing_manobra_id)) {
        fail(`manobra_id ${entry.existing_manobra_id} reutilizada por mais de um código canônico`);
      }
      seenManobraIds.add(entry.existing_manobra_id);
    } else if (CREATE_TYPES.has(entry.resolution_type)) {
      const payload = entry.create_payload;
      if (!payload || !payload.codigo || !payload.nome || !payload.categoria) {
        fail(`${codigo}: create_payload incompleto para ${entry.resolution_type}`);
      }
    }

    if (!entry.source_hash) fail(`${codigo}: source_hash ausente`);
    if (!Array.isArray(entry.models_using) || entry.models_using.length === 0) {
      fail(`${codigo}: models_using ausente`);
    }
    if (!Number.isInteger(entry.expected_link_count) || entry.expected_link_count < 1) {
      fail(`${codigo}: expected_link_count inválido`);
    }
  }

  if (Array.isArray(requestedCodes)) {
    for (const codigo of requestedCodes) {
      if (!seenCodes.has(codigo)) fail(`código sem resolução: ${codigo}`);
    }
    if (requestedCodes.length !== seenCodes.size) {
      fail('quantidade de códigos solicitados diverge da resolução');
    }
  }

  return true;
}

/** Physical code for manobras created from a COLLISION/versioned resolution. */
export function physicalManoeuvreCode(codigoCanonico, versaoMatriz) {
  return `${codigoCanonico}@${versaoMatriz}`;
}
