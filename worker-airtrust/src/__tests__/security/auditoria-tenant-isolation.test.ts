/**
 * Tenant isolation guard for auditoria routes.
 *
 * These static-analysis tests verify that both auditoria endpoints always
 * scope their SQL queries to the current tenant (empresa_id).  Regression
 * from SEC-01 (CRITICAL cross-tenant leak fixed 2026-06-04) is caught here
 * before it reaches a code review.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const auditoriaPath = fileURLToPath(new URL('../../routes/auditoria.ts', import.meta.url));
const auditoriaDetalhadaPath = fileURLToPath(
  new URL('../../routes/auditoria-detalhada.ts', import.meta.url),
);

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

  describe('routes/auditoria-detalhada.ts', () => {
    let source: string;

    it('imports getTenantContext', () => {
      source = readFileSync(auditoriaDetalhadaPath, 'utf8');
      expect(source).toMatch(/getTenantContext/);
    });

    it('extracts empresaId from tenant context', () => {
      source = readFileSync(auditoriaDetalhadaPath, 'utf8');
      expect(source).toMatch(/getTenantContext\s*\(\s*c\s*\)/);
      expect(source).toMatch(/empresaId/);
    });

    it('scopes all three JOIN queries with f.empresa_id', () => {
      source = readFileSync(auditoriaDetalhadaPath, 'utf8');
      // Each of the 3 queries joins funcionarios and must filter by empresa_id
      const joinCount = (source.match(/JOIN funcionarios f ON/g) || []).length;
      const empresaFilter = (source.match(/f\.empresa_id\s*=\s*\?/g) || []).length;
      expect(joinCount).toBeGreaterThanOrEqual(3);
      expect(empresaFilter).toBe(joinCount);
    });

    it('binds empresaId to all prepared queries', () => {
      source = readFileSync(auditoriaDetalhadaPath, 'utf8');
      // Three .bind(empresaId).all() calls
      const bindCount = (source.match(/\.bind\s*\(\s*empresaId\s*\)/g) || []).length;
      expect(bindCount).toBe(3);
    });
  });
});
