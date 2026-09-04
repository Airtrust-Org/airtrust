#!/usr/bin/env node
/**
 * Merge the trusted provenance-guard output and the Playwright QA summary into
 * one sanitized JSON blob for the workflow artifact + step summary.
 *
 * Sanitization contract: only an allowlist of primitive fields is ever emitted.
 * No secrets, tokens, headers, cookies, emails or free-form strings pass through.
 *
 * PER-CELL MATRIX (BLOCKER G/I): the QA matrix is 6 explicit cells
 *   desktop_light desktop_dark
 *   mobile_390_light mobile_390_dark
 *   mobile_375_light mobile_375_dark
 * Each cell carries its OWN status (PASS | FAIL | BLOCKED | NOT_RUN). A single
 * PASS cell can no longer mask a cell that never exercised the surface, and one
 * cell can never overwrite another. Legacy aggregate fields (documents, …) are
 * DERIVED from matrix_cells here — never mutated cell-by-cell.
 *
 * MANDATORY A11Y GATE (BLOCKER H): `a11y_status` (PASS | FAIL | BLOCKED |
 * NOT_RUN) must be PASS for a global PASS. BLOCKED / NOT_RUN => global BLOCKED,
 * FAIL => global FAIL.
 *
 * AUTHENTICATION EVIDENCE IS FAIL-CLOSED (BLOCKER J): `authentication` is read
 * from the QA summary as-is — a missing/non-string/empty value is emitted as
 * `''`, NEVER defaulted to "REAL_STAGING". Only the literal string
 * "REAL_STAGING" passes the gate; everything else (missing, empty, "MOCK", any
 * other value) is BLOCKED. The emitted field is the actually-validated value,
 * never a hard-coded literal.
 *
 * Status decision (audit_profile = "destructive-actions"):
 *   provenance not OK ............................ BLOCKED
 *   mutations_detected > 0 ...................... FAIL
 *   any matrix cell === FAIL .................... FAIL
 *   a11y_status === FAIL ....................... FAIL
 *   matrix_cells missing / not an object ....... BLOCKED
 *   any matrix cell !== PASS (BLOCKED/NOT_RUN) . BLOCKED
 *   a11y_status !== PASS ...................... BLOCKED
 *   worker env !== staging / auth !== real .... BLOCKED
 *   otherwise ................................. PASS
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const CELL_STATES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']);

export const MATRIX_CELL_KEYS = Object.freeze([
  'desktop_light',
  'desktop_dark',
  'mobile_390_light',
  'mobile_390_dark',
  'mobile_375_light',
  'mobile_375_dark',
]);

export const CLOSURE_SURFACE_KEYS = Object.freeze([
  'controle_voos_n03',
  'controle_voos_n06',
  'funcionarios_frms_n10',
  'escalas_n08',
  'qualificacoes_manobras_p0',
  'simuladores_p0',
  'configuracoes_p0',
  'lms_admin_p0',
  'evd_p0',
  'licencas_p0',
  'certificacoes_p0',
  'hospedagem_p0',
]);

/**
 * Normalize the raw per-cell matrix. Missing keys and unknown values fail
 * closed to BLOCKED. Returns { cells, matrixObjectPresent }.
 */
export function normalizeMatrixCells(raw) {
  const matrixObjectPresent = Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
  const cells = {};
  for (const key of MATRIX_CELL_KEYS) {
    const value = matrixObjectPresent ? raw[key] : undefined;
    cells[key] = CELL_STATES.has(value) ? value : 'BLOCKED';
  }
  return { cells, matrixObjectPresent };
}

export function normalizeA11yStatus(value) {
  if (value === undefined || value === null || value === '') return 'NOT_RUN';
  return CELL_STATES.has(value) ? value : 'BLOCKED';
}

export function normalizeClosureSurfaces(raw) {
  const closureObjectPresent = Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
  const surfaces = {};
  for (const key of CLOSURE_SURFACE_KEYS) {
    const value = closureObjectPresent ? raw[key] : undefined;
    surfaces[key] = CELL_STATES.has(value) ? value : 'BLOCKED';
  }
  return { surfaces, closureObjectPresent };
}

function deriveDocumentsAggregate(cells) {
  const values = MATRIX_CELL_KEYS.map((k) => cells[k]);
  if (values.every((v) => v === 'PASS')) return 'PASS';
  if (values.some((v) => v === 'FAIL')) return 'FAIL';
  return 'FIXTURE_NOT_AVAILABLE';
}

export function buildFinalSummary({ provenance, qa, prNumber, releaseSha, auditProfile }) {
  const p = provenance && typeof provenance === 'object' ? provenance : {};
  const q = qa && typeof qa === 'object' ? qa : {};
  const profile = auditProfile || q.audit_profile || 'destructive-actions';

  const mutations = Number.isFinite(q.mutations_detected) ? q.mutations_detected : 0;
  const realSurfaces = Number.isFinite(q.real_surfaces_exercised) ? q.real_surfaces_exercised : 0;
  const funcionarioFixture = String(
    q.funcionario_fixture ?? 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE',
  );

  const { cells, matrixObjectPresent } = normalizeMatrixCells(q.matrix_cells);
  const a11yStatus = normalizeA11yStatus(q.a11y_status);
  const closureRequired = profile === 'audit-closure';
  const { surfaces: closureSurfaces, closureObjectPresent } = normalizeClosureSurfaces(
    q.closure_surfaces,
  );

  const anyCellFail = MATRIX_CELL_KEYS.some((k) => cells[k] === 'FAIL');
  const everyCellPass = MATRIX_CELL_KEYS.every((k) => cells[k] === 'PASS');
  const anyClosureFail =
    closureRequired && CLOSURE_SURFACE_KEYS.some((k) => closureSurfaces[k] === 'FAIL');
  const everyClosurePass =
    !closureRequired || CLOSURE_SURFACE_KEYS.every((k) => closureSurfaces[k] === 'PASS');
  const workerEnvironment = String(p.worker?.environment ?? '');
  // BLOCKER J — absence of evidence must stay absence of evidence. Never
  // default a missing/non-string authentication field to REAL_STAGING.
  const authentication = typeof q.authentication === 'string' ? q.authentication : '';

  let status;
  if (p.status !== 'PROVENANCE_OK') {
    status = 'BLOCKED';
  } else if (mutations > 0) {
    status = 'FAIL';
  } else if (anyCellFail) {
    status = 'FAIL';
  } else if (a11yStatus === 'FAIL') {
    status = 'FAIL';
  } else if (anyClosureFail) {
    status = 'FAIL';
  } else if (!matrixObjectPresent) {
    status = 'BLOCKED';
  } else if (!everyCellPass) {
    // At least one cell is BLOCKED / NOT_RUN — never mask it behind a PASS cell.
    status = 'BLOCKED';
  } else if (a11yStatus !== 'PASS') {
    status = 'BLOCKED';
  } else if (closureRequired && !closureObjectPresent) {
    status = 'BLOCKED';
  } else if (!everyClosurePass) {
    status = 'BLOCKED';
  } else if (workerEnvironment !== 'staging') {
    status = 'BLOCKED';
  } else if (authentication !== 'REAL_STAGING') {
    status = 'BLOCKED';
  } else {
    status = 'PASS';
  }

  return {
    status,
    audit_profile: profile,
    pr_number: Number(prNumber ?? p.prNumber ?? q.pr_number ?? 0),
    release_sha: String(releaseSha ?? p.releaseSha ?? q.release_sha ?? ''),
    frontend_build_version: String(p.frontendBuildVersion ?? q.frontend_build_version ?? ''),
    worker_environment: workerEnvironment,
    worker_sha_match_required: false,
    // Emit the actually-validated value, never a hard-coded literal (BLOCKER J).
    authentication,
    datatable_runtime: String(
      q.datatable_runtime ?? 'DATATABLE_RUNTIME_NOT_APPLICABLE_NO_ACTIVE_CONSUMER',
    ),
    real_surfaces_exercised: realSurfaces,
    mutations_detected: mutations,
    funcionario_fixture: funcionarioFixture,
    matrix_cells: cells,
    a11y_status: a11yStatus,
    ...(closureRequired ? { closure_surfaces: closureSurfaces } : {}),
    // Derived aggregate — humans only, never a gate. every PASS => PASS,
    // any FAIL => FAIL, otherwise FIXTURE_NOT_AVAILABLE.
    documents: deriveDocumentsAggregate(cells),
  };
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const provenanceFile = process.env.PROVENANCE_JSON_PATH;
  const qaFile = process.env.QA_SUMMARY_PATH;
  const outFile = process.env.FINAL_SUMMARY_PATH;
  if (!outFile) throw new Error('FINAL_SUMMARY_PATH is required');

  const summary = buildFinalSummary({
    provenance: provenanceFile ? readJsonOrNull(provenanceFile) : null,
    qa: qaFile ? readJsonOrNull(qaFile) : null,
    prNumber: process.env.PR_NUMBER,
    releaseSha: process.env.RELEASE_SHA,
    auditProfile: process.env.AUDIT_PROFILE,
  });

  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
