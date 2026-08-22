import { describe, expect, it } from 'vitest';
import { salvarJornada } from '../../lib/frms/db-service-jornadas';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

function createDb(opts: { hasAssignment: boolean; empresaId?: number }) {
  const db = {
    prepare: (query: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => {
          if (query.includes('FROM frms_profile_assignments')) {
            return {
              results: opts.hasAssignment
                ? [{ regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' }]
                : [],
            };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes('FROM funcionarios')) {
            return { empresa_id: opts.empresaId ?? 10 };
          }
          return null;
        },
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;
  return db;
}

describe('salvarJornada — governed pre-pipeline validation', () => {
  it('fail-closed: sem assignment de perfil FRMS vigente, propaga erro e não insere jornada com LIMITES_DEFAULT', async () => {
    const db = createDb({ hasAssignment: false });

    await expect(
      salvarJornada(
        db,
        {
          tripulante_id: '1',
          data: '2026-08-22',
          status: 'ES',
          registrado_por: '1',
        } as never,
        LIMITES_DEFAULT,
      ),
    ).rejects.toMatchObject({ code: 'FRMS_CONTEXT_UNAVAILABLE' });
  });
});
