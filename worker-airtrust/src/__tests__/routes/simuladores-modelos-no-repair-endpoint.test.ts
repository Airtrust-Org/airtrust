/**
 * P07-01: o reparo pontual `POST /fix/modelos-periodicos` (UPDATE em modelos_sessao
 * com tipo_sessao_id fixo, exigindo so login) foi removido. Correcoes de dados
 * passam por workflow governado, nao por endpoint de aplicacao.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', 6);
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({ empresaId: 6 }),
}));

import modelos from '../../routes/simuladores-modelos';

describe('P07-01 endpoint de reparo removido', () => {
  it('nao responde nem executa SQL para nenhum papel', async () => {
    const prepare = vi.fn();
    const response = await modelos.fetch(
      new Request('http://localhost/fix/modelos-periodicos', { method: 'POST' }),
      { DB: { prepare } } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('o fonte da rota nao contem mais o reparo', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/simuladores-modelos.ts'), 'utf8');
    expect(source).not.toContain('fix/modelos-periodicos');
    expect(source).not.toContain('tipo_sessao_id = 9');
  });
});
