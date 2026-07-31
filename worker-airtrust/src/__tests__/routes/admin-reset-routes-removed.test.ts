import { describe, expect, it } from 'vitest';
import adminRoutes from '../../routes/admin';

describe('admin destructive reset routes', () => {
  for (const path of [
    '/reset/funcionarios',
    '/reset/qualificacoes-tipos',
    '/reset/qualificacoes-historico',
  ]) {
    it(`does not expose DELETE ${path}`, async () => {
      const response = await adminRoutes.request(path, { method: 'DELETE' });
      expect([401, 404]).toContain(response.status);
    });
  }
});
