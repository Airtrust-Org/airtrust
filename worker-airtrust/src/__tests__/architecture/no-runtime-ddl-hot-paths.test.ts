import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_PATTERNS = [
  /\bCREATE TABLE\b/i,
  /\bCREATE INDEX\b/i,
  /\bALTER TABLE\b/i,
  /\bDROP TABLE\b/i,
  /\bensure[A-Za-z0-9_]*(?:Schema|Table|Column)\s*\(/,
];

const HOT_PATH_FILES = [
  ['routes/alertas.ts', new URL('../../routes/alertas.ts', import.meta.url)],
  ['routes/escalas-preferencias.ts', new URL('../../routes/escalas-preferencias.ts', import.meta.url)],
  ['routes/frms-fira.ts', new URL('../../routes/frms-fira.ts', import.meta.url)],
  ['routes/matriz-treinamento.ts', new URL('../../routes/matriz-treinamento.ts', import.meta.url)],
  ['routes/notificacoes-convocacao.ts', new URL('../../routes/notificacoes-convocacao.ts', import.meta.url)],
  ['routes/preferencias.ts', new URL('../../routes/preferencias.ts', import.meta.url)],
  ['routes/integracoes_sigvoos.ts', new URL('../../routes/integracoes_sigvoos.ts', import.meta.url)],
  ['routes/qualificacoes/historico-helpers.ts', new URL('../../routes/qualificacoes/historico-helpers.ts', import.meta.url)],
  ['routes/qualificacoes/tipos.ts', new URL('../../routes/qualificacoes/tipos.ts', import.meta.url)],
  ['routes/simuladores-modelos.ts', new URL('../../routes/simuladores-modelos.ts', import.meta.url)],
  ['services/sigvoos-frms.ts', new URL('../../services/sigvoos-frms.ts', import.meta.url)],
  ['routes/treinamentos-planejados.ts', new URL('../../routes/treinamentos-planejados.ts', import.meta.url)],
  [
    'services/treinamentos-planejados-integration.ts',
    new URL('../../services/treinamentos-planejados-integration.ts', import.meta.url),
  ],
  ['utils/alert-whatsapp-templates-store.ts', new URL('../../utils/alert-whatsapp-templates-store.ts', import.meta.url)],
] as const;

// historico.ts and historico-write.ts call ensureHistoricoSchema(db) (a no-op
// stub from historico-helpers.ts:131 since R09). The call-site pattern matches
// the ensure*Schema guard regex; these are safe no-op invocations.
//
// R04 (api-bootstrap.ts ensureDocumentosTableExists) — RESOLVED 2026-06-03.
// Removed from runtime: auto-migration-documentos.ts deleted, api-bootstrap.ts
// no longer calls DDL; schema is canonical via migration 0388.
//
// R09 (shared.ts ensureHistoricoSchema) — RESOLVED 2026-06-03.
// The ALTER TABLE was removed from shared.ts. Migration 0200 intentionally
// removed local + modalidade; renovada is present in the final schema.
// shared.ts is dead code (not imported); the active path uses historico-helpers.ts.
const DOCUMENTED_EXCEPTIONS = [
  'routes/qualificacoes/historico.ts',
  'routes/qualificacoes/historico-write.ts',
] as const;

describe('runtime DDL hardening', () => {
  it('keeps the deferred runtime-DDL allowlist explicit', () => {
    expect([...DOCUMENTED_EXCEPTIONS]).toEqual([
      'routes/qualificacoes/historico.ts',
      'routes/qualificacoes/historico-write.ts',
    ]);
  });

  for (const [label, ref] of HOT_PATH_FILES) {
    it(`blocks runtime DDL in ${label}`, () => {
      const source = readFileSync(fileURLToPath(ref), 'utf8');

      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Broad runtime DDL guard — scans ALL src/ (excluding __tests__).
// Files that intentionally contain DDL must appear in KNOWN_DDL_FILES below.
// Each entry requires justification. New entries force a code-review decision.
// ─────────────────────────────────────────────────────────────────────────────

// Files with DDL that are explicitly accounted for.
// - admin-manual-migrations.ts / migrations.ts: historical one-off migration runners,
//   gated by ENABLE_MANUAL_MIGRATIONS; never run unless explicitly enabled in .dev.vars.
// - admin-migrate.ts / admin-migration.ts: dead code — not imported or mounted in index.ts.
// - qualificacoes/shared.ts: "ALTER TABLE" appears only inside a JSDoc comment (no-op, R09 RESOLVED).
// - admin-apply-migration.ts: dead code — not mounted; uses db.exec() with arbitrary request SQL.
const KNOWN_DDL_FILES = new Set([
  'routes/admin-manual-migrations.ts',
  'routes/admin-migrate.ts',
  'routes/admin-migration.ts',
  'routes/migrations.ts',
  'routes/qualificacoes/shared.ts',
  'routes/admin-apply-migration.ts',
]);

const BROAD_DDL_PATTERNS = [
  /\bCREATE TABLE\b/i,
  /\bCREATE INDEX\b/i,
  /\bALTER TABLE\b/i,
  /\bDROP TABLE\b/i,
];

function listAllRuntimeSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === '__tests__') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listAllRuntimeSourceFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const srcRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('broad runtime DDL guard', () => {
  it('scans every runtime source file and rejects DDL outside the known-files allowlist', () => {
    const allFiles = listAllRuntimeSourceFiles(srcRoot);
    const violations: string[] = [];

    for (const file of allFiles) {
      const rel = file.startsWith(srcRoot) ? file.slice(srcRoot.length) : file;
      const relNorm = rel.replace(/\\/g, '/').replace(/^\//, '');

      if (KNOWN_DDL_FILES.has(relNorm)) continue;

      const source = readFileSync(file, 'utf8');
      for (const pattern of BROAD_DDL_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${relNorm}: matched ${pattern}`);
          break;
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('pins the known-DDL-files allowlist — changes here require explicit justification', () => {
    expect([...KNOWN_DDL_FILES].sort()).toEqual([
      'routes/admin-apply-migration.ts',
      'routes/admin-manual-migrations.ts',
      'routes/admin-migrate.ts',
      'routes/admin-migration.ts',
      'routes/migrations.ts',
      'routes/qualificacoes/shared.ts',
    ]);
  });
});
