import { describe, expect, it, vi } from 'vitest';
import { NOTECHS_CANONICAL_ITEMS } from '../../../../src/shared/simuladores/notechs-canonical';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', c.env?.__userId ?? 10);
    c.set('userRole', c.env?.__role ?? 'aluno');
    c.set('empresaId', c.env?.__empresaId ?? 6);
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/tenant')>()),
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));

vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));
vi.mock('../../utils/ficha-role-scope', () => ({
  resolveFichaScope: (role: string) => role === 'manager' ? 'FULL_ACCESS' : 'ALUNO_PENDING_SIGNATURE',
}));
vi.mock('../../services/simuladores/shared', async () => ({
  ...(await vi.importActual('../../services/simuladores/shared')),
  audit: vi.fn(async () => undefined),
}));

import routes from '../../routes/simuladores-fichas';

function makeDb(authorized: boolean) {
  let historyQueried = false;
  const rows = NOTECHS_CANONICAL_ITEMS.map((item) => ({
    ficha_id: 10, data_sessao: '2026-11-11', tipo_sessao: 'A139-I-01/12',
    status: 'APROVADO', resultado_final: 'APROVADO',
    assinatura_instrutor_timestamp: '2026-11-11T16:00:00Z',
    codigo: item.codigo, categoria: 'NOTECHS', resultado: '8.0', observacoes: '',
  }));
  const oldRows = NOTECHS_CANONICAL_ITEMS.map((item, i) => ({
    ficha_id: 9, data_sessao: '2026-10-22', tipo_sessao: 'A139-P-01/04',
    status: 'APROVADO', resultado_final: 'APROVADO',
    assinatura_instrutor_timestamp: '2026-10-22T16:00:00Z',
    codigo: item.codigo, categoria: 'NOTECHS',
    resultado: i === 0 ? 'NR' : '9.0', observacoes: '',
  }));
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => {
        if (sql.includes('SELECT id FROM funcionarios')) {
          return authorized ? { id: Number(args[0]) } : null;
        }
        if (sql.includes('SELECT f.id FROM usuarios')) return { id: 10 };
        return null;
      },
      all: async () => {
        if (sql.includes('LEFT JOIN fichas_sessao_manobras')) {
          historyQueried = true;
          return { results: [...rows, ...oldRows] };
        }
        return { results: [] };
      },
    }),
  }));
  return { DB: { prepare } as unknown as D1Database, get historyQueried() { return historyQueried; } };
}

async function run(db: D1Database, role: string, id = 10) {
  return routes.fetch(new Request('http://localhost/fichas/notechs/historico/' + id), {
    DB: db, __userId: 10, __role: role, __empresaId: 6,
  } as any);
}

describe('histórico NOTECHS por funcionário — RBAC e isolamento', () => {
  it('funcionário vê apenas o próprio histórico com 15 notas por ficha', async () => {
    const db = makeDb(true);
    const response = await run(db.DB, 'aluno');
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.data).toMatchObject({
      funcionario_id: 10, total_fichas: 2,
      fichas_com_15_notechs: 2,
      fichas_com_suficiencia_individual: 1,
      fichas_aprovadas_com_nota_incompleta: 1,
    });
    expect(body.data.historico[0].avaliacao.eligible).toBe(true);
    expect(body.data.historico[1].avaliacao.unscored).toHaveLength(1);
  });

  it('aluno não pode consultar notas de outro funcionário', async () => {
    const db = makeDb(true);
    const response = await run(db.DB, 'aluno', 11);
    expect(response.status).toBe(403);
    expect(db.historyQueried).toBe(false);
  });

  it('gestor autorizado pode consultar o histórico sem escrever dados', async () => {
    const db = makeDb(true);
    const response = await run(db.DB, 'manager', 11);
    expect(response.status).toBe(200);
    expect(db.historyQueried).toBe(true);
    expect(db.DB.prepare).toHaveBeenCalled();
  });

  it('funcionário inexistente ou fora do tenant não permite consulta', async () => {
    const db = makeDb(false);
    const response = await run(db.DB, 'manager', 11);
    expect(response.status).toBe(404);
    expect(db.historyQueried).toBe(false);
  });

  it('não aceita identificador arbitrário/SQL no path', async () => {
    const db = makeDb(true);
    const response = await run(db.DB, 'manager', 0);
    expect(response.status).toBe(400);
    expect(db.historyQueried).toBe(false);
  });
});
