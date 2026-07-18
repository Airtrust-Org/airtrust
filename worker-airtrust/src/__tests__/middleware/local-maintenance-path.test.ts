import { describe, expect, it } from 'vitest';
import { isMaintenancePath } from '../../middleware/local-maintenance';

describe('isMaintenancePath', () => {
  it.each([
    '/api/frms/maintenance/fortnight-coverage',
    '/api/frms/maintenance/fortnight-materialization-preview/',
    '/api/frms/maintenance/reprocessar-lote',
    '/api/integracoes/sigvoos/maintenance/sincronizar-frms',
    '/api/unknown/maintenance/probe',
  ])('classifies %s', (path) => expect(isMaintenancePath(path)).toBe(true));

  it.each(['/api/frms/maintenance-report', '/maintenance/x', '/api/frms/not-maintenance/x'])('does not classify similar path %s', (path) => expect(isMaintenancePath(path)).toBe(false));

  it.each(['/api/frms//maintenance/x', '/api/frms/%6d%61intenance/x', '/api/frms/%ZZ/x'])('fails closed for ambiguous form %s', (path) => expect(isMaintenancePath(path)).toBe(true));
});
