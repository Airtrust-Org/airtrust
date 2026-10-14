import { describe, expect, it, vi } from 'vitest';
import { assertScormCommitCycle } from '../../services/lms-scorm-cycle-guard';

function fakeDb(currentId: number | null) {
  const first = vi.fn(async () => currentId === null ? null : { id: currentId });
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return { db: { prepare } as unknown as D1Database, prepare, bind, first };
}

describe('SCORM stale commit cycle guard', () => {
  it('accepts only the server-stored current cycle for matching tenant and enrollment', async () => {
    const { db, bind } = fakeDb(202);
    await expect(assertScormCommitCycle(db, 6, 901, 202)).resolves.toBeUndefined();
    expect(bind).toHaveBeenCalledWith(901, 6);
  });

  it('rejects a delayed old iframe even if the enrollment id and cookie remain valid', async () => {
    const { db } = fakeDb(202);
    await expect(assertScormCommitCycle(db, 6, 901, 201)).rejects.toMatchObject({
      code: 'LMS_SCORM_CYCLE_MISMATCH', statusCode: 409,
    });
  });

  it('rejects orphaned cycles instead of trusting a fabricated client id', async () => {
    const { db } = fakeDb(null);
    await expect(assertScormCommitCycle(db, 6, 901, 202)).rejects.toMatchObject({
      code: 'LMS_SCORM_CYCLE_MISMATCH', statusCode: 409,
    });
  });

  it('keeps the legacy no-cycle path without querying D1', async () => {
    const { db, prepare } = fakeDb(202);
    await expect(assertScormCommitCycle(db, 6, 901, undefined)).resolves.toBeUndefined();
    expect(prepare).not.toHaveBeenCalled();
  });
});
