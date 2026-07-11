/**
 * GUARDRAIL: Tenant SQL Static Analysis
 *
 * Varredura estática dos arquivos de rota para detectar queries em tabelas
 * tenant-scoped sem filtro de empresa_id.
 *
 * COMO USAR:
 *   npm run test:worker -- tenant-sql-static-guard
 *
 * Os testes que FALHAM indicam rotas com risco real de cross-tenant leak.
 * Corrija a rota (adicione empresa_id no WHERE ou via JOIN) e o teste passa.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROUTES_DIR = path.resolve(__dirname, '../../routes');

function readRouteFile(relPath: string): string {
  return fs.readFileSync(path.join(ROUTES_DIR, relPath), 'utf-8');
}

function allRouteFiles(): string[] {
  const result: string[] = [];
  function walk(dir: string, prefix = '') {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (fs.statSync(full).isDirectory()) {
        walk(full, rel);
      } else if (
        entry.endsWith('.ts') &&
        !entry.endsWith('.test.ts') &&
        !entry.includes('schema') &&
        !entry.includes('types')
      ) {
        result.push(rel);
      }
    }
  }
  walk(ROUTES_DIR);
  return result;
}

// ─── TABELAS TENANT-SCOPED CONHECIDAS ─────────────────────────────────────────
// Se uma rota faz SELECT/UPDATE/DELETE nessas tabelas, DEVE incluir empresa_id
// diretamente ou via JOIN a uma tabela que o faça.
const TENANT_SCOPED_TABLES = [
  'funcionarios',
  'qualificacoes_historico',
  'simulador_agendamentos',
  'fichas_sessao',
  'alertas_reforco',
  'frms_jornada',
  'frms_alerta',
  'escalas_mensais',
  'documentos',
  'licencas',
  'habilitacoes',
  'setores',
  'categorias',
  'aeronaves',
];

// Tabelas sem empresa_id (escopo via FK para tabela pai) — auditadas separadamente
const INDIRECT_TENANT_TABLES = [
  'historico_notas_manobras',
  'fichas_sessao_manobras',
  'qualificacoes_historico_reclass_queue',
];

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

function extractQueryBlocks(source: string): string[] {
  // Extract content between backtick strings that look like SQL
  const blocks: string[] = [];
  const re = /`([^`]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^`]*)`/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    blocks.push(m[1]);
  }
  // Also check single-quoted SQL strings
  const re2 = /'([^']*(?:SELECT|INSERT|UPDATE|DELETE|FROM)[^']*)'/gi;
  while ((m = re2.exec(source)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function hasTenantExtraction(source: string): boolean {
  return (
    /getTenantContext\s*\(/.test(source) ||
    /getEmpresaId\s*\(/.test(source) ||
    /getEmpresaIdSafe\s*\(/.test(source) ||
    /buildCourseSetorScope/.test(source) ||
    // Direct JWT read (less preferred but still validates via middleware)
    /c\.get\(['"]empresaId['"]\)/.test(source) ||
    /(c\s+as\s+any)\.get\(['"]empresaId['"]\)/.test(source)
  );
}

// ─── KNOWN VIOLATIONS (all fixed) ──────────────────────────────────────────────
// These were fixed in the tenant isolation hotfix:
//   simuladores-fichas-extras.ts — added getTenantContext + empresa_id to all queries
//   qualificacoes-reclass.ts       — added JOIN to funcionarios for empresa_id scope
//   simuladores-fichas-acoes.ts    — added empresa_id to fichas_sessao SELECT/UPDATE
const KNOWN_VIOLATIONS: Record<string, string> = {};

// ─── TEST: KNOWN VIOLATIONS MUST BE DOCUMENTED ────────────────────────────────

describe('Tenant SQL Guardrail — Known Violations Registry', () => {
  it('simuladores-fichas-extras.ts has cross-tenant risk on historico_notas_manobras', () => {
    const source = readRouteFile('simuladores-fichas-extras.ts');

    // This file must NOT yet call getTenantContext (it doesn't, confirming the gap)
    const hasTenant = hasTenantExtraction(source);

    // And it DOES query historico_notas_manobras by funcionario_id only
    const queriesNotas = source.includes('historico_notas_manobras');
    const hasEmpresaFilter =
      /historico_notas_manobras[^;]*empresa_id/.test(source) ||
      /empresa_id[^;]*historico_notas_manobras/.test(source);

    if (!hasTenant && queriesNotas && !hasEmpresaFilter) {
      // Guardrail FAILS — document the vulnerability clearly
      throw new Error(
        `[TENANT_UNSCOPED_CRITICAL] simuladores-fichas-extras.ts\n` +
          `  PROBLEM: ${KNOWN_VIOLATIONS['simuladores-fichas-extras.ts']}\n` +
          `  STATUS: NOT FIXED — hasTenantExtraction=${hasTenant}, queriesNotas=${queriesNotas}, hasEmpresaFilter=${hasEmpresaFilter}\n` +
          `  ACTION: Add getTenantContext(c) and JOIN funcionarios ON empresa_id before merging any PR that reads this file`,
      );
    }

    // If we reach here, the vulnerability has been fixed
    expect(hasTenant || hasEmpresaFilter).toBe(true);
  });

  it('qualificacoes-reclass.ts has cross-tenant risk on reclass_queue', () => {
    const source = readRouteFile('qualificacoes-reclass.ts');

    const hasTenant = hasTenantExtraction(source);
    const queriesQueue = source.includes('reclass_queue');
    const hasEmpresaFilter = /empresa_id/.test(source);

    if (!hasTenant && queriesQueue && !hasEmpresaFilter) {
      throw new Error(
        `[TENANT_UNSCOPED_CRITICAL] qualificacoes-reclass.ts\n` +
          `  PROBLEM: ${KNOWN_VIOLATIONS['qualificacoes-reclass.ts']}\n` +
          `  STATUS: NOT FIXED — hasTenantExtraction=${hasTenant}, queriesQueue=${queriesQueue}, hasEmpresaFilter=${hasEmpresaFilter}\n` +
          `  ACTION: Add getTenantContext(c) and JOIN empresa_id filter to all queue queries before merging`,
      );
    }

    expect(hasTenant || hasEmpresaFilter).toBe(true);
  });

  it('simuladores-fichas-acoes.ts assinar route validates ficha empresa ownership', () => {
    const source = readRouteFile('simuladores-fichas-acoes.ts');

    // fichas_sessao SELECT without empresa_id is the vulnerability
    const unscopedFichaSelect =
      /fichas_sessao WHERE id=\?[^A]/.test(source) ||
      /fichas_sessao WHERE id=\? AND deleted_at/.test(source);

    // empresa_id appears only for notification objects, not in the SELECT/UPDATE WHERE clause
    const fichaSelectHasEmpresa =
      /fichas_sessao WHERE id=\?.*empresa_id/.test(source) ||
      /fichas_sessao WHERE id=\?.*AND empresa_id/.test(source);

    if (unscopedFichaSelect && !fichaSelectHasEmpresa) {
      throw new Error(
        `[TENANT_RISK_NEEDS_REVIEW] simuladores-fichas-acoes.ts\n` +
          `  PROBLEM: ${KNOWN_VIOLATIONS['simuladores-fichas-acoes.ts']}\n` +
          `  STATUS: fichas_sessao is fetched by id only, no empresa_id boundary check\n` +
          `  ACTION: Change SELECT/UPDATE to include AND empresa_id = ? bound to getTenantContext(c).empresaId`,
      );
    }

    expect(fichaSelectHasEmpresa || !unscopedFichaSelect).toBe(true);
  });
});

// ─── TEST: REGRESSION GUARD FOR FUTURE ROUTES ─────────────────────────────────
// Prevents NEW routes from introducing the same patterns

describe('Tenant SQL Guardrail — Regression Prevention', () => {
  it('no route file queries fichas_sessao by id without empresa_id', () => {
    const violations: string[] = [];

    for (const rel of allRouteFiles()) {

      const source = readRouteFile(rel);
      // Pattern: fichas_sessao WHERE id=? without empresa_id in same statement
      if (
        /fichas_sessao WHERE id=\? AND deleted_at IS NULL'/.test(source) &&
        !source.includes('empresa_id')
      ) {
        violations.push(rel);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[TENANT_REGRESSION] New routes query fichas_sessao without empresa_id:\n` +
          violations.map((v) => `  - ${v}`).join('\n') +
          `\n  Add AND empresa_id = ? to fichas_sessao lookups`,
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('no new route file adds historico_notas_manobras queries without empresa JOIN', () => {
    const violations: string[] = [];

    for (const rel of allRouteFiles()) {

      const source = readRouteFile(rel);
      if (
        source.includes('historico_notas_manobras') &&
        !source.includes('empresa_id') &&
        !hasTenantExtraction(source)
      ) {
        violations.push(rel);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[TENANT_REGRESSION] New routes query historico_notas_manobras without tenant scope:\n` +
          violations.map((v) => `  - ${v}`).join('\n') +
          `\n  Add JOIN funcionarios ON empresa_id or add empresa_id column to the table`,
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('no new route file queries reclass_queue without empresa scope', () => {
    const violations: string[] = [];

    for (const rel of allRouteFiles()) {

      const source = readRouteFile(rel);
      if (source.includes('reclass_queue') && !source.includes('empresa_id')) {
        violations.push(rel);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[TENANT_REGRESSION] New routes query reclass_queue without empresa scope:\n` +
          violations.map((v) => `  - ${v}`).join('\n'),
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('route files with DB queries should extract empresa_id via approved patterns', () => {
    // Check NEW files (not in known violations) that have prepare() but no tenant extraction
    const violations: string[] = [];

    const knownOk = new Set([
      // Helper modules — receive empresa_id as function parameter from callers
      'escalas-alocacoes-engine.ts',
      'escalas-alocacoes-helpers-internal.ts',
      'integracoes-edapp-helpers.ts',
      'sgso-next-gen-helpers.ts',
      'qualificacoes-certificados-helpers.ts',
      'simuladores-shared.ts',
      'simuladores-shared-session-helpers.ts',
      'simuladores-shared-session-fichas.ts',
      'simuladores-fichas-helpers.ts',
      'qualificacoes/historico-helpers.ts',
      'qualificacoes/shared.ts',
      // Library/validation modules (no HTTP handlers)
      'qualificacoes/validacao.ts',
      'qualificacoes-certificados-admin.ts', // receives empresa via callers
      // Admin/platform-only (cross-tenant intentional)
      'migrations.ts',
      'admin-manual-migrations.ts',
      'admin-domain-events.ts',
      'admin-perfis.ts',
      'admin.ts',
      'backup.ts',
      'system.ts',
      // Public routes
      'public-routes.ts',
      'certificados/validacao.ts',
    ]);

    for (const rel of allRouteFiles()) {
      if (knownOk.has(rel)) continue;

      const source = readRouteFile(rel);
      const hasPrepare = source.includes('.prepare(');
      if (!hasPrepare) continue;

      if (!hasTenantExtraction(source) && !source.includes('empresa_id')) {
        violations.push(rel);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[TENANT_REGRESSION] Routes with DB queries but no empresa_id extraction:\n` +
          violations.map((v) => `  - ${v}`).join('\n') +
          `\n  Each route must call getTenantContext(c) or getEmpresaId(c) and apply empresa_id to queries`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ─── TEST: FIXES FROM 2026-07-08 AUDIT ────────────────────────────────────────
// Cross-tenant write vulnerabilities found during the full-backend tenant audit:
//   aeronaves.ts           — PUT/DELETE /:id updated aeronaves by id only
//   escalas-padroes.ts     — DELETE /:id soft-deleted padroes_escala by id only
//   escalas-restricoes.ts  — DELETE /:id soft-deleted restricoes_tripulacao by id only
// All three had correctly-scoped GET/POST in the same file, but the mutating
// endpoint was written without the empresa_id check. Fixed 2026-07-08.

describe('Tenant SQL Guardrail — 2026-07-08 Audit Fixes (Regression Prevention)', () => {
  it('aeronaves.ts PUT /:id scopes the UPDATE by empresa_id', () => {
    const source = readRouteFile('aeronaves.ts');
    expect(/UPDATE aeronaves SET \$\{fields\.join\(', '\)\} WHERE id = \? AND empresa_id = \?/.test(source)).toBe(
      true,
    );
  });

  it('aeronaves.ts DELETE /:id scopes the soft-delete by empresa_id', () => {
    const source = readRouteFile('aeronaves.ts');
    expect(
      /UPDATE aeronaves SET deleted_at = datetime\("now"\) WHERE id = \? AND empresa_id = \?/.test(
        source,
      ),
    ).toBe(true);
  });

  it('escalas-padroes.ts DELETE /:id scopes the soft-delete by empresa_id', () => {
    const source = readRouteFile('escalas-padroes.ts');
    expect(/WHERE id = \? AND empresa_id = \?/.test(source)).toBe(true);
  });

  it('escalas-restricoes.ts DELETE /:id scopes the soft-delete by empresa_id', () => {
    const source = readRouteFile('escalas-restricoes.ts');
    expect(/WHERE id = \? AND empresa_id = \?/.test(source)).toBe(true);
  });
});

// ─── TEST: INDIRECT TENANT TABLES COVERAGE ────────────────────────────────────

describe('Tenant SQL Guardrail — Schema Drift Prevention', () => {
  it('no route queries tables without empresa_id using empresa_id directly', () => {
    const driftViolations: string[] = [];

    // The tables known NOT to have empresa_id column:
    const tablesWithoutEmpresaId = [
      'simuladores',
      'sessoes_participantes',
      // 'fichas_sessao_manobras' removed 2026-07-10: migration 0150 added a
      // real, backfilled, indexed empresa_id column to this table
      // (idx_fichas_manobras_empresa) — direct usage is not schema drift.
      // It was previously masked here only because the query happened to
      // share a file with an unrelated PRAGMA table_info() call, which
      // blanket-exempts the whole file from this check (see hasPragmaInfo
      // below) — splitting the file into focused modules exposed the
      // pre-existing false positive.
      'historico_notas_manobras',
      'qualificacoes_historico_reclass_queue',
      'modelos_sessao_manobras',
    ];

    for (const rel of allRouteFiles()) {
      const source = readRouteFile(rel);
      const blocks = extractQueryBlocks(source);
      for (const block of blocks) {
        // Very basic conservative regex to catch direct usage
        // Fails if "table_name ... empresa_id" appear in the same block without PRAGMA check
        // We will allow it if PRAGMA table_info is used in the same file to conditionally add it
        const hasPragmaInfo = source.includes('PRAGMA table_info');
        if (hasPragmaInfo) continue;

        for (const table of tablesWithoutEmpresaId) {
          // If the block contains the table name AND 'empresa_id', it's a potential drift violation.
          // Note: If the query joins multiple tables and one of them DOES have empresa_id,
          // the SQL is valid, but only if they correctly prefix it (e.g. sa.empresa_id).
          // To be safe and conservative, we fail if the block has BOTH the table without empresa_id
          // AND an un-aliased or wrongly-aliased empresa_id.
          
          // Pattern 1: INSERT INTO <table_without_empresa_id> (... empresa_id ...)
          const insertRegex = new RegExp('INSERT INTO \\s*' + table + '\\s*\\([^)]*empresa_id', 'i');
          
          // Pattern 2: table_alias.empresa_id where table_alias is mapped to the table
          // e.g. FROM simuladores s ... s.empresa_id
          const directRegex = new RegExp(table + '\\s+(as\\s+)?([a-z0-9_]+)[^;]*\\\\2\\.empresa_id', 'i');

          if (insertRegex.test(block) || directRegex.test(block)) {
            driftViolations.push(rel + ': references empresa_id directly on ' + table);
          }
        }
      }
    }

    if (driftViolations.length > 0) {
      throw new Error(
        '[SCHEMA_DRIFT_CRITICAL] Tables without empresa_id are being queried using it directly:\\n' +
          driftViolations.map((v) => '  - ' + v).join('\\n') +
          '\\n  ACTION: Remove empresa_id from INSERTs, or use PRAGMA table_info to conditionally support it. Do not force tenant-scope on global tables.',
      );
    }

    expect(driftViolations).toHaveLength(0);
  });
});

