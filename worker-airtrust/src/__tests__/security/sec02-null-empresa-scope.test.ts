/**
 * SEC-02 regression guard: null empresa_id scope hardening.
 *
 * These tests are static-analysis checks that verify the insecure
 * `(empresa_id IS NULL OR empresa_id = ?)` pattern (and its variants)
 * does not reappear in the files that were hardened as part of this sprint.
 *
 * Preserved exceptions and their justification are documented in
 * docs/AIRTRUST_SEC02_TENANT_NULL_SCOPE_HARDENING_v0_5.md
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Pattern that was the source of the SEC-02 vulnerability.
// Matches:  (empresa_id IS NULL OR empresa_id = ?)
//           (f.empresa_id IS NULL OR f.empresa_id = ?)
// Does NOT match the safe optional-auth pattern: (? IS NULL OR empresa_id = ?)
const INSECURE_NULL_EMPRESA_PATTERN =
  /\(\s*(?:\w+\.)?empresa_id\s+IS\s+NULL\s+OR\s+(?:\w+\.)?empresa_id\s*=\s*\?/i;

// Triple-null variant: (? IS NULL OR f.empresa_id IS NULL OR f.empresa_id = ?)
const INSECURE_TRIPLE_NULL_PATTERN =
  /\(\s*\?\s+IS\s+NULL\s+OR\s+(?:\w+\.)?empresa_id\s+IS\s+NULL\s+OR\s+(?:\w+\.)?empresa_id\s*=\s*\?/i;

function src(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)), 'utf8');
}

describe('SEC-02: funcionario ownership checks use strict empresa_id = ?', () => {
  const FILES_HARDENED = [
    'routes/escalas-alocacoes.ts',
    'routes/escalas-alocacoes-helpers-internal.ts',
    'routes/escalas-evd.ts',
    'routes/escalas-situacoes.ts',
    'routes/frms-fadiga-acumulada.ts',
    'routes/escalas-pilotos.ts',
    'routes/escalas-cobertura.ts',
    'routes/sgso-next-gen-extra.ts',
    'shared/syncEscalaEventosExternos.ts',
  ] as const;

  for (const file of FILES_HARDENED) {
    it(`${file} contains no insecure null-empresa fallback`, () => {
      const source = src(file);
      expect(source).not.toMatch(INSECURE_NULL_EMPRESA_PATTERN);
    });
  }

  it('funcionarios.ts list filter uses strict empresa_id = ? (no IS NULL fallback)', () => {
    const source = src('routes/funcionarios.ts');
    // The main list WHERE builder must not contain the old leak pattern.
    expect(source).not.toMatch(
      /whereClausesQuery\.push\(.*empresa_id IS NULL/i,
    );
    expect(source).not.toMatch(
      /whereClausesCount\.push\(.*empresa_id IS NULL/i,
    );
  });

  it('funcionarios.ts does not use the insecure triple-null pattern', () => {
    const source = src('routes/funcionarios.ts');
    expect(source).not.toMatch(INSECURE_TRIPLE_NULL_PATTERN);
  });

  it('syncEscalaEventosExternos.ts keeps optional empresaId without null-empresa funcionario fallback', () => {
    const source = src('shared/syncEscalaEventosExternos.ts');
    expect(source).not.toMatch(INSECURE_TRIPLE_NULL_PATTERN);
    expect(source).toContain('AND (? IS NULL OR f.empresa_id = ?)');
  });

  it('escalas-tripulacoes.ts hardens operational aircraft and pilot ownership lookups', () => {
    const source = src('routes/escalas-tripulacoes.ts');
    expect(source).not.toMatch(
      /FROM\s+aeronaves[\s\S]{0,180}\(\s*empresa_id\s+IS\s+NULL\s+OR\s+empresa_id\s*=\s*\?\s*\)/i,
    );
    expect(source).not.toMatch(
      /FROM\s+funcionarios[\s\S]{0,180}\(\s*empresa_id\s+IS\s+NULL\s+OR\s+empresa_id\s*=\s*\?\s*\)/i,
    );
    expect(source).toMatch(
      /FROM\s+aeronaves[\s\S]{0,180}AND\s+empresa_id\s*=\s*\?[\s\S]{0,40}LIMIT\s+1/i,
    );
    expect(source).toMatch(
      /FROM\s+funcionarios[\s\S]{0,180}AND\s+empresa_id\s*=\s*\?[\s\S]{0,40}LIMIT\s+1/i,
    );
  });
});

describe('SEC-02: preserved intentional exceptions are explicitly documented', () => {
  // These files intentionally keep the NULL-empresa pattern.
  // Changes to this list require explicit review.
  const KNOWN_PRESERVED = [
    // Type 1 — JOIN fallback: LEFT JOIN funcionarios anchored by escala empresa_id
    'routes/escalas-crud.ts',
    'routes/escalas-calendario.ts',
    'routes/escalas-conflitos.ts',
    'routes/escalas-status.ts',
    'routes/escalas-templates.ts',
    'routes/escalas-tripulacoes.ts',
    'routes/escalas-exportacao.ts',
    'routes/escalas-eventos.ts',
    'routes/escalas-restricoes.ts',
    // Type 4 — global escala templates (padroes_escala table, empresa_id IS NULL = system-wide)
    'routes/escalas-padroes.ts',
    // Type 3 — intentional layered config system (global defaults + tenant overrides)
    'routes/integracoes-edapp-helpers.ts',
  ] as const;

  it('pins the list of files that intentionally keep null-empresa patterns', () => {
    expect([...KNOWN_PRESERVED].sort()).toEqual([
      'routes/escalas-calendario.ts',
      'routes/escalas-conflitos.ts',
      'routes/escalas-crud.ts',
      'routes/escalas-eventos.ts',
      'routes/escalas-exportacao.ts',
      'routes/escalas-padroes.ts',
      'routes/escalas-restricoes.ts',
      'routes/escalas-status.ts',
      'routes/escalas-templates.ts',
      'routes/escalas-tripulacoes.ts',
      'routes/integracoes-edapp-helpers.ts',
    ]);
  });
});
