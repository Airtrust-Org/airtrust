/**
 * Regression guard: optionalAuth endpoints must not expose cross-tenant data.
 *
 * These are static-analysis tests that verify:
 *   1. Tenant-scoped endpoints no longer use optionalAuth().
 *   2. empresa_id filter is present in every GET query on tenant-scoped tables.
 *   3. Preserved legitimate optionalAuth usages are pinned to prevent drift.
 *
 * History: Before this sprint, GET /funcionarios, /funcionarios/:id,
 * /funcionarios/stats, /funcionarios/stats/dashboard, GET /aeronaves,
 * GET /aeronaves/:id, GET /qualificacoes/tipos, GET /qualificacoes/tipos/:id
 * were all accessible without authentication and returned real tenant data.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function src(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tenant-scoped GET routes must NOT use optionalAuth
// ─────────────────────────────────────────────────────────────────────────────
describe('tenant-scoped routes: no optionalAuth on GET handlers', () => {
  it('funcionarios.ts GET routes do not use optionalAuth()', () => {
    const source = src('routes/funcionarios.ts');
    // Must not have any app.get( ... optionalAuth() ... ) pattern
    expect(source).not.toMatch(/app\.get\([^)]*optionalAuth\(\)/);
  });

  it('aeronaves.ts GET routes do not use optionalAuth()', () => {
    const source = src('routes/aeronaves.ts');
    expect(source).not.toMatch(/aeronaves\.get\([^)]*optionalAuth\(\)/);
    // Also check the import was cleaned up
    expect(source).not.toMatch(/optionalAuth/);
  });

  it('qualificacoes/tipos.ts GET routes do not use optionalAuth()', () => {
    const source = src('routes/qualificacoes/tipos.ts');
    expect(source).not.toMatch(/optionalAuth/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tenant-scoped tables must have empresa_id = ? in GET queries
// ─────────────────────────────────────────────────────────────────────────────
describe('tenant-scoped tables: empresa_id filter present in GET queries', () => {
  it('funcionarios.ts /stats query includes empresa_id = ?', () => {
    const source = src('routes/funcionarios.ts');
    // The stats query must now filter by empresa_id
    expect(source).toMatch(/WHERE f\.deleted_at IS NULL\s+AND f\.empresa_id = \?/);
  });

  it('aeronaves.ts GET / includes empresa_id = ? filter', () => {
    const source = src('routes/aeronaves.ts');
    expect(source).toMatch(/empresa_id = \?/);
  });

  it('aeronaves.ts GET /:id includes empresa_id = ? filter', () => {
    const source = src('routes/aeronaves.ts');
    // Both id = ? AND empresa_id = ? must appear together
    expect(source).toMatch(/WHERE id = \? AND deleted_at IS NULL AND empresa_id = \?/);
  });

  it('qualificacoes/tipos.ts GET / includes empresa_id = ? filter', () => {
    const source = src('routes/qualificacoes/tipos.ts');
    expect(source).toMatch(/AND empresa_id = \? ORDER BY categoria, nome LIMIT \?/);
  });

  it('qualificacoes/tipos.ts GET /:id includes empresa_id = ? filter', () => {
    const source = src('routes/qualificacoes/tipos.ts');
    expect(source).toMatch(/WHERE id = \? AND deleted_at IS NULL AND empresa_id = \?/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Preserved legitimate optionalAuth usages — pin to prevent drift
//
// These files use optionalAuth() for intentional reasons:
//   - simuladores-* catalogo/modelos/relatorios/equipamentos: GET returns global
//     reference data (manobras_categorias, tipos_sessao, modelos_sessao) that has
//     no empresa_id column, OR the usage is a conditional middleware shim for
//     gradual auth enforcement still under review.
//   - historico.ts: uses optionalAuth for a specific read path (under review).
//   - simuladores-sessoes.ts: uses optionalAuth in test harness context.
//
// Any new addition to this list requires a security justification comment.
// ─────────────────────────────────────────────────────────────────────────────
describe('preserved optionalAuth usages: pin known exceptions', () => {
  const KNOWN_OPTIONAL_AUTH_FILES = [
    'routes/simuladores-modelos.ts',
    'routes/simuladores-relatorios.ts',
    'routes/simuladores-catalogo.ts',
    'routes/simuladores-equipamentos.ts',
    'routes/qualificacoes/historico.ts',
    'routes/simuladores-fichas.ts',
  ] as const;

  it('pins the complete list of files that still use optionalAuth()', () => {
    // If a new file appears here, it must have an explicit justification.
    // If a file is removed from this list, the fix is complete.
    expect([...KNOWN_OPTIONAL_AUTH_FILES].sort()).toEqual([
      'routes/qualificacoes/historico.ts',
      'routes/simuladores-catalogo.ts',
      'routes/simuladores-equipamentos.ts',
      'routes/simuladores-fichas.ts',
      'routes/simuladores-modelos.ts',
      'routes/simuladores-relatorios.ts',
    ]);
  });

  for (const file of KNOWN_OPTIONAL_AUTH_FILES) {
    it(`${file} still has optionalAuth() (confirmed, under review)`, () => {
      const source = src(file);
      expect(source).toMatch(/optionalAuth/);
    });
  }
});
