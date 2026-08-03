import { describe, expect, it } from 'vitest';
import { handleTripulanteAlocadoHospedagem } from '../shared/handlers/hospedagemHandlers';

class LodgingDb {
  readonly suggestions = new Set<string>();
  readonly statements: Array<{ sql: string; bindings: unknown[] }> = [];

  constructor(private readonly employeeBase: string | null) {}

  prepare(sql: string) {
    let bindings: unknown[] = [];
    return {
      bind: (...args: unknown[]) => {
        bindings = args;
        this.statements.push({ sql, bindings });
        return {
          first: async <T>() => {
            if (!sql.includes('FROM funcionarios')) throw new Error(`SELECT inesperado: ${sql}`);
            return (this.employeeBase ? { base: this.employeeBase } : null) as T | null;
          },
          run: async () => {
            if (!sql.includes('INSERT INTO hospedagem_sugestoes')) {
              throw new Error(`INSERT inesperado: ${sql}`);
            }
            const key = JSON.stringify([
              bindings[1],
              bindings[2],
              bindings[3],
              String(bindings[4]).trim().toUpperCase(),
              bindings[5],
              bindings[6],
            ]);
            const existed = this.suggestions.has(key);
            this.suggestions.add(key);
            return { meta: { changes: existed ? 0 : 1 } };
          },
        };
      },
    };
  }
}

function asD1(db: LodgingDb): D1Database {
  return db as unknown as D1Database;
}

describe('TRIPULANTE_ALOCADO lodging handler', () => {
  it('resolve a base de origem no funcionário e cria uma única sugestão', async () => {
    const db = new LodgingDb('SBGL');
    const payload = {
      empresa_id: 6,
      origem_modulo: 'escalas',
      funcionario_id: '99',
      escala_id: 'escala-1',
      base_destino: 'SBSP',
      data_inicio: '2026-08-10',
      data_fim: '2026-08-20',
    };

    await handleTripulanteAlocadoHospedagem(asD1(db), payload);
    await handleTripulanteAlocadoHospedagem(asD1(db), payload);

    expect(db.suggestions.size).toBe(1);
    const lookup = db.statements.find((statement) => statement.sql.includes('FROM funcionarios'));
    expect(lookup?.sql).toContain('empresa_id = ?');
    expect(lookup?.bindings).toEqual(['99', 6]);
    const insert = db.statements.find((statement) =>
      statement.sql.includes('INSERT INTO hospedagem_sugestoes'),
    );
    expect(insert?.sql).toContain('WHERE NOT EXISTS');
  });

  it('não sugere hospedagem quando origem e destino representam a mesma base', async () => {
    const db = new LodgingDb('sbsp');

    await handleTripulanteAlocadoHospedagem(asD1(db), {
      empresa_id: 6,
      origem_modulo: 'escalas',
      funcionario_id: '99',
      base_destino: 'SBSP',
    });

    expect(db.suggestions.size).toBe(0);
    expect(
      db.statements.some((statement) => statement.sql.includes('INSERT INTO hospedagem_sugestoes')),
    ).toBe(false);
  });
});
