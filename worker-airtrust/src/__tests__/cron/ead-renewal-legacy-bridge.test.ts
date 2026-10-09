import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/lms-matricula-cycle', () => ({
  hasActiveMatriculaCycle: vi.fn((row: { status: string; deleted_at: string | null }) =>
    !row.deleted_at && ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(row.status)),
  canReuseMatriculaCycle: vi.fn((row: { status: string; deleted_at: string | null }) =>
    Boolean(row.deleted_at) || ['CONCLUIDO', 'REPROVADO', 'CANCELADO'].includes(row.status)),
  ensureMatriculaCycle: vi.fn(async () => 91),
  resetMatriculaForNewCycle: vi.fn(async () => 92),
}));

import {
  ensureMatriculaCycle,
  resetMatriculaForNewCycle,
} from '../../services/lms-matricula-cycle';
import { ensureEadRenewalMatriculaForRow } from '../../cron/resilient/ead-renewal';

const renewal = {
  qualificacao_historico_id: 17,
  funcionario_id: 9,
  empresa_id: 6,
  qualificacao_id: 31,
  curso_id: 22,
  curso_titulo: 'PBN',
};

function dbWithEnrollment(status: string, deletedAt: string | null = null) {
  const first = vi.fn(async () => ({ id: 42, status, deleted_at: deletedAt }));
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return { db: { prepare } as unknown as D1Database, prepare, bind, first };
}

describe('EAD renewal in legacy scheduler fallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reopens completed enrollment in a new cycle, without making a duplicate enrollment', async () => {
    const { db, prepare } = dbWithEnrollment('CONCLUIDO');
    const result = await ensureEadRenewalMatriculaForRow(db, renewal);

    expect(result).toEqual({ matriculaId: 42, created: false, active: true });
    expect(resetMatriculaForNewCycle).toHaveBeenCalledWith(db, expect.objectContaining({
      matriculaId: 42, empresaId: 6, origin: 'AUTO_RENOVACAO',
    }));
    expect(ensureMatriculaCycle).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('preserves an enrollment already underway instead of resetting SCORM progress', async () => {
    const { db } = dbWithEnrollment('EM_ANDAMENTO');
    const result = await ensureEadRenewalMatriculaForRow(db, renewal);

    expect(result).toEqual({ matriculaId: 42, created: false, active: true });
    expect(ensureMatriculaCycle).toHaveBeenCalledWith(db, {
      matriculaId: 42, empresaId: 6, origin: 'AUTO_RENOVACAO',
    });
    expect(resetMatriculaForNewCycle).not.toHaveBeenCalled();
  });

  it('uses the same cycle repair in the legacy scheduler instead of skipping existing enrollments', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/cron/scheduled-handler.ts'), 'utf8');
    expect(source).toContain('ensureEadRenewalMatriculaForRow(env.DB, row)');
    expect(source).not.toContain('if (existente) {\\n            continue;');
  });
});
