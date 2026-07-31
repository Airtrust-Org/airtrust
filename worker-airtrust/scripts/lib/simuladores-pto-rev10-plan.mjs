import crypto from 'node:crypto';

export const PTO_REV10_PLAN_SCHEMA_VERSION = 1;
export const PTO_REV10_PLAN_KIND = 'PTO_REV10_SIMULATORS';
export const PTO_REV10_EXPECTED_PLAN_TOTALS = Object.freeze({
  models: 66,
  links: 1188,
  notechs_links: 990,
});

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
  return crypto
    .createHash('sha256')
    .update(typeof value === 'string' ? value : stableJson(value))
    .digest('hex');
}

export function sealPtoRev10Plan(payload) {
  if (!payload || typeof payload !== 'object' || Object.hasOwn(payload, 'plan_sha256')) {
    throw new Error('payload de plano inválido');
  }
  return { ...payload, plan_sha256: sha256(payload) };
}

export function assertPtoRev10Plan(plan) {
  if (plan?.schema_version !== PTO_REV10_PLAN_SCHEMA_VERSION) {
    throw new Error('schema de plano PTO Rev10 incompatível');
  }
  if (plan?.kind !== PTO_REV10_PLAN_KIND) throw new Error('kind de plano PTO Rev10 inválido');
  const { plan_sha256: received, ...payload } = plan || {};
  if (!received || sha256(payload) !== received) throw new Error('plan_sha256 adulterado');
  for (const [key, expected] of Object.entries(PTO_REV10_EXPECTED_PLAN_TOTALS)) {
    if (Number(plan.totals?.[key]) !== expected) {
      throw new Error(`total ${key} do plano PTO Rev10 inválido`);
    }
  }
  if (!Number.isInteger(plan.empresa_id) || plan.empresa_id <= 0) {
    throw new Error('empresa_id do plano inválido');
  }
  if (!plan.base_fingerprint || typeof plan.base_fingerprint !== 'string') {
    throw new Error('base_fingerprint ausente');
  }
  if (!plan.catalog_fingerprint || typeof plan.catalog_fingerprint !== 'string') {
    throw new Error('catalog_fingerprint ausente');
  }
  if (!Array.isArray(plan.superseded_models)) {
    throw new Error('lista de modelos substituídos ausente');
  }
  const supersededIds = new Set();
  for (const row of plan.superseded_models) {
    if (!Number.isInteger(row?.id) || row.id <= 0 || supersededIds.has(row.id)) {
      throw new Error('modelo substituído inválido ou duplicado');
    }
    supersededIds.add(row.id);
  }
  if (!Array.isArray(plan.models) || plan.models.length !== plan.totals.models) {
    throw new Error('modelos do plano incompletos');
  }
  if (!Array.isArray(plan.items) || plan.items.length !== plan.totals.links) {
    throw new Error('vínculos do plano incompletos');
  }
  if (!Array.isArray(plan.notechs) || plan.notechs.length !== 15) {
    throw new Error('catálogo NOTECHS do plano incompleto');
  }

  const codes = new Set(plan.models.map((model) => model.codigo));
  if (codes.size !== plan.models.length) throw new Error('modelo canônico duplicado');
  for (const model of plan.models) {
    if (!model.codigo || !model.titulo || !model.tipo_estruturado || !model.carga_sessao) {
      throw new Error('modelo sem metadados canônicos obrigatórios');
    }
    if (!Number.isInteger(model.duracao_estimada_minutos) || model.duracao_estimada_minutos < 0) {
      throw new Error(`${model.codigo}: duração canônica inválida`);
    }
    const items = plan.items
      .filter((item) => item.modelo === model.codigo)
      .sort((left, right) => left.ordem - right.ordem);
    if (items.length !== 18 || items.some((item, index) => item.ordem !== index + 1)) {
      throw new Error(`${model.codigo}: exige 18 posições técnicas 1..18`);
    }
  }
  for (const item of plan.items) {
    if (!codes.has(item.modelo)) throw new Error(`vínculo aponta para modelo ausente: ${item.modelo}`);
    if (!item.codigo || !item.nome || !item.categoria) {
      throw new Error(`${item.modelo}/${item.ordem}: vínculo técnico incompleto`);
    }
  }

  const requestedCodes = new Set(plan.items.map((item) => item.codigo));
  if (!Array.isArray(plan.manobra_resolution) || plan.manobra_resolution.length !== requestedCodes.size) {
    throw new Error('resolução de manobras incompleta');
  }
  const resolvedCodes = new Set();
  for (const entry of plan.manobra_resolution) {
    if (!entry?.codigo_canonico || resolvedCodes.has(entry.codigo_canonico)) {
      throw new Error('resolução de manobra ausente ou duplicada');
    }
    resolvedCodes.add(entry.codigo_canonico);
  }
  for (const code of requestedCodes) {
    if (!resolvedCodes.has(code)) throw new Error(`manobra sem resolução: ${code}`);
  }
  return true;
}

export function projectionToPlanPayload({
  projection,
  empresaId,
  baseFingerprint,
  catalogFingerprint,
  supersededModels,
  manobraResolution,
}) {
  if (!projection?.aeronaves?.AW139 || !projection?.aeronaves?.S76) {
    throw new Error('projeção PTO Rev10 inválida');
  }
  if (Number(projection.empresa_alvo) !== Number(empresaId)) {
    throw new Error('tenant da projeção diverge');
  }

  const models = [];
  const items = [];
  for (const [aircraft, data] of Object.entries(projection.aeronaves)) {
    const catalogByCode = new Map(data.catalogo_manobras.map((item) => [item.codigo, item]));
    for (const session of data.sessoes) {
      models.push({
        codigo: session.codigo,
        titulo: session.titulo,
        programa: session.programa,
        natureza: session.natureza,
        tipo_estruturado: session.tipo_estruturado,
        carga_sessao: session.carga_sessao,
        duracao_estimada_minutos: session.duracao_estimada_minutos,
        ordem_curricular: session.ordem_curricular,
        aeronave: aircraft === 'S76' ? 'SK76' : aircraft,
        tipo_dispositivo: 'SIMULADOR',
      });
      for (const item of session.itens_tecnicos) {
        const catalog = catalogByCode.get(item.codigo);
        if (!catalog) throw new Error(`${session.codigo}: código fora do catálogo ${item.codigo}`);
        items.push({
          modelo: session.codigo,
          ordem: item.ordem,
          codigo: item.codigo,
          nome: item.nome,
          execucao_pf: item.tripulante,
          categoria: catalog.categoria || catalog.familia || 'GERAL',
          fase_voo: item.fase || catalog.fase || null,
          tipo_conteudo: item.tipo_conteudo || catalog.tipo_conteudo || null,
          aeronave: aircraft === 'S76' ? 'SK76' : aircraft,
          desempenho_esperado: item.nome,
          referencia_tecnica: projection.fonte_normativa,
        });
      }
    }
  }

  const sourceHashes = {};
  for (const [aircraft, packageInfo] of Object.entries(projection.source_packages || {})) {
    sourceHashes[`${aircraft}/ZIP`] = packageInfo.zip_sha256;
    for (const [fileName, hash] of Object.entries(packageInfo.files || {})) {
      sourceHashes[`${aircraft}/${fileName}`] = hash;
    }
  }

  return {
    schema_version: PTO_REV10_PLAN_SCHEMA_VERSION,
    kind: PTO_REV10_PLAN_KIND,
    versao_matriz: projection.versao_matriz,
    empresa_id: Number(empresaId),
    source_hashes: sourceHashes,
    base_fingerprint: baseFingerprint,
    catalog_fingerprint: catalogFingerprint,
    superseded_models: supersededModels,
    totals: { ...PTO_REV10_EXPECTED_PLAN_TOTALS },
    models,
    items,
    notechs: projection.notechs,
    instructor_examiner: {
      status: projection.policy?.instructor_examiner_session_models,
      codes: projection.instrutor_examinador?.codigos?.length || 0,
      links: projection.instrutor_examinador?.relacoes?.length || 0,
    },
    manobra_resolution: manobraResolution,
    safeguards: [
      'tenant obrigatório',
      'somente D1 local no aplicador',
      'fichas e sessões realizadas não são atualizadas nem excluídas',
      'modelos atuais são versionados, nunca sobrescritos',
      '18 itens técnicos e 15 NOTECHS por sessão',
      'carga_sessao é a única fonte de duração',
    ],
  };
}
