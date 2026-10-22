/**
 * BOA API-level local proof: Hono HTTP request/response + real domain SQL
 * against an ephemeral in-memory SQLite database. NOT actual JWT authentication,
 * Cloudflare staging, approved scientific governance or real BOA information.
 *
 * source_reference: docs/frms/BOA_CBMMG_AUDITORIA_FUNCIONAL_CIENTIFICA_CADEIA_DADOS_20261021.md
 * operational_decision: validate actual HTTP resource boundaries across simulated
 *   role/tenant context, not only direct calls to database service functions.
 * dry_run_required: test-only tenant 130, fictitious identities, localhost Request;
 *   all INSERT/UPDATE writes confined to SQLite :memory:, no network calls.
 * rollback_plan_required: sqlite.close() destroys the complete temporary fixture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Only authorization middleware's upstream populated context, the regulator's
 * external approval and authorized crew list are synthetic stubs here. Hono
 * route handlers, RBAC guards, check-in, cases, monthly aggregation and SQLite
 * statements all execute from the actual application source code.
 */
const stubs = {
  'parameter-governance': 