import { describe, expect, it } from 'vitest';
import {
  createCronOperationBudget,
  CRON_D1_OPERATION_LIMIT,
  CRON_EXTERNAL_CALL_LIMIT,
} from '../../cron/resilient/job-runner';

describe('cron operation budget', () => {
  it('stops before the preventive D1 reserve is exhausted', () => {
    const budget = createCronOperationBudget({ d1Limit: 10, d1Reserve: 2, externalLimit: 5 });
    budget.plan(20, 0);
    expect(budget.consumeD1(8)).toBe(true);
    expect(budget.consumeD1(1)).toBe(false);
    expect(budget.snapshot()).toMatchObject({
      planned_d1: 20,
      executed_d1: 8,
      stop_reason: 'D1_PREVENTIVE_LIMIT',
    });
  });

  it('accounts external calls separately', () => {
    const budget = createCronOperationBudget({ externalLimit: 4, externalReserve: 1 });
    expect(budget.consumeExternal(3)).toBe(true);
    expect(budget.consumeExternal()).toBe(false);
    expect(budget.snapshot().stop_reason).toBe('EXTERNAL_PREVENTIVE_LIMIT');
  });

  it('uses documented conservative defaults instead of magic values', () => {
    expect(CRON_D1_OPERATION_LIMIT).toBeGreaterThan(100);
    expect(CRON_D1_OPERATION_LIMIT).toBeLessThan(1000);
    expect(CRON_EXTERNAL_CALL_LIMIT).toBeGreaterThan(1);
    expect(CRON_EXTERNAL_CALL_LIMIT).toBeLessThanOrEqual(50);
  });
});
