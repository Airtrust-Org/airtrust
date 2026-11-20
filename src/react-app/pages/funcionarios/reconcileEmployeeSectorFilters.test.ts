import { describe, expect, it } from 'vitest';
import { reconcileEmployeeSectorFilters } from './reconcileEmployeeSectorFilters';

describe('reconcileEmployeeSectorFilters', () => {
  it('treats every accessible sector selected as no filter', () => {
    expect(reconcileEmployeeSectorFilters(['2', '1'], ['1', '2'], true)).toEqual({
      selected: ['2', '1'],
      applied: [],
    });
  });

  it('removes persisted IDs that are no longer within the user scope', () => {
    expect(reconcileEmployeeSectorFilters(['1', '2', '99'], ['1', '2'], true)).toEqual({
      selected: ['1', '2'],
      applied: [],
    });
  });

  it('keeps a partial selection and removes duplicates', () => {
    expect(reconcileEmployeeSectorFilters(['2', '2', '99'], ['1', '2', '3'], true)).toEqual({
      selected: ['2'],
      applied: ['2'],
    });
  });

  it('does not interpret a catalog-loading race as a permission denial', () => {
    expect(reconcileEmployeeSectorFilters(['99'], [], false)).toEqual({
      selected: ['99'],
      applied: [],
    });
  });

  it('does not silently include sectors if access returned an empty catalog', () => {
    expect(reconcileEmployeeSectorFilters(['99'], [], true)).toEqual({
      selected: [],
      applied: [],
    });
  });
});
