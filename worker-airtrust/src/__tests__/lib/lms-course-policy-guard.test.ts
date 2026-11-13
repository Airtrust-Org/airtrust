import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/errors/api-error';
import { assertCoursePolicyChangeAllowed } from '../../lib/lms/lms-course-policy-guard';

function mockDb(active: number, enrolled: number) {
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      return {
        bind(...args: unknown[]) {
          expect(args).toEqual([79, 6]);
          return {
            async first() {
              return { n: sql.includes('lms_scorm_package_versions') ? active : enrolled };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, queries };
}

describe('SCORM course assessment policy edition guard', () => {
  it('does not query the DB for an unchanged policy', async () => {
    const { db, queries } = mockDb(1, 5);
    await expect(assertCoursePolicyChangeAllowed(db, 6, 79, 'SCORED', 'SCORED')).resolves.toBeUndefined();
    expect(queries).toHaveLength(0);
  });

  it('blocks SCORED to FORMATIVE on an active package even with zero enrollments', async () => {
    const { db, queries } = mockDb(1, 0);
    await expect(assertCoursePolicyChangeAllowed(db, 6, 79, 'SCORED', 'FORMATIVE'))
      .rejects.toMatchObject({ statusCode: 409, code: 'POLICY_CHANGE_REQUIRES_EDITION_ACTIVATION' } satisfies Partial<ApiError>);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("status = 'ACTIVE'");
  });

  it('blocks FORMATIVE to SCORED on an active package', async () => {
    const { db } = mockDb(1, 0);
    await expect(assertCoursePolicyChangeAllowed(db, 6, 79, 'FORMATIVE', 'SCORED'))
      .rejects.toMatchObject({ statusCode: 409, code: 'POLICY_CHANGE_REQUIRES_EDITION_ACTIVATION' });
  });

  it('blocks enrollment policy changes even when no package is currently active', async () => {
    const { db, queries } = mockDb(0, 4);
    await expect(assertCoursePolicyChangeAllowed(db, 6, 79, 'SCORED', 'FORMATIVE'))
      .rejects.toMatchObject({ statusCode: 409, code: 'POLICY_CHANGE_REQUIRES_EDITION_ACTIVATION' });
    expect(queries).toHaveLength(2);
  });

  it('permits metadata policy setup only before package activation and enrollment', async () => {
    const { db, queries } = mockDb(0, 0);
    await expect(assertCoursePolicyChangeAllowed(db, 6, 79, 'SCORED', 'FORMATIVE')).resolves.toBeUndefined();
    expect(queries).toHaveLength(2);
  });
});
