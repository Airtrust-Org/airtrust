import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const mocks = vi.hoisted(() => ({ loadPrivate: vi.fn(), readiness: vi.fn() }));
vi.mock('../../services/lms-native-content-loader', () => ({
  loadNativePrivateCourse: mocks.loadPrivate,
}));
vi.mock('../../services/lms-native-readiness-repository', () => ({
  readNativeCanonicalReadiness: mocks.readiness,
}));
import { preflightNativeCanonicalCompletion } from '../../services/lms-native-canonical-completion-preflight';

const sha = 'a'.repeat(64);
const accepted = {
  id: 101, curso_id: 31, funcionario_id: 51,
  ciclo_id: 1001, status: 'EM_ANDAMENTO',
  artifact_sha256: sha, titulo: 'Curso Native',
  gerar_qualificacao_ao_concluir: 1,
  qualificacao_tipo_id: 99, qualificacao_codigo: 'EAD',
  qualificacao_nome: 'Treinamento EAD', qualificacao_categoria: 'EAD',
  qualificacao_validade: 12, qualificacao_historico_id: null,
};
function make(row: unknown = accepted) {
  const reads: Array<{ sql: string; binds: unknown[] }> = [];
  const first = vi.fn(async () => row);
  const prepare = vi.fn((sql: string) => ({
    bind: (...binds: unknown[]) => {
      reads.push({ sql, binds });
      return { first };
    },
  }));
  const env = { DB: { prepare } as unknown as D1Database,
    BUCKET: {} as R2Bucket, ENVIRONMENT: 'staging',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: '6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS: '6',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6' } as Env;
  const call = (overrides: Record<string, unknown> = {}) =>
    preflightNativeCanonicalCompletion({
      env, empresaId: 6, matriculaId: 101, actorUserId: 900, ...overrides,
    });
  return { call, env, prepare, reads };
}

describe('Native canonical completion: read-only preflight, never certificate authority', () => {
  beforeEach(() => {
    mocks.loadPrivate.mockReset().mockResolvedValue({
      artifact: { schema: 'AIRTRUST_NATIVE_COURSE_V1' },
      editionHash: sha, cicloId: 1001, cursoId: 31, mode: 'LEARN',
    });
    mocks.readiness.mockReset().mockResolvedValue({
      readyForCanonicalCompletion: true, reason: 'READY',
    });
  });
  it('requires real private course and server-verified persisted readiness', async () => {
    const f=make();
    await expect(f.call()).resolves.toMatchObject({
      ready: true, canonical: {
        empresaId: 6, matriculaId: 101, cicloId: 1001,
        cursoId: 31, funcionarioId: 51, gerarQualificacaoAoConcluir: true,
      },
    });
    expect(mocks.loadPrivate).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, actorUserId: 900, matriculaId: 101,
    }));
    expect(mocks.readiness).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 900, scope: {
        empresaId: 6, matriculaId: 101, cursoId: 31,
        cicloId: 1001, artifactHash: sha,
      },
    }));
    expect(f.reads[0].binds).toEqual([900,sha,101,6,31]);
    expect(f.reads[0].sql).toContain('a.empresa_id=c.empresa_id');
    expect(f.reads[0].sql).toContain('cy.status=m.status');
    expect(f.reads[0].sql).toContain("m.status='EM_ANDAMENTO'");
    expect(f.reads[0].sql).toContain('qt.empresa_id=c.empresa_id');
    expect(f.reads.every(x => x.sql.startsWith('SELECT'))).toBe(true);
  });
  it('never reads qualification metadata when lesson/assessment evidence is missing', async () => {
    mocks.readiness.mockResolvedValueOnce({
      readyForCanonicalCompletion: false, reason: 'ASSESSMENT_EVIDENCE_MISSING',
    });
    const f=make();
    await expect(f.call()).resolves.toEqual({
      ready: false, reason: 'ASSESSMENT_EVIDENCE_MISSING',
    });
    expect(f.prepare).not.toHaveBeenCalled();
  });
  it('rechecks the same verified edition and current employee cycle after evidence passes', async () => {
    for (const change of [
      { curso_id: 32 }, { ciclo_id: 1002 },
      { artifact_sha256: 'b'.repeat(64) }, { funcionario_id: 0 },
      { status: 'CONCLUIDO' },
    ]) {
      const f=make({ ...accepted, ...change });
      await expect(f.call()).resolves.toEqual({
        ready: false, reason: 'COURSE_OR_CYCLE_CHANGED',
      });
    }
  });
  it('refuses to claim ready for unmapped qualification type or code', async () => {
    for (const change of [
      { qualificacao_tipo_id: null }, { qualificacao_codigo: null, qualificacao_nome: null },
      { gerar_qualificacao_ao_concluir: 2 },
    ]) {
      const f=make({ ...accepted, ...change });
      await expect(f.call()).resolves.toEqual({
        ready: false, reason: 'QUALIFICATION_MAPPING_INCOMPLETE',
      });
    }
  });
  it('allows a non-qualification course without inventing a history record', async () => {
    const f=make({ ...accepted, qualificacao_tipo_id: null,
      qualificacao_codigo: null, gerar_qualificacao_ao_concluir: 0 });
    await expect(f.call()).resolves.toMatchObject({
      ready: true, canonical: {
        gerarQualificacaoAoConcluir: false, qualificacaoTipoId: null,
        existingHistoricoId: null,
      },
    });
  });
  it('never touches D1 or R2 if production or exact tenant Native staging gate is closed', async () => {
    const f=make();
    f.env.ENVIRONMENT = 'production';
    await expect(f.call()).rejects.toThrow('NATIVE_COMPLETION_PREFLIGHT_NOT_ENABLED');
    expect(mocks.loadPrivate).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    f.env.ENVIRONMENT = 'staging';
    f.env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS = '60';
    await expect(f.call()).rejects.toThrow('NATIVE_COMPLETION_PREFLIGHT_NOT_ENABLED');
    expect(mocks.loadPrivate).not.toHaveBeenCalled();
  });
  it('refuses invalid identities without D1 or R2 access', async () => {
    const f=make();
    await expect(f.call({ empresaId: 0 })).rejects.toThrow('NATIVE_COMPLETION_INVALID_CONTEXT');
    expect(mocks.loadPrivate).not.toHaveBeenCalled();
  });
});
