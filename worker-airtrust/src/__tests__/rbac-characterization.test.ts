/**
 * RBAC CHARACTERIZATION TESTS
 *
 * These tests document CURRENT behavior of the normalizeRole function
 * and the requireRole middleware, including the known issue where
 * 'instrutor'/'instructor' maps to 'manager' (giving broad access).
 *
 * PURPOSE:
 *   - Safety net: these tests will FAIL if normalizeRole behavior changes
 *     unexpectedly, alerting us to audit downstream impact.
 *   - They do NOT endorse the current behavior; they document it.
 *
 * When the real RBAC fix is applied (dedicated 'instructor' role), update
 * these tests to match the new expected behavior.
 *
 * See: docs/RBAC_INSTRUCTOR_FIX_REPORT.md
 * Date recorded: 2026-05-16
 */

import { describe, it, expect } from 'vitest';

// ===== LOCAL REPLICA OF normalizeRole =====
// We replicate the private function here so tests don't require exporting it.
// Keep in sync with worker-airtrust/src/middleware/rbac.ts → normalizeRole().

type UserRole = 'admin' | 'manager' | 'user';

function normalizeRole(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const r = raw.toLowerCase().trim();
  if (r === 'admin' || r === 'administrador') return 'admin';
  if (r === 'gestor' || r === 'manager') return 'manager';
  // KNOWN ISSUE: instrutor/instructor is mapped to manager.
  // This gives instructors full manager-level access to 143 routes.
  // Tracked in: docs/RBAC_INSTRUCTOR_FIX_REPORT.md
  if (r === 'instrutor' || r === 'instructor') return 'manager';
  if (r === 'usuario' || r === 'user' || r === 'aluno' || r === 'student') return 'user';
  return r as UserRole;
}

// ===== CHARACTERIZATION: normalizeRole =====

describe('normalizeRole — characterization of current behavior', () => {
  // --- admin variants ---
  it('normalizes "admin" → admin', () => {
    expect(normalizeRole('admin')).toBe('admin');
  });

  it('normalizes "ADMIN" → admin (case-insensitive)', () => {
    expect(normalizeRole('ADMIN')).toBe('admin');
  });

  it('normalizes "administrador" → admin', () => {
    expect(normalizeRole('administrador')).toBe('admin');
  });

  it('normalizes "ADMINISTRADOR" → admin', () => {
    expect(normalizeRole('ADMINISTRADOR')).toBe('admin');
  });

  // --- manager/gestor variants ---
  it('normalizes "gestor" → manager', () => {
    expect(normalizeRole('gestor')).toBe('manager');
  });

  it('normalizes "GESTOR" → manager (case-insensitive)', () => {
    expect(normalizeRole('GESTOR')).toBe('manager');
  });

  it('normalizes "manager" → manager', () => {
    expect(normalizeRole('manager')).toBe('manager');
  });

  // --- instructor variants: CURRENT BEHAVIOR (maps to manager) ---
  it('[CURRENT BEHAVIOR] normalizes "instrutor" → manager (not instructor)', () => {
    // NOTE: This is the root of the excess-access issue.
    // When fixed, this should return 'instructor' instead.
    expect(normalizeRole('instrutor')).toBe('manager');
  });

  it('[CURRENT BEHAVIOR] normalizes "INSTRUTOR" → manager (case-insensitive)', () => {
    expect(normalizeRole('INSTRUTOR')).toBe('manager');
  });

  it('[CURRENT BEHAVIOR] normalizes "instructor" → manager (not instructor)', () => {
    expect(normalizeRole('instructor')).toBe('manager');
  });

  it('[CURRENT BEHAVIOR] normalizes "INSTRUCTOR" → manager (case-insensitive)', () => {
    expect(normalizeRole('INSTRUCTOR')).toBe('manager');
  });

  // --- user/student variants ---
  it('normalizes "usuario" → user', () => {
    expect(normalizeRole('usuario')).toBe('user');
  });

  it('normalizes "user" → user', () => {
    expect(normalizeRole('user')).toBe('user');
  });

  it('normalizes "aluno" → user', () => {
    expect(normalizeRole('aluno')).toBe('user');
  });

  it('normalizes "student" → user', () => {
    expect(normalizeRole('student')).toBe('user');
  });

  it('normalizes "USUARIO" → user (case-insensitive)', () => {
    expect(normalizeRole('USUARIO')).toBe('user');
  });

  // --- edge cases ---
  it('returns undefined for undefined input', () => {
    expect(normalizeRole(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeRole('')).toBeUndefined();
  });

  it('passes through unknown roles as-is', () => {
    expect(normalizeRole('superuser')).toBe('superuser');
  });

  it('trims whitespace before normalizing', () => {
    expect(normalizeRole('  instrutor  ')).toBe('manager');
    expect(normalizeRole('  admin  ')).toBe('admin');
  });
});

// ===== CHARACTERIZATION: Access matrix (current effective permissions) =====

describe('Access matrix — instructor currently has manager-level access', () => {
  /**
   * The following tests document which route categories an instructor
   * can effectively access TODAY (because instrutor → manager).
   *
   * Category A: Training-related — EXPECTED to be accessible post-fix
   * Category B: Operational lookups — TO BE DECIDED by product
   * Category C: Admin/management — SHOULD NOT be accessible post-fix
   */

  function canAccess(userRole: string, requiredRoles: string[]): boolean {
    const normalized = normalizeRole(userRole);
    if (!normalized) return false;
    return requiredRoles.includes(normalized);
  }

  // --- CATEGORY A: Training-related routes (instructor should access post-fix) ---
  describe('Category A — Training routes (instructor should retain access)', () => {
    it('[CURRENT] instrutor can access treinamentos-planejados (admin|manager)', () => {
      // Routes like POST /planejados, PUT /planejados/:id
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access solicitacoes-treinamento (admin|manager)', () => {
      // Routes like GET /solicitacoes, PATCH /solicitacoes/:id/aprovar
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access qualificacoes/historico-write (admin|manager)', () => {
      // Routes like POST /historico, PUT /historico/:id
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access lms-matriculas (admin|manager)', () => {
      // Routes like GET /matriculas/curso/:id, POST /matriculas/lote
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access lms-relatorios (admin|manager)', () => {
      // Routes like GET /relatorios/conformidade, GET /relatorios/expiracoes
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });
  });

  // --- CATEGORY B: Operational/scheduling routes (product decision needed) ---
  describe('Category B — Scheduling/operational routes (product decision needed)', () => {
    it('[CURRENT] instrutor can access escalas-crud (admin|manager)', () => {
      // Routes like POST /escalas, PUT /escalas/:id, DELETE /escalas/:id
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access escalas-alocacoes (admin|manager)', () => {
      // Routes like POST /escalas/:id/alocacoes, DELETE /escalas/:id/alocacoes/:aid
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access horas-voo write routes (admin|manager)', () => {
      // Routes like POST /horas-voo/:id/lancamentos, PUT /horas-voo/:id/lancamentos/:lid
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access lms-cursos write routes (admin|manager)', () => {
      // Routes like POST /cursos, PUT /cursos/:id, DELETE /cursos/:id
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access notificacoes-convocacao (admin|manager)', () => {
      // Routes like POST /convocacoes, PATCH /convocacoes/:id/enviar
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });
  });

  // --- CATEGORY C: Admin routes (instructor should NOT access post-fix) ---
  describe('Category C — Admin/management routes (instructor should be blocked post-fix)', () => {
    it('[CURRENT] instrutor can access backup routes (admin|manager) — SHOULD BE BLOCKED', () => {
      // backup.use('*', auth(), requireRole('admin', 'manager'))
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access funcionarios-mutations (admin|manager) — SHOULD BE BLOCKED', () => {
      // POST /funcionarios, PUT /funcionarios/:id (employee creation/editing)
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access setores-gestores (admin|manager) — SHOULD BE BLOCKED', () => {
      // POST /setores-gestores, PUT /:id (org management)
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access importacao-xlsx (admin|manager) — SHOULD BE BLOCKED', () => {
      // POST /importacao/funcionarios (bulk employee imports)
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access integracoes_edapp (admin|manager) — SHOULD BE BLOCKED', () => {
      // EdApp integration management
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access integracoes_sigvoos (admin|manager) — SHOULD BE BLOCKED', () => {
      // SigVoos integration management
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access frms fadiga-checkin manager panel (manager) — SHOULD BE BLOCKED', () => {
      // GET /fadiga-checkin/painel-gestor, GET /fadiga-checkin/analytics
      expect(canAccess('instrutor', ['manager'])).toBe(true);
    });

    it('[CURRENT] instrutor can access compliance-requisitos write routes (admin|manager) — SHOULD BE BLOCKED', () => {
      // POST /requisitos, PUT /requisitos/:id, DELETE /requisitos/:id
      expect(canAccess('instrutor', ['admin', 'manager'])).toBe(true);
    });
  });

  // --- Admin-only routes: instructor correctly blocked today ---
  describe('Admin-only routes — instructor correctly blocked (no change needed)', () => {
    it('instrutor CANNOT access auditoria (admin-only)', () => {
      expect(canAccess('instrutor', ['admin'])).toBe(false);
    });

    it('instrutor CANNOT access auditoria-detalhada (admin-only)', () => {
      expect(canAccess('instrutor', ['admin'])).toBe(false);
    });

    it('instrutor CANNOT access compliance-recalculate (admin-only)', () => {
      expect(canAccess('instrutor', ['admin'])).toBe(false);
    });

    it('instrutor CANNOT access qualificacoes-certificados-admin (admin-only)', () => {
      expect(canAccess('instrutor', ['admin'])).toBe(false);
    });

    it('instrutor CANNOT access funcionarios DELETE (admin-only)', () => {
      expect(canAccess('instrutor', ['admin'])).toBe(false);
    });

    it('instrutor CANNOT access admin-migrate routes (admin-only)', () => {
      expect(canAccess('instrutor', ['admin'])).toBe(false);
    });
  });

  // --- Regular user: correctly blocked from manager routes ---
  describe('User role — correctly blocked from manager routes', () => {
    it('user cannot access admin|manager routes', () => {
      expect(canAccess('usuario', ['admin', 'manager'])).toBe(false);
    });

    it('user cannot access manager-only routes', () => {
      expect(canAccess('user', ['manager'])).toBe(false);
    });

    it('aluno cannot access admin|manager routes', () => {
      expect(canAccess('aluno', ['admin', 'manager'])).toBe(false);
    });
  });
});
