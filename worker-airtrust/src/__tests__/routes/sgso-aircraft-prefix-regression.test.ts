import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(currentDirectory, relativePath), 'utf8');
}

describe('SGSO aircraft identifier schema compatibility', () => {
  it('uses the canonical aeronaves.prefixo field when creating and reading reports', () => {
    const route = source('../../routes/sgso.ts');
    const aircraftSchema = source('../../../migrations/0455_aeronaves_codigo_tenant_active_unique.sql');

    expect(aircraftSchema).toContain('prefixo TEXT');
    expect(route).toContain('SELECT prefixo AS matricula, modelo FROM aeronaves');
    expect(route).toContain('a.prefixo AS aeronave_matricula_atual');
    expect(route).not.toContain('SELECT matricula, modelo FROM aeronaves');
    expect(route).not.toContain('a.matricula AS aeronave_matricula_atual');
  });
});
