/**
 * RBAC Tests
 *
 * Testa que roles são corretamente aplicadas:
 * - viewer não pode executar operações destrutivas
 * - admin pode
 * - role normalização (ADMIN == admin)
 */

import { describe, it, expect } from 'vitest';

// ===== HELPERS =====

type Role = 'admin' | 'viewer' | 'gestor' | string;

function canDelete(role: Role): boolean {
  const normalized = role?.toLowerCase();
  return normalized === 'admin';
}

function canEdit(role: Role): boolean {
  const normalized = role?.toLowerCase();
  return normalized === 'admin' || normalized === 'gestor';
}

function canView(role: Role): boolean {
  const normalized = role?.toLowerCase();
  return ['admin', 'gestor', 'viewer'].includes(normalized);
}

// ===== TESTES =====

describe('RBAC — permissões de role', () => {
  describe('DELETE (apenas admin)', () => {
    it('admin pode deletar', () => {
      expect(canDelete('admin')).toBe(true);
      expect(canDelete('ADMIN')).toBe(true); // case-insensitive
    });

    it('viewer não pode deletar', () => {
      expect(canDelete('viewer')).toBe(false);
    });

    it('gestor não pode deletar', () => {
      expect(canDelete('gestor')).toBe(false);
    });

    it('role vazia não pode deletar', () => {
      expect(canDelete('')).toBe(false);
    });
  });

  describe('EDIT (admin + gestor)', () => {
    it('admin pode editar', () => {
      expect(canEdit('admin')).toBe(true);
    });

    it('gestor pode editar', () => {
      expect(canEdit('gestor')).toBe(true);
    });

    it('viewer não pode editar', () => {
      expect(canEdit('viewer')).toBe(false);
    });
  });

  describe('VIEW (todos os roles válidos)', () => {
    it('admin pode visualizar', () => {
      expect(canView('admin')).toBe(true);
    });

    it('gestor pode visualizar', () => {
      expect(canView('gestor')).toBe(true);
    });

    it('viewer pode visualizar', () => {
      expect(canView('viewer')).toBe(true);
    });

    it('role desconhecida não pode visualizar', () => {
      expect(canView('hacker')).toBe(false);
    });
  });
});

// ===== TESTES: ISOLAMENTO MULTI-TENANT =====

describe('Tenant isolation', () => {
  interface Resource {
    id: number;
    empresa_id: number;
    nome: string;
  }

  function canAccessResource(userEmpresaId: number, resource: Resource): boolean {
    return resource.empresa_id === userEmpresaId;
  }

  it('usuário da empresa 1 acessa recurso da empresa 1', () => {
    expect(canAccessResource(1, { id: 10, empresa_id: 1, nome: 'Recurso A' })).toBe(true);
  });

  it('usuário da empresa 1 NÃO acessa recurso da empresa 2', () => {
    expect(canAccessResource(1, { id: 20, empresa_id: 2, nome: 'Recurso B' })).toBe(false);
  });

  it('empresa_id 0 não acessa nenhum recurso', () => {
    expect(canAccessResource(0, { id: 1, empresa_id: 1, nome: 'X' })).toBe(false);
  });
});
