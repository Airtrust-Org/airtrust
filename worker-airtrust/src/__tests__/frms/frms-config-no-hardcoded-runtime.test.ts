import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carregarLimites } from '../../lib/frms/db-service-config';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

type Row = { nome: string; valor_numerico: number };

function dbWith(rows: Row[], failure?: Error) {
  return {
    prepare() {
      return {
        async all() {
          if (failure) throw failure;
          return { results: rows };
        },
      };
    },
  } as unknown as D1Database;
}

describe('FRMS operational parameters are DB-backed', () => {
  it('loads a complete configured parameter set from D1', async () => {
    const rows = Object.keys(LIMITES_DEFAULT).map((nome, index) => ({
      nome,
      valor_numerico: index + 0.25,
    }));
    const resolved = await carregarLimites(dbWith(rows));
    for (const row of rows) {
      expect(resolved[row.nome as keyof typeof resolved]).toBe(row.valor_numerico);
    }
  });

  it('fails closed when a required operational parameter is missing instead of using a hardcoded value', async () => {
    const rows = Object.keys(LIMITES_DEFAULT)
      .slice(1)
      .map((nome, index) => ({ nome, valor_numerico: index + 1 }));
    await expect(carregarLimites(dbWith(rows))).rejects.toThrow(
      'FRMS_OPERATIONAL_PARAMETER_MISSING',
    );
  });

  it('fails closed when a configured value is non-finite', async () => {
    const rows = Object.keys(LIMITES_DEFAULT).map((nome, index) => ({
      nome,
      valor_numerico: index === 0 ? Number.NaN : index + 1,
    }));
    await expect(carregarLimites(dbWith(rows))).rejects.toThrow(
      'FRMS_OPERATIONAL_PARAMETER_MISSING',
    );
  });

  it('fails closed when D1 cannot load parameters instead of silently restoring code defaults', async () => {
    await expect(carregarLimites(dbWith([], new Error('D1 unavailable')))).rejects.toThrow(
      'D1 unavailable',
    );
  });

  it('keeps migration seed coverage for every required LIMITES_DEFAULT key', () => {
    const migrationDir = join(process.cwd(), 'migrations');
    const sqlCorpus = readdirSync(migrationDir)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(migrationDir, name), 'utf8'))
      .join('\n');

    const missing = Object.keys(LIMITES_DEFAULT).filter(
      (key) => !sqlCorpus.includes(`'${key}'`) && !sqlCorpus.includes(`\"${key}\"`),
    );

    expect(missing).toEqual([]);
  });
});
