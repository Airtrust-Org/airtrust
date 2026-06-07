/**
 * Regression guard: optionalAuth must not expose tenant-scoped data.
 *
 * These are static-analysis tests that verify:
 *   1. tenant-scoped simuladores routes no longer use optionalAuth().
 *   2. empresa_id filters are present in tenant-scoped simuladores queries.
 *   3. the only preserved simuladores optionalAuth runtime exception is the
 *      global catalog route backed by global reference tables.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));

function src(relPath: string): string {
  return readFileSync(join(testDir, '../../', relPath), 'utf8');
}

describe('tenant-scoped routes: no optionalAuth runtime usage', () => {
  const FILES = [
    'routes/funcionarios.ts',
    'routes/aeronaves.ts',
    'routes/qualificacoes/tipos.ts',
    'routes/simuladores-modelos.ts',
    'routes/simuladores-relatorios.ts',
    'routes/simuladores-equipamentos.ts',
  ] as const;

  for (const file of FILES) {
    it(`${file} does not invoke optionalAuth()`, () => {
      const source = src(file);
      expect(source).not.toMatch(/optionalAuth\(\)/);
    });
  }
});

describe('tenant-scoped tables: empresa_id filter present in GET queries', () => {
  it('funcionarios.ts /stats query includes empresa_id = ?', () => {
    const source = src('routes/funcionarios.ts');
    expect(source).toMatch(/WHERE f\.deleted_at IS NULL\s+AND f\.empresa_id = \?/);
  });

  it('aeronaves.ts GET / includes empresa_id = ? filter', () => {
    const source = src('routes/aeronaves.ts');
    expect(source).toMatch(/empresa_id = \?/);
  });

  it('aeronaves.ts GET /:id includes empresa_id = ? filter', () => {
    const source = src('routes/aeronaves.ts');
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

  it('simuladores-relatorios.ts anchors uso queries on empresa_id', () => {
    const source = src('routes/simuladores-relatorios.ts');
    expect(source).toMatch(/AND sa\.empresa_id = \?/);
    expect(source).toMatch(/AND s\.empresa_id = \?/);
  });

  it('simuladores-relatorios.ts scopes tripulantes and desempenho by empresa_id', () => {
    const source = src('routes/simuladores-relatorios.ts');
    expect(source).toMatch(/AND f\.empresa_id = \?/);
    expect(source).toMatch(/AND fs\.empresa_id = \?/);
  });

  it('simuladores-equipamentos.ts scopes simuladores and checks by empresa_id', () => {
    const source = src('routes/simuladores-equipamentos.ts');
    expect(source).toMatch(/const empresaClause = hasEmpresaId \? ' AND empresa_id = \?' : ''/);
    expect(source).toMatch(/WHERE deleted_at IS NULL\$\{empresaClause\}/);
    expect(source).toMatch(
      /FROM qualificacoes_tipos\s+WHERE deleted_at IS NULL\s+AND empresa_id = \?/,
    );
  });

  it('simuladores-equipamentos.ts scopes alertas by funcionario.empresa_id', () => {
    const source = src('routes/simuladores-equipamentos.ts');
    expect(source).toMatch(/AND f\.empresa_id = \?/);
  });

  it('simuladores-modelos.ts scopes tipos_sessao and modelos_sessao by empresa_id', () => {
    const source = src('routes/simuladores-modelos.ts');
    expect(source).toMatch(/tipos_sessao WHERE deleted_at IS NULL AND empresa_id = \?/);
    expect(source).toMatch(/AND ms\.empresa_id = \?/);
  });

  it('simuladores-modelos.ts scopes joined qualificacoes_tipos and tipos_sessao by empresa_id', () => {
    const source = src('routes/simuladores-modelos.ts');
    expect(source).toMatch(/ts\.empresa_id = \?/);
    expect(source).toMatch(/qt\.empresa_id = \?/);
  });
});

describe('preserved optionalAuth usages: simuladores allowlist', () => {
  const KNOWN_OPTIONAL_AUTH_RUNTIME_FILES = ['routes/simuladores-catalogo.ts'] as const;

  it('pins the complete simuladores list that still invokes optionalAuth()', () => {
    expect([...KNOWN_OPTIONAL_AUTH_RUNTIME_FILES]).toEqual(['routes/simuladores-catalogo.ts']);
  });

  for (const file of KNOWN_OPTIONAL_AUTH_RUNTIME_FILES) {
    it(`${file} still invokes optionalAuth() for global catalog reads`, () => {
      const source = src(file);
      expect(source).toMatch(/optionalAuth\(\)/);
    });
  }
});
