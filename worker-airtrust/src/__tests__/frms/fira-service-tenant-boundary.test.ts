import { describe, expect, it } from 'vitest';
import {
  buscarImportacaoFiraById,
  deletarImportacaoFira,
  vincularTripulanteFira,
} from '../../lib/frms/fira-service';

type State = { ownerEmpresaId: number; writes: string[]; queries: string[] };

function createDb(ownerEmpresaId = 2): D1Database & { state: State } {
  const state: State = { ownerEmpresaId, writes: [], queries: [] };
  const db = {
    state,
    prepare(sql: string) {
      const stmt: any = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          stmt.params = params;
          return stmt;
        },
        async first() {
          state.queries.push(sql);
          const lower = sql.toLowerCase();
          if (lower.includes('from frms_importacao_fira f')) {
            const tenantEmpresaId = Number(stmt.params[1]);
            if (tenantEmpresaId !== state.ownerEmpresaId) return null;
            if (lower.includes('select f.status')) {
              return { status: 'REVISAO', total_dias_importados: 0 };
            }
            return {
              id: 'fira-tenant-2',
              tripulante_id: '20',
              importado_por: '21',
              preview_json: JSON.stringify({ tripulante_id: '20', tripulante_encontrado: true }),
            };
          }
          if (lower.includes('select id from funcionarios')) {
            return Number(stmt.params[1]) === state.ownerEmpresaId ? { id: 20 } : null;
          }
          if (lower.includes('select f.preview_json')) {
            return Number(stmt.params[2]) === state.ownerEmpresaId
              ? { preview_json: JSON.stringify({ tripulante_id: '20', tripulante_encontrado: true }) }
              : null;
          }
          if (lower.includes('select nome from funcionarios')) return { nome: 'Tripulante tenant 2' };
          return null;
        },
        async run() {
          state.writes.push(sql);
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database & { state: State };
}

describe('FIRA service tenant boundary', () => {
  it('permite ler uma importação pertencente ao tenant atual', async () => {
    const db = createDb(2);

    await expect(buscarImportacaoFiraById(db, 'fira-tenant-2', 2)).resolves.toMatchObject({
      id: 'fira-tenant-2',
    });
  });

  it('nega enumeração de importação FIRA de outro tenant', async () => {
    const db = createDb(2);

    await expect(buscarImportacaoFiraById(db, 'fira-tenant-2', 1)).resolves.toBeNull();
  });

  it('nega delete cross-tenant antes de qualquer mutação', async () => {
    const db = createDb(2);

    await expect(deletarImportacaoFira(db, 'fira-tenant-2', '10', 1)).rejects.toThrow(
      'Importação não encontrada',
    );
    expect(db.state.writes).toHaveLength(0);
  });

  it('permite delete no tenant correto', async () => {
    const db = createDb(2);

    await expect(deletarImportacaoFira(db, 'fira-tenant-2', '20', 2)).resolves.toBeUndefined();
    expect(db.state.writes).toHaveLength(2);
  });

  it('nega relink cross-tenant antes de qualquer mutação', async () => {
    const db = createDb(2);

    await expect(vincularTripulanteFira(db, 'fira-tenant-2', '20', 1)).rejects.toThrow(
      'Importação não encontrada',
    );
    expect(db.state.writes).toHaveLength(0);
  });

  it('permite relink no tenant correto', async () => {
    const db = createDb(2);

    await expect(vincularTripulanteFira(db, 'fira-tenant-2', '20', 2)).resolves.toBeUndefined();
    expect(db.state.writes.length).toBeGreaterThan(0);
  });

  it('falha fechada sem empresa do tenant', async () => {
    const db = createDb(2);

    await expect(buscarImportacaoFiraById(db, 'fira-tenant-2', undefined as never)).rejects.toThrow(
      'Contexto de empresa inválido',
    );
    expect(db.state.queries).toHaveLength(0);
  });
});
