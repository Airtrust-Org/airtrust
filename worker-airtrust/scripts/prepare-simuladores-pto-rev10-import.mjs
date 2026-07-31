#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOperationalProjection } from './lib/simuladores-pto-rev10-packages.mjs';
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

/**
 * Select only models whose legacy identity is explicitly named by the
 * canonical packages. Unrelated/custom AW139 or S-76 models are never
 * inactivated merely because their code is absent from the new curriculum.
 */
export function selectSupersededPtoRev10Models(activeAircraftModels, projection) {
  const explicitLegacyCodes = new Set(
    Object.values(projection?.aeronaves || {}).flatMap((aircraft) =>
      (aircraft.sessoes || []).flatMap((session) => session.legacy_source_codes || []),
    ),
  );

  return activeAircraftModels
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
  if (!Array.isArray(tenantState.active_aircraft_models) || tenantState.active_aircraft_models.length === 0) {
    fail('snapshot sem catálogo ativo AW139/S-76');
  }
  const activeAircraftModels = tenantState.active_aircraft_models
    .map((row) => ({
      id: Number(row.id),
      codigo: String(row.codigo || '').trim(),
      codigo_canonico: String(row.codigo_canonico || row.codigo || '').trim(),
      modelo_aeronave: String(row.modelo_aeronave || row.tipo_aeronave || '')
        .trim()
        .toUpperCase()
        .replace('S76', 'SK76'),
      is_current_version: Number(row.is_current_version || 0) === 1,
    }))
    .filter((row) => row.modelo_aeronave === 'AW139' || row.modelo_aeronave === 'SK76')
    .sort((left, right) => left.id - right.id);
  if (
    activeAircraftModels.some(
      (row) => !Number.isInteger(row.id) || row.id <= 0 || !row.codigo || !row.codigo_canonico,
    )
  ) {
    fail('snapshot com modelo ativo inválido');
  }
  const supersededModels = selectSupersededPtoRev10Models(activeAircraftModels, projection);
  const catalogFingerprint = sha256(activeAircraftModels);

  const fingerprint = buildTenantFingerprint({
    empresaId,
    currentVersions: tenantState.current_versions,
    resolvedManoeuvres: tenantState.resolved_manoeuvres,
    links: tenantState.links,
    migrationState: tenantState.migration_state,
  }).fingerprint;

  const projectionItems = Object.values(projection.aeronaves).flatMap((aircraft) =>
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
  });
  const plan = sealPtoRev10Plan({ generated_at: generatedAt, ...payload });
  assertPtoRev10Plan(plan);
  return { plan, projection };
}

export function runCli(argv = process.argv) {
  const manifestPath = arg(argv, '--manifest');
  const aw139Dir = arg(argv, '--aw139-dir');
  const s76Dir = arg(argv, '--s76-dir');
  const tenantStatePath = arg(argv, '--tenant-state');
  const empresaId = Number(arg(argv, '--empresa-id'));
  const out = arg(argv, '--out');
  if (!manifestPath || !aw139Dir || !s76Dir || !tenantStatePath || !out) {
    fail(
      'uso: --manifest <json> --aw139-dir <dir> --s76-dir <dir> --tenant-state <json> --empresa-id <id> --out <plan.json>',
    );
  }

  const manifest = readJson(manifestPath, 'manifesto');
  const tenantState = readJson(tenantStatePath, 'snapshot tenant-scoped');
  const { plan } = preparePtoRev10Plan({
    manifest,
    aw139Dir,
    s76Dir,
    tenantState,
    empresaId,
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
