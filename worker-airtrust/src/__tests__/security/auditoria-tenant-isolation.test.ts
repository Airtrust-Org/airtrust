/**
 * Tenant isolation guard for auditoria routes.
 *
 * These static-analysis tests verify that both auditoria endpoints always
 * scope their SQL queries to the current tenant (empresa_id).  Regression
 * from SEC-01 (CRITICAL cross-tenant leak fixed 2026-06-04) is caught here
 * before it reaches a code review.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const auditoriaPath = join(testDir, '../../routes/auditoria.ts');


describe('auditoria routes — tenant isolation (SEC-01)', () => {
  describe('routes/auditoria.ts', () => {
    let source: string;
    it('loads source', () => {
      source = readFileSync(auditoriaPath, 'utf8');
      expect(source.length).toBeGreaterThan(0);
    });

    it('imports getTenantContext', () => {
      source = readFileSync(auditoriaPath, 'utf8');
      expect(source).toMatch(/getTenantContext/);
    });

    it('extracts empresaId from tenant context', () => {
      source = readFileSync(auditoriaPath, 'utf8');
      expect(source).toMatch(/getTenantContext\s*\(\s*c\s*\)/);
      expect(source).toMatch(/empresaId/);
    });

    it('scopes funcionarios query with empresa_id', () => {
      source = readFileSync(auditoriaPath, 'utf8');
      expect(source).toMatch(/FROM funcionarios f[\s\S]*?empresa_id\s*=\s*\?/);
    });

    it('scopes qualificacoes_tipos query with empresa_id', () => {
      source = readFileSync(auditoriaPath, 'utf8');
      expect(source).toMatch(/FROM qualificacoes_tipos qt[\s\S]*?empresa_id\s*=\s*\?/);
    });

    it('scopes qualificacoes_historico queries with empresa_id via funcionarios', () => {
      source = readFileSync(auditoriaPath, 'utf8');
      // All historico queries must reference empresa_id (either direct or via EXISTS/JOIN)
      const historicoQueryCount = (source.match(/FROM qualificacoes_historico/g) || []).length;
      const empresaIdInHistoricoContext = (source.match(/empresa_id\s*=\s*\?/g) || []).length;
      // At minimum: funcionarios(1), qualificacoes_tipos(1), plus historico references
      expect(historicoQueryCount).toBeGreaterThanOrEqual(3);
      expect(empresaIdInHistoricoContext).toBeGreaterThanOrEqual(historicoQueryCount + 1);
    });
  });

});
