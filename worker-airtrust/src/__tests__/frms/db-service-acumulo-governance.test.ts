import { describe, expect, it } from 'vitest';
import { buscarAcumuloFrota } from '../../lib/frms/db-service-acumulo';

function createDb(opts: { hasAssignment: boolean }) {
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
        first: async () => null,
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;
  return db;
}

describe('buscarAcumuloFrota — governed compliance thresholds', () => {
  it('fail-closed: sem assignment de perfil FRMS vigente para a empresa, propaga erro em vez de usar LIMITES_DEFAULT', async () => {
    const db = createDb({ hasAssignment: false });
    await expect(buscarAcumuloFrota(db, undefined, 10)).rejects.toMatchObject({
      code: 'FRMS_CONTEXT_UNAVAILABLE',
    });
  });
});
