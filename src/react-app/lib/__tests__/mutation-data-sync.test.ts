import { describe, expect, it } from 'vitest';
import { dataChangeScopesForMutation } from '../apiFetch';
import { canApplyCrossTabDataChange } from '@/react-app/utils/data-sync';
import { shouldInvalidateQueryForDataChange } from '../query-client';

describe('tenant-aware mutation cache invalidation', () => {
  it('rejects cross-tab invalidation from a different or unresolved tenant', () => {
    expect(canApplyCrossTabDataChange(6, 6)).toBe(true);
    expect(canApplyCrossTabDataChange(6, 7)).toBe(false);
    expect(canApplyCrossTabDataChange(null, 6)).toBe(false);
    expect(canApplyCrossTabDataChange(6, null)).toBe(false);
  });

  it('routes supported mutations to affected domains', () => {
    expect(dataChangeScopesForMutation('/api/qualificacoes/123')).toEqual(['qualificacoes', 'compliance']);
    expect(dataChangeScopesForMutation('/api/funcionarios/99')).toContain('funcionarios');
    expect(dataChangeScopesForMutation('/api/lms-matriculas/42/status')).toContain('lms');
    expect(dataChangeScopesForMutation('/api/frms/checkin')).toEqual(['frms']);
  });

  it('does not invalidate on high-frequency SCORM progress commits', () => {
    expect(dataChangeScopesForMutation('/api/lms-matriculas/42/scorm/commit')).toEqual([]);
    expect(dataChangeScopesForMutation('/api/lms-matriculas/42/progresso')).toEqual([]);
  });

  it('does not invalidate auth or unrelated mutation paths', () => {
    expect(dataChangeScopesForMutation('/api/auth/refresh')).toEqual([]);
    expect(dataChangeScopesForMutation('/api/unknown/resource')).toEqual([]);
  });

  it('never invalidates query data for a different company or unscoped key', () => {
    expect(shouldInvalidateQueryForDataChange(['tenant', 7, 'qualificacoes'], 'qualificacoes', 6)).toBe(false);
    expect(shouldInvalidateQueryForDataChange(['qualificacoes'], 'qualificacoes', 6)).toBe(false);
    expect(shouldInvalidateQueryForDataChange(['tenant', 'pending', 'qualificacoes'], 'all', 6)).toBe(false);
  });

  it('invalidates matching domains of the active company only', () => {
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'qualificacoes', 22], 'qualificacoes', 6)).toBe(true);
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'dashboard'], 'funcionarios', 6)).toBe(true);
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'simuladores'], 'lms', 6)).toBe(false);
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'any'], 'all', 6)).toBe(true);
  });
});
