import { describe, expect, it } from 'vitest';
import edappRouter from '../integracoes_edapp';

describe('integração externa EdApp descontinuada', () => {
  it.each(['/ping', '/webhook', '/setup-webhook', '/cursos-disponiveis'])(
    'falha de forma explícita e somente leitura em %s',
    async (path) => {
      const response = await edappRouter.request(`http://localhost${path}`);
      const body = (await response.json()) as {
        success: boolean;
        code: string;
      };

      expect(response.status).toBe(410);
      expect(body).toEqual({
        success: false,
        error: 'Integração EdApp descontinuada',
        code: 'EDAPP_INTEGRATION_GONE',
      });
    },
  );
});
