#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOperationalProjection } from './lib/simuladores-pto-rev10-packages.mjs';
import { assertPtoV18CurricularParity } from './lib/simuladores-pto-v18-parity.mjs';
import {
  assertRealTenantFingerprintState,
  buildTenantFingerprint,
} from './lib/matriz-base-fingerprint.mjs';
import { buildManoeuvreResolutionEntries } from './lib/matriz-manobra-resolution.mjs';
import {
  assertPtoRev10Plan,
  projectionToPlanPayload,
  sealPtoRev10Plan,
  sha256,
} from './lib/simuladores-pto-rev10-plan.mjs';

function fail(message) {
  throw new Error(`Preparação PTO Rev10 recusada: ${message}`);
}

function arg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function readJson(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) fail(`${label} inexistente`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizedModel(row) {
  return {
    id: Number(row.id),
    codigo: String(row.codigo || '').trim(),
    codigo_canonico: String(row.codigo_canonico || row.codigo || '').trim(),
    modelo_aeronave: String(row.modelo_aeronave || row.tipo_aeronave || '')
      .trim()
      .toUpperCase()
      .replace('S76', 'SK76'),
    is_current_version: Number(row.is_current_version || 0) === 1,
  };
}

export function selectSupersededPtoRev10Models(activeModels, projection) {
  const aircraftLegacyCodes = Object.values(projection?.aeronaves || {}).flatMap((aircraft) =>
    (aircraft.sessoes || []).flatMap((session) => session.legacy_source_codes || []),
  );
  const functionalLegacyCodes = (projection?.sessoes_funcionais || []).flatMap(
    (session) => session.legacy_source_codes || [],
  );
  const explicitLegacyCodes = new Set([...aircraftLegacyCodes, ...functionalLegacyCodes]);

  return activeModels
    .filter(
      (row) =>
        explicitLegacyCodes.has(String(row.codigo || '').trim()) ||
        explicitLegacyCodes.has(String(row.codigo_canonico || '').trim()),
    )
    .map((row) => ({
      id: Number(row.id),
      codigo: String(row.codigo || '').trim(),
      codigo_canonico: String(row.codigo_canonico || row.codigo || '').trim(),
    }))
    .sort((left, right) => left.id - right.id);
}

export function preparePtoRev10Plan({
  manifest,
  aw139Dir,
  s76Dir,
  tenantState,
  empresaId,
  contract = null,
  sourceManifest = null,
  contractSha256 = null,
  generatedAt = new Date().toISOString(),
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) fail('empresa_id inválido');
  if (Number(manifest.empresa_alvo) !== empresaId) fail('empresa do manifesto diverge');
  if (Number(tenantState.empresa_id) !== empresaId) fail('empresa do snapshot diverge');

  assertRealTenantFingerprintState({
    empresaId,
    currentVersions: tenantState.current_versions,
    resolvedManoeuvres: tenantState.resolved_manoeuvres,
    links: tenantState.links,
    migrationState: tenantState.migration_state,
  });
  if (!tenantState.migration_state?.has_0440) fail('migration 0440 não confirmada no snapshot');

  const projection = buildOperationalProjection({ manifest, aw139Dir, s76Dir });
  const parity = contract && sourceManifest
    ? assertPtoV18CurricularParity({ projection, contract, sourceManifest, contractSha256 })
    : null;
  if (projection.aeronaves.AW139.sessoes.length === 37 && !parity) {
    fail('pacote V18 exige contrato canônico e identidade da fonte');
  }
  if (!Array.isArray(tenantState.active_aircraft_models) || tenantState.active_aircraft_models.length === 0) {
    fail('snapshot sem catálogo ativo AW139/S-76');
  }
  const activeAircraftModels = tenantState.active_aircraft_models
    .map(normalizedModel)
    .filter((row) => row.modelo_aeronave === 'AW139' || row.modelo_aeronave === 'SK76')
    .sort((left, right) => left.id - right.id);
  const activeFunctionalModels = (tenantState.active_functional_models || [])
    .map(normalizedModel)
    .sort((left, right) => left.id - right.id);
  const allActiveRelevantModels = [...activeAircraftModels, ...activeFunctionalModels];
  if (
    allActiveRelevantModels.some(
      (row) => !Number.isInteger(row.id) || row.id <= 0 || !row.codigo || !row.codigo_canonico,
    )
  ) {
    fail('snapshot com modelo ativo inválido');
  }
  const supersededModels = selectSupersededPtoRev10Models(allActiveRelevantModels, projection);
  const catalogFingerprint = sha256(activeAircraftModels);

  const fingerprint = buildTenantFingerprint({
    empresaId,
    currentVersions: tenantState.current_versions,
    resolvedManoeuvres: tenantState.resolved_manoeuvres,
    links: tenantState.links,
    migrationState: tenantState.migration_state,
  }).fingerprint;

  const aircraftItems = Object.values(projection.aeronaves).flatMap((aircraft) =>
    aircraft.sessoes.flatMap((session) =>
      session.itens_tecnicos.map((item) => {
        const catalog = aircraft.catalogo_manobras.find((entry) => entry.codigo === item.codigo);
        if (!catalog) fail(`${session.codigo}: catálogo ausente para ${item.codigo}`);
        return {
          modelo: session.codigo,
          codigo: item.codigo,
          nome: item.nome,
          categoria: catalog.categoria || catalog.familia || 'GERAL',
          aeronave: aircraft.aeronave === 'S76' ? 'SK76' : aircraft.aeronave,
          fase_voo: item.fase || catalog.fase || null,
          tipo_conteudo: item.tipo_conteudo || catalog.tipo_conteudo || null,
          desempenho_esperado: item.nome,
          referencia_tecnica: projection.fonte_normativa,
        };
      }),
    ),
  );
  const functionalCatalogByCode = new Map(
    (projection.instrutor_examinador?.codigos || []).map((item) => [item.codigo, item]),
  );
  const functionalItems = projection.sessoes_funcionais.flatMap((session) =>
    session.itens_tecnicos.map((item) => {
      const catalog = functionalCatalogByCode.get(item.codigo);
      if (!catalog) fail(`${session.codigo}: catálogo funcional ausente para ${item.codigo}`);
      return {
        modelo: session.codigo,
        codigo: item.codigo,
        nome: item.nome,
        categoria: catalog.categoria,
        aeronave: null,
        fase_voo: null,
        tipo_conteudo: 'COMPETENCIA_FUNCIONAL',
        desempenho_esperado: item.nome,
        referencia_tecnica: projection.fonte_normativa,
      };
    }),
  );
  const projectionItems = [...aircraftItems, ...functionalItems];

  const manobraResolution = buildManoeuvreResolutionEntries({
    empresaId,
    items: projectionItems,
    tenantManobras: tenantState.resolved_manoeuvres,
    allManobras: tenantState.all_manoeuvres || tenantState.resolved_manoeuvres,
    overrides: tenantState.manobra_resolution_overrides || {},
  });

  const payload = projectionToPlanPayload({
    projection,
    empresaId,
    baseFingerprint: fingerprint,
    catalogFingerprint,
    supersededModels,
    manobraResolution,
    approvedSourceSha256: parity?.source_sha256,
    canonicalContractSha256: parity?.contract_sha256,
  });
  const plan = sealPtoRev10Plan({ generated_at: generatedAt, ...payload });
  assertPtoRev10Plan(plan);
  return { plan, projection, parity };
}

export function runCli(argv = process.argv) {
  const manifestPath = arg(argv, '--manifest');
  const aw139Dir = arg(argv, '--aw139-dir');
  const s76Dir = arg(argv, '--s76-dir');
  const tenantStatePath = arg(argv, '--tenant-state');
  const empresaId = Number(arg(argv, '--empresa-id'));
  const out = arg(argv, '--out');
  const contractPath = arg(argv, '--pto-v18-contract');
  const sourceManifestPath = arg(argv, '--pto-v18-manifest');
  if (!manifestPath || !aw139Dir || !s76Dir || !tenantStatePath || !out || !contractPath || !sourceManifestPath) {
    fail(
      'uso: --manifest <json> --aw139-dir <dir> --s76-dir <dir> --tenant-state <json> --empresa-id <id> --out <plan.json> --pto-v18-contract <sessoes_pto_v18.json> --pto-v18-manifest <manifesto_validacao.json>',
    );
  }

  const manifest = readJson(manifestPath, 'manifesto');
  const contract = readJson(contractPath, 'contrato canônico PTO V18');
  const contractSha256 = crypto.createHash('sha256').update(fs.readFileSync(contractPath)).digest('hex');
  const sourceManifest = readJson(sourceManifestPath, 'identidade da fonte PTO V18');
  const tenantState = readJson(tenantStatePath, 'snapshot tenant-scoped');
  const { plan, parity } = preparePtoRev10Plan({
    manifest,
    aw139Dir,
    s76Dir,
    tenantState,
    empresaId,
    contract,
    sourceManifest,
    contractSha256,
  });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: 'PLAN_ONLY',
        out,
        plan_sha256: plan.plan_sha256,
        totals: plan.totals,
        parity,
        unique_manoeuvres: plan.manobra_resolution.length,
      },
      null,
      2,
    )}\n`,
  );
  return plan;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) runCli(process.argv);
