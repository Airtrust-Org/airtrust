import { describe, expect, it, vi } from 'vitest';
import {
  classifyTrainingLmsContract,
  assertTrainingComplianceAutoEnrollmentContract,
  inspectTrainingComplianceLmsContracts,
} from '../../services/training-compliance-lms-contract';

const row = (extra: Record<string, unknown> = {}) => ({
  categoria: 'EAD', auto_matricular_ead: 1, modalidade_requerida: 'EAD',
  published_courses: 1, ...extra,
});

describe('Compliance ↔ LMS rule contract', () => {
  it('distinguishes missing, unpublished and ambiguous courses without guessing by title', () => {
    expect(classifyTrainingLmsContract(row({ published_courses: 0 }))).toBe('NO_PUBLISHED_COURSE');
    expect(classifyTrainingLmsContract(row({ published_courses: 2 }))).toBe('MULTIPLE_PUBLISHED_COURSES');
    expect(classifyTrainingLmsContract(row({ auto_matricular_ead: 0 }))).toBe('EAD_OPT_OUT');
    expect(classifyTrainingLmsContract(row({ modalidade_requerida: null }))).toBe('INVALID_AUTO_CONFIGURATION');
    expect(classifyTrainingLmsContract(row({ categoria: 'Treinamentos Operacionais', auto_matricular_ead: 0 }))).toBe('NON_EAD');
    expect(classifyTrainingLmsContract(row({ categoria: 'Treinamentos Operacionais' }))).toBe('INVALID_AUTO_CONFIGURATION');
    expect(classifyTrainingLmsContract(row())).toBe('EAD_READY');
  });
  const fakeDb = (category: string | null, count: number) => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => {
          calls.push({ sql, params });
          return {
            first: async () => category === null ? null : { categoria: category },
            all: async () => ({ results: Array.from({ length: count }, (_, id) => ({ id: id + 1 })) }),
          };
        },
      }),
    };
    return { db: db as unknown as D1Database, calls };
  };
  it('never consults the database when the rule opted out', async () => {
    const { db, calls } = fakeDb('EAD', 1);
    await assertTrainingComplianceAutoEnrollmentContract(db, 6, 201, 0, null);
    expect(calls).toEqual([]);
  });
  it('rejects contradictory opt-in without explicit EAD modality', async () => {
    const { db, calls } = fakeDb('EAD', 1);
    await expect(assertTrainingComplianceAutoEnrollmentContract(db, 6, 201, 1, null))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(calls).toEqual([]);
  });
  it('requires an eligible qualification in the same tenant', async () => {
    const { db, calls } = fakeDb(null, 1);
    await expect(assertTrainingComplianceAutoEnrollmentContract(db, 6, 201, 1, 'EAD')).rejects.toThrow();
    expect(calls[0].params).toEqual([6, 201]);
  });
  it('rejects manual qualification even if it has a course', async () => {
    const { db, calls } = fakeDb('Treinamentos Operacionais', 1);
    await expect(assertTrainingComplianceAutoEnrollmentContract(db, 6, 205, 1, 'EAD')).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
  it.each([0, 2])('fails closed for %i published mappings', async (count) => {
    const { db, calls } = fakeDb('EAD', count);
    await expect(assertTrainingComplianceAutoEnrollmentContract(db, 6, 201, 1, 'EAD')).rejects.toThrow();
    expect(calls[1].params).toEqual([6, 201]);
    expect(calls[1].sql).toMatch(/publicado=1/);
  });
  it('accepts exactly one published same-tenant mapping', async () => {
    const { db, calls } = fakeDb('EAD', 1);
    await expect(assertTrainingComplianceAutoEnrollmentContract(db, 6, 201, 1, 'EAD')).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });
  it('classifies all tenant rows without exposing employees, and keeps opt-outs non-alerting', async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (empresaId: number) => {
          expect(empresaId).toBe(6);
          expect(sql).toMatch(/tr\.empresa_id=\?/);
          return {
            all: async () => ({
              results: [
                { id: 104, qualificacao_tipo_id: 45, condicao_id: null, escopo: 'FUNCIONARIO', unpublished_courses: 0, ...row({ published_courses: 0 }) },
                { id: 677, qualificacao_tipo_id: 189, condicao_id: null, escopo: 'FUNCAO', unpublished_courses: 1, ...row({ published_courses: 0 }) },
                { id: 1, qualificacao_tipo_id: 19, condicao_id: null, escopo: 'FUNCAO', unpublished_courses: 0, ...row({ auto_matricular_ead: 0 }) },
              ],
            }),
          };
        },
      }),
    } as unknown as D1Database;
    const report = await inspectTrainingComplianceLmsContracts(db, 6);
    expect(report.total_rules).toBe(3);
    expect(report.summary.NO_PUBLISHED_COURSE).toBe(2);
    expect(report.summary.EAD_OPT_OUT).toBe(1);
    expect(report.alerts).toHaveLength(2);
    expect(JSON.stringify(report)).not.toMatch(/funcionario_id|nome|email/);
  });
});
