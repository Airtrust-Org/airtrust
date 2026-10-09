import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { hasRoleMock } = vi.hoisted(() => ({ hasRoleMock: vi.fn(() => true) }));
vi.mock('../../middleware/rbac', () => ({ hasRole: hasRoleMock }));
import { enforceLmsEnrollmentIntegrity } from '../../middleware/lms-enrollment-integrity';

function setup(overrides: Record<string, unknown> = {}, total = 37) {
  const existing = {
    id: 842, curso_id: 119, funcionario_id: 77, status: 'EM_ANDAMENTO',
    deleted_at: null, qualificacao_historico_id: null,
    progresso_pct: 99, score_final: 100, data_inicio: '2026-10-07',
    data_conclusao: null, ...overrides,
  };
  const writes: Array<{ sql: string; bindings: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...bindings: unknown[]) => {
        const call = { sql, bindings };
        return {
          first: async () => {
            if (sql.includes('SELECT id, curso_id, funcionario_id, status')) return existing;
            if (sql.includes('SELECT c.tipo_conteudo, c.scorm_package_r2_prefix')) {
              return {
                tipo_conteudo: 'scorm',
                scorm_package_r2_prefix: 'lms/scorm/6/119/_candidates/current/',
                cmi_json: JSON.stringify({
                  'cmi.core.lesson_location': '41/41',
                  'airtrust.total_slides': 41,
                }),
              };
            }
            if (sql.includes('SELECT lesson_status, completion_status')) {
              return { lesson_status: 'passed', score_raw: 100, cmi_json: '{"legacy":"41/41"}' };
            }
            if (sql.includes('SELECT 1 AS ok')) return { ok: 1 };
            throw new Error(`Unhandled query: ${sql.slice(0, 80)}`);
          },
          run: async () => ({ meta: { changes: 1 } }),
          ...call,
        };
      },
    })),
    batch: vi.fn(async (statements: Array<{ sql: string; bindings: unknown[] }>) => {
      writes.push(...statements);
      return [];
    }),
  } as unknown as D1Database;
  const b = {
    get: vi.fn(async () => ({
      size: 300,
      text: async () => JSON.stringify({
        content: { requiredSlides: Array.from({ length: total }, (_, i) => `slide-${i}`) },
      }),
    })),
  } as unknown as R2Bucket;
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    c.set('empresaId' as never, 6 as never);
    c.set('userId' as never, 42 as never);
    const blocked = await enforceLmsEnrollmentIntegrity(c as never);
    if (blocked) return blocked;
    return next();
  });
  app.post('/api/lms/matriculas/:id/nova-edicao', c => c.json({ fallback: true }));
  const post = () => app.fetch(
    new Request('http://localhost/api/lms/matriculas/842/nova-edicao', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Versão RC4 CFIT aprovada, novo ciclo exigido.' }),
    }),
    { DB: db, BUCKET: b } as Env,
    {} as ExecutionContext,
  );
  return { post, db, writes, b };
}

describe('CFIT 842 — rematrícula auditada de edição ativa incompatível', () => {
  beforeEach(() => { vi.clearAllMocks(); hasRoleMock.mockReturnValue(true); });

  it('permite novo ciclo só com manifesto ativo 37 e antigo 41/41', async () => {
    const { post, db, writes, b } = setup();
    const response = await post();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true, data: { matricula_id: 842, new_edition: true, rematriculated: true },
    });
    expect(db.batch).toHaveBeenCalledTimes(1);
    const sql = writes.map(w => w.sql).join('\n');
    expect(sql).toContain('UPDATE lms_matricula_ciclos');
    expect(sql).toContain('INSERT INTO lms_matricula_ciclos');
    expect(sql).toContain('lms_progresso_scorm');
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(sql).toContain('DELETE FROM lms_completion_diagnostics_snapshots');
    expect(writes.find(w => w.sql.includes('INSERT INTO audit_logs'))?.bindings.some(x =>
      String(x).includes('scorm_progress'))).toBe(true);
    expect(b.get).toHaveBeenCalledTimes(1);
  });

  it('não permite novo ciclo sem diferença comprovada', async () => {
    const { post, db } = setup({}, 41);
    const response = await post();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'LMS_NEW_EDITION_EVIDENCE_REQUIRED' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('não permite manager/aluno reiniciar edição via endpoint administrativo', async () => {
    hasRoleMock.mockReturnValue(false);
    const { post, db } = setup();
    const response = await post();
    expect(response.status).toBe(403);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('preserva conclusão/qualificação de ciclo anterior vinculado', async () => {
    const { post, db } = setup({ qualificacao_historico_id: 998, status: 'CONCLUIDO' });
    const response = await post();
    expect(response.status).toBe(409);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('não repete rematrícula após ciclo novo sem evidência antiga', async () => {
    const { post, db } = setup({ status: 'CANCELADO' });
    const response = await post();
    expect(response.status).toBe(409);
    expect(db.batch).not.toHaveBeenCalled();
  });
});
