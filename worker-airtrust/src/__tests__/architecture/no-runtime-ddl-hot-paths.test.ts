import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_PATTERNS = [
  /\bCREATE TABLE\b/i,
  /\bCREATE INDEX\b/i,
  /\bALTER TABLE\b/i,
  /\bDROP TABLE\b/i,
  /\bensure[A-Za-z0-9_]*(?:Schema|Table|Column)\s*\(/,
];

const HOT_PATH_FILES = [
  ['routes/alertas.ts', join(testDir, '../../routes/alertas.ts')],
  ['routes/escalas-preferencias.ts', join(testDir, '../../routes/escalas-preferencias.ts')],
  ['routes/frms-fira.ts', join(testDir, '../../routes/frms-fira.ts')],
  ['routes/matriz-treinamento.ts', join(testDir, '../../routes/matriz-treinamento.ts')],
  ['routes/notificacoes-convocacao.ts', join(testDir, '../../routes/notificacoes-convocacao.ts')],
  ['routes/preferencias.ts', join(testDir, '../../routes/preferencias.ts')],
  ['routes/integracoes_sigvoos.ts', join(testDir, '../../routes/integracoes_sigvoos.ts')],
  ['routes/qualificacoes/historico-helpers.ts', join(testDir, '../../routes/qualificacoes/historico-helpers.ts')],
  ['routes/qualificacoes/tipos.ts', join(testDir, '../../routes/qualificacoes/tipos.ts')],
  ['routes/simuladores-modelos.ts', join(testDir, '../../routes/simuladores-modelos.ts')],
  ['services/sigvoos-frms.ts', join(testDir, '../../services/sigvoos-frms.ts')],
  ['routes/treinamentos-planejados.ts', join(testDir, '../../routes/treinamentos-planejados.ts')],
  [
    'services/treinamentos-planejados-integration.ts',
    join(testDir, '../../services/treinamentos-planejados-integration.ts'),
  ],
  ['utils/alert-whatsapp-templates-store.ts', join(testDir, '../../utils/alert-whatsapp-templates-store.ts')],
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
      const source = readFileSync(ref, 'utf8');

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
// - qualificacoes/shared.ts: "ALTER TABLE" appears only inside a JSDoc comment (no-op, R09 RESOLVED).
const KNOWN_DDL_FILES = new Set([
  'routes/admin-manual-migrations.ts',
  'routes/migrations.ts',
  'routes/qualificacoes/shared.ts',
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

const srcRoot = join(testDir, '../..');

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
      'routes/admin-manual-migrations.ts',
      'routes/migrations.ts',
      'routes/qualificacoes/shared.ts',
    ]);
  });
});
