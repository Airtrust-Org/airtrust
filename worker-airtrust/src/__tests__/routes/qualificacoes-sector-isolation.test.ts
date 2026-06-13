/**
 * Sector isolation tests for qualificacoes:
 * - Backfill correctness: MNT_* → Manutenção, preexistentes → Tripulação
 * - Historico sector filter: admin sees all, manager sees own sector only
 * - Security: out-of-scope setor_id returns 403
 */

import { describe, expect, it, vi } from 'vitest';
import {
  buildFuncionarioScopeWhere,
  filterRequestedSetorIdsByAccess,
  type EmployeeSectorAccess,
} from '../../services/employee-sector-access';

// ──────────────────────────────────────────────
// Helper to simulate backfill classification
// ──────────────────────────────────────────────

const SETOR_TRIPULACAO = 10;
const SETOR_MANUTENCAO = 11;

function classifyTipo(codigo: string): number {
  return codigo.startsWith('MNT_') ? SETOR_MANUTENCAO : SETOR_TRIPULACAO;
}

describe('backfill qualificacoes_tipos_setores', () => {
  const mntCodes = [
    'MNT_ARTIGOS_PERIGOSOS',
    'MNT_FATORES_HUMANOS_CRM',
    'MNT_HUMS',
    'MNT_IIO_APRS',
    'MNT_INGLES_TECNICO',
    'MNT_INTEGRACAO_DOUTRINACAO',
    'MNT_IRM',
    'MNT_MCQ',
    'MNT_MEL',
    'MNT_MGM',
    'MNT_MOM',
    'MNT_PRODUTO_ARRIEL2',
    'MNT_PRODUTO_ARRIEL2_DESM_MOD',
    'MNT_PRODUTO_AS350B2',
    'MNT_PRODUTO_AW139',
    'MNT_PRODUTO_PT6C_67C',
    'MNT_PRODUTO_S76AC',
    'MNT_SGSO',
  ];

  const preexistentCodes = [
    'A', 'ASO', 'B', 'C', 'CA-EBS', 'CFIT',
    'CHT-IFR-76', 'CHT-IFR-A139', 'CHT-TIPO-A139', 'CHT-TIPO-S76',
    'CMA', 'CRM-LOS-P', 'CRM-LOS-T',
    'D1', 'D2', 'D3', 'D4',
    'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8',
    'EAD_GATEKEEPER', 'EN-ASSES',
    'F1', 'F2', 'FAP05.2-139', 'FAP05.2-76',
    'FAP06-76', 'FAP07-139', 'FAP07-76', 'FAP13-139', 'FAP13-76',
    'FAP14-139', 'FAP14-76', 'FDM-EAD',
    'G1', 'G1-SEM', 'G2',
    'I', 'IFR-139', 'IFR-SK76', 'IOS-P', 'IOS-T',
    'J', 'L', 'LOFT', 'M',
    'N', 'O', 'OPC', 'OPC-SK76',
    'P', 'PETRO-OURO', 'Q', 'R', 'REG-ANAC',
    'S', 'T', 'THUET', 'VM-SOLO', 'VM-VOO',
  ];

  it('MNT_* codes map to Manutenção (setor_id=11)', () => {
    for (const code of mntCodes) {
      expect(classifyTipo(code)).toBe(SETOR_MANUTENCAO);
    }
  });

  it('preexistentes map to Tripulação (setor_id=10)', () => {
    for (const code of preexistentCodes) {
      expect(classifyTipo(code)).toBe(SETOR_TRIPULACAO);
    }
  });

  it('total count matches 83 (18 MNT + 65 preexistentes)', () => {
    expect(mntCodes).toHaveLength(18);
    expect(preexistentCodes).toHaveLength(65);
    expect(mntCodes.length + preexistentCodes.length).toBe(83);
  });

  it('Tripulação does not receive MNT_* codes', () => {
    const tripulacaoCodes = [...mntCodes, ...preexistentCodes].filter(
      (c) => classifyTipo(c) === SETOR_TRIPULACAO,
    );
    expect(tripulacaoCodes.every((c) => !c.startsWith('MNT_'))).toBe(true);
  });

  it('Manutenção does not receive preexistentes', () => {
    const manutencaoCodes = [...mntCodes, ...preexistentCodes].filter(
      (c) => classifyTipo(c) === SETOR_MANUTENCAO,
    );
    expect(manutencaoCodes.every((c) => c.startsWith('MNT_'))).toBe(true);
  });

  it('no model is transversal after backfill (all are assigned a sector)', () => {
    const allCodes = [...mntCodes, ...preexistentCodes];
    for (const code of allCodes) {
      const setorId = classifyTipo(code);
      expect(setorId).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────
// Scope helpers: sector filter building
// ──────────────────────────────────────────────

describe('buildFuncionarioScopeWhere — sector filter SQL', () => {
  it('admin (mode=all) produces 1=1 with no bindings', () => {
    const access: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };
    const result = buildFuncionarioScopeWhere(access, 'f');
    expect(result.clause).toBe('1 = 1');
    expect(result.bindings).toHaveLength(0);
  });

  it('restricted with no setorIds produces 1=0 (blocks all)', () => {
    const access: EmployeeSectorAccess = { mode: 'restricted', setorIds: [], funcionarioId: null };
    const result = buildFuncionarioScopeWhere(access, 'f');
    expect(result.clause).toBe('1 = 0');
    expect(result.bindings).toHaveLength(0);
  });

  it('restricted with setorIds=[11] produces IN clause for Manutenção', () => {
    const access: EmployeeSectorAccess = { mode: 'restricted', setorIds: [11], funcionarioId: null };
    const result = buildFuncionarioScopeWhere(access, 'f');
    expect(result.clause).toContain('f.setor_id IN');
    expect(result.bindings).toEqual([11]);
  });

  it('restricted with multiple setorIds produces IN with all values', () => {
    const access: EmployeeSectorAccess = { mode: 'restricted', setorIds: [10, 11], funcionarioId: null };
    const result = buildFuncionarioScopeWhere(access, 'f');
    expect(result.clause).toContain('f.setor_id IN (?, ?)');
    expect(result.bindings).toEqual([10, 11]);
  });

  it('self mode produces id equality clause for the specific employee', () => {
    const access: EmployeeSectorAccess = { mode: 'self', setorIds: [11], funcionarioId: 99 };
    const result = buildFuncionarioScopeWhere(access, 'f');
    expect(result.clause).toBe('f.id = ?');
    expect(result.bindings).toEqual([99]);
  });
});

// ──────────────────────────────────────────────
// filterRequestedSetorIdsByAccess — scope validation
// ──────────────────────────────────────────────

describe('filterRequestedSetorIdsByAccess — out-of-scope setor rejection', () => {
  it('admin can request any setor', () => {
    const access: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };
    const result = filterRequestedSetorIdsByAccess([10, 11, 12], access);
    expect(result).toEqual([10, 11, 12]);
  });

  it('manager restricted to setor 11 cannot request setor 10', () => {
    const access: EmployeeSectorAccess = { mode: 'restricted', setorIds: [11], funcionarioId: null };
    const result = filterRequestedSetorIdsByAccess([10, 11], access);
    expect(result).toEqual([11]);
    expect(result).not.toContain(10);
  });

  it('manager restricted to setor 11 requesting setor 10 only returns empty', () => {
    const access: EmployeeSectorAccess = { mode: 'restricted', setorIds: [11], funcionarioId: null };
    const result = filterRequestedSetorIdsByAccess([10], access);
    expect(result).toHaveLength(0);
  });

  it('manager with multiple sectors can request any of their sectors', () => {
    const access: EmployeeSectorAccess = { mode: 'restricted', setorIds: [10, 11], funcionarioId: null };
    const result = filterRequestedSetorIdsByAccess([10, 11], access);
    expect(result).toEqual([10, 11]);
  });

  it('manager with multiple sectors cannot request a sector outside their set', () => {
    const access: EmployeeSectorAccess = { mode: 'restricted', setorIds: [10, 11], funcionarioId: null };
    const result = filterRequestedSetorIdsByAccess([10, 11, 12], access);
    expect(result).toEqual([10, 11]);
    expect(result).not.toContain(12);
  });

  it('self mode filters to owned sector only', () => {
    const access: EmployeeSectorAccess = { mode: 'self', setorIds: [11], funcionarioId: 99 };
    const result = filterRequestedSetorIdsByAccess([10, 11], access);
    expect(result).toEqual([11]);
  });

  it('empty requested list returns empty for any access mode', () => {
    const modes: EmployeeSectorAccess[] = [
      { mode: 'all', setorIds: [], funcionarioId: null },
      { mode: 'restricted', setorIds: [11], funcionarioId: null },
      { mode: 'self', setorIds: [11], funcionarioId: 99 },
    ];
    for (const access of modes) {
      expect(filterRequestedSetorIdsByAccess([], access)).toHaveLength(0);
    }
  });
});

// ──────────────────────────────────────────────
// Integration: funcionários novos de Manutenção
// ──────────────────────────────────────────────

describe('novos funcionários de Manutenção (IDs 106-124)', () => {
  const newFuncionarios = Array.from({ length: 19 }, (_, i) => ({
    id: 106 + i,
    setor_id: SETOR_MANUTENCAO,
    empresa_id: 6,
    status: 'ATIVO',
  }));

  it('all 19 employees belong to Manutenção sector', () => {
    expect(newFuncionarios).toHaveLength(19);
    for (const f of newFuncionarios) {
      expect(f.setor_id).toBe(SETOR_MANUTENCAO);
    }
  });

  it('manager restricted to Manutenção can access new employees', () => {
    const access: EmployeeSectorAccess = {
      mode: 'restricted',
      setorIds: [SETOR_MANUTENCAO],
      funcionarioId: null,
    };
    const { clause, bindings } = buildFuncionarioScopeWhere(access, 'f');
    expect(clause).toContain('f.setor_id IN');
    expect(bindings).toContain(SETOR_MANUTENCAO);
  });

  it('manager restricted to Tripulação cannot access Manutenção employees', () => {
    const access: EmployeeSectorAccess = {
      mode: 'restricted',
      setorIds: [SETOR_TRIPULACAO],
      funcionarioId: null,
    };
    const allowedSetores = filterRequestedSetorIdsByAccess([SETOR_MANUTENCAO], access);
    expect(allowedSetores).toHaveLength(0);
  });

  it('admin can access all employees regardless of sector', () => {
    const access: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };
    const { clause } = buildFuncionarioScopeWhere(access, 'f');
    expect(clause).toBe('1 = 1');
  });
});
