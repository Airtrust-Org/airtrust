#!/usr/bin/env node

// source_reference: compatibility runner for the governed staging 0438 validation.
// It executes the canonical run-controle-voos-e2e.mjs after applying one exact,
// fail-closed in-memory patch to the stale post-devolution RDV correction step.
// Product code is never modified. The patch is necessary because the current
// PUT /voos/:id/rdv contract requires `versao` for an existing RDV and bumps
// cv_rdv_operacional.versao through CAS.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'run-controle-voos-e2e.mjs');

const startMarker = "  // ── 17. Corrigir (piloto reedita apos devolucao, status volta a rascunho) ──";
const endMarker = "  await call({\n    operation: 'refinalizar_preenchimento_rdv'";

const replacement = `  // ── 17. Corrigir (piloto reedita apos devolucao, status volta a rascunho) ──\n  // Contrato atual: PUT de RDV existente exige CAS numerico via \\`versao\\` e\n  // incrementa cv_rdv_operacional.versao quando a escrita e aplicada.\n  const correction = await call({\n    operation: 'corrigir_apos_devolucao',\n    method: 'PUT',\n    path: \\`/api/controle-voos/voos/\\${vooId}/rdv\\`,\n    actor: adminA,\n    tenant: 'A',\n    expectedStatus: 200,\n    body: { versao: rdvVersao, ocorrencias: 'Corrigido apos devolucao (E2E)' },\n  });\n  if (!correction.passed) return finish(manifest, false);\n  rdvVersao = correction.json?.data?.versao ?? rdvVersao + 1;\n\n`;

function fail(message) {
  process.stderr.write(`[e2e-cv-cas-v2] ${message}\n`);
  process.exit(1);
}

const manifestPath = process.argv[2];
if (!manifestPath) fail('Uso: run-controle-voos-e2e-cas-v2.mjs <manifest.json>');

const source = readFileSync(sourcePath, 'utf8');
const start = source.indexOf(startMarker);
if (start < 0) fail('START_MARKER_NOT_FOUND: canonical E2E changed; review compatibility patch.');
const end = source.indexOf(endMarker, start);
if (end < 0) fail('END_MARKER_NOT_FOUND: canonical E2E changed; review compatibility patch.');
if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
  fail('START_MARKER_NOT_UNIQUE');
}

const staleSlice = source.slice(start, end);
if (!staleSlice.includes("body: { ocorrencias: 'Corrigido apos devolucao (E2E)' }")) {
  fail('STALE_CORRECTION_SHAPE_CHANGED: refuse to patch unknown source.');
}
if (staleSlice.includes('body: { versao: rdvVersao')) {
  fail('CANONICAL_SOURCE_ALREADY_CAS_AWARE: remove compatibility runner and call canonical E2E directly.');
}

const patched = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
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
