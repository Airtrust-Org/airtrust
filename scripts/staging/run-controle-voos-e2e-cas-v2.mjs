#!/usr/bin/env node

// source_reference: compatibility runner for the governed staging 0438 validation.
// It executes the canonical run-controle-voos-e2e.mjs after applying exact,
// fail-closed in-memory patches for the current CAS contract and for explicit
// coordination-time etapa revision evidence. Product code is never modified.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'run-controle-voos-e2e.mjs');

const correctionStartMarker = "  // ── 17. Corrigir (piloto reedita apos devolucao, status volta a rascunho) ──";
const correctionEndMarker = "  await call({\n    operation: 'refinalizar_preenchimento_rdv'";
const etapaStartMarker = "  // ── 7. Criar etapa ───────────────────────────────────────────────────";
const etapaEndMarker = "  // ── 7.5 Criar setor + funcionario via cadastro CANONICO (Funcionarios) ──";
const reviewStartMarker = "  // ── 15. Iniciar revisao (coordenacao) ────────────────────────────────";
const reviewEndMarker = "  // ── 16. Devolver ──────────────────────────────────────────────────────";

const correctionReplacement = [
  '  // ── 17. Corrigir (piloto reedita apos devolucao, status volta a rascunho) ──',
  '  // Contrato atual: PUT de RDV existente exige CAS numerico via `versao` e',
  '  // incrementa cv_rdv_operacional.versao quando a escrita e aplicada.',
  '  const correction = await call({',
  "    operation: 'corrigir_apos_devolucao',",
  "    method: 'PUT',",
  '    path: `/api/controle-voos/voos/${vooId}/rdv`,',
  '    actor: adminA,',
  "    tenant: 'A',",
  '    expectedStatus: 200,',
  "    body: { versao: rdvVersao, ocorrencias: 'Corrigido apos devolucao (E2E)' },",
  '  });',
  '  if (!correction.passed) return finish(manifest, false);',
  '  rdvVersao = correction.json?.data?.versao ?? rdvVersao + 1;',
  '',
  '',
].join('\n');

const etapaReplacement = [
  '  // ── 7. Criar etapa ───────────────────────────────────────────────────',
  '  const { json: etapaJson, passed: etapaPassed } = await call({',
  "    operation: 'criar_etapa',",
  "    method: 'POST',",
  '    path: `/api/controle-voos/voos/${vooId}/etapas`,',
  '    actor: adminA,',
  "    tenant: 'A',",
  '    expectedStatus: 201,',
  '    body: {',
  '      versao: rdvVersao,',
  '      numero_etapa: 1,',
  "      origem_icao: 'OR' + 'A' + manifest.runId,",
  "      destino_icao: 'DE' + 'A' + manifest.runId,",
  '      horario_decolagem: `${dataProg}T10:05:00Z`,',
  '      horario_pouso: `${dataProg}T10:55:00Z`,',
  '      combustivel_inicio: 500,',
  '      combustivel_fim: 400,',
  '    },',
  '  });',
  '  if (!etapaPassed || !etapaJson?.data?.id) return finish(manifest, false);',
  '  const etapaId = etapaJson.data.id;',
  '  rdvVersao = etapaJson?.meta?.versao ?? rdvVersao + 1;',
  '',
  '',
].join('\n');

const reviewReplacement = [
  '  // ── 15. Iniciar revisao (coordenacao) ────────────────────────────────',
  '  const iniciarRevisao = await call({',
  "    operation: 'iniciar_revisao',",
  "    method: 'POST',",
  '    path: `/api/controle-voos/voos/${vooId}/rdv/iniciar-revisao`,',
  '    actor: coordA,',
  "    tenant: 'A',",
  '    expectedStatus: 200,',
  '    body: { versao: rdvVersao },',
  '  });',
  '  if (!iniciarRevisao.passed) return finish(manifest, false);',
  '  rdvVersao = iniciarRevisao.json?.data?.versao ?? rdvVersao + 1;',
  '',
  '  // Exercita explicitamente cv_rdv_revisoes: essa tabela registra diffs',
  '  // de etapa quando a coordenacao altera dados durante a revisao com',
  '  // justificativa. Criar uma etapa em rascunho, sozinho, nao gera revisao.',
  '  const etapaRevision = await call({',
  "    operation: 'editar_etapa_coordenacao_revisao',",
  "    method: 'PATCH',",
  '    path: `/api/controle-voos/voos/${vooId}/etapas/${etapaId}`,',
  '    actor: coordA,',
  "    tenant: 'A',",
  '    expectedStatus: 200,',
  '    body: {',
  '      versao: rdvVersao,',
  "      mode: 'coordenacao',",
  "      justificativa: 'Ajuste de combustivel durante revisao (E2E sintetico)',",
  '      combustivel_fim: 395,',
  '    },',
  '  });',
  '  if (!etapaRevision.passed) return finish(manifest, false);',
  '  rdvVersao = etapaRevision.json?.meta?.versao ?? etapaRevision.json?.data?.versao ?? rdvVersao + 1;',
  '',
  '',
].join('\n');

function fail(message) {
  process.stderr.write(`[e2e-cv-cas-v2] ${message}\n`);
  process.exit(1);
}

function replaceSlice(source, startMarker, endMarker, replacement, label, expectedFragment) {
  const start = source.indexOf(startMarker);
  if (start < 0) fail(`${label}_START_MARKER_NOT_FOUND`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) fail(`${label}_END_MARKER_NOT_FOUND`);
  if (source.indexOf(startMarker, start + startMarker.length) >= 0) fail(`${label}_START_MARKER_NOT_UNIQUE`);
  const staleSlice = source.slice(start, end);
  if (!staleSlice.includes(expectedFragment)) fail(`${label}_SHAPE_CHANGED`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const manifestPath = process.argv[2];
if (!manifestPath) fail('Uso: run-controle-voos-e2e-cas-v2.mjs <manifest.json>');

let patched = readFileSync(sourcePath, 'utf8');

const originalCorrectionSlice = patched.slice(
  patched.indexOf(correctionStartMarker),
  patched.indexOf(correctionEndMarker, patched.indexOf(correctionStartMarker)),
);
if (originalCorrectionSlice.includes('body: { versao: rdvVersao')) {
  fail('CANONICAL_SOURCE_ALREADY_CAS_AWARE: remove compatibility correction patch and call canonical E2E directly.');
}

patched = replaceSlice(
  patched,
  etapaStartMarker,
  etapaEndMarker,
  etapaReplacement,
  'ETAPA_CAPTURE',
  "operation: 'criar_etapa'",
);
patched = replaceSlice(
  patched,
  reviewStartMarker,
  reviewEndMarker,
  reviewReplacement,
  'ETAPA_REVISION',
  "operation: 'iniciar_revisao'",
);
patched = replaceSlice(
  patched,
  correctionStartMarker,
  correctionEndMarker,
  correctionReplacement,
  'CORRECTION',
  "body: { ocorrencias: 'Corrigido apos devolucao (E2E)' }",
);

const tempDir = mkdtempSync(join(tmpdir(), 'cv-e2e-cas-v2-'));
const tempPath = join(tempDir, 'run-controle-voos-e2e-cas-v2.generated.mjs');
writeFileSync(tempPath, patched, { mode: 0o700 });
chmodSync(tempPath, 0o700);

try {
  const child = spawnSync(process.execPath, [tempPath, manifestPath], {
    encoding: 'utf8',
    env: process.env,
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  if (child.error) fail(`CHILD_EXEC_FAILED:${child.error.message}`);
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.signal) fail(`CHILD_SIGNAL:${child.signal}`);
  process.exitCode = child.status ?? 1;
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
