import { Hono } from 'hono';
import type { Env } from '../types';

/**
 * Tombstone da integração externa EdApp.
 *
 * O serviço foi descontinuado e este módulo permanece temporariamente apenas
 * para manter compatibilidade com o import histórico existente no composition
 * root. Ele não realiza chamadas externas, não lê credenciais e não escreve no
 * banco. Caso seja montado acidentalmente, falha de forma explícita com 410.
 *
 * O histórico já importado continua disponível no router LMS legado e não deve
 * ser removido junto com esta integração externa.
 */
export const edappRouter = new Hono<{ Bindings: Env }>();

edappRouter.all('*', (c) =>
  c.json(
    {
      success: false,
      error: 'Integração EdApp descontinuada',
      code: 'EDAPP_INTEGRATION_GONE',
    },
    410,
  ),
);

export default edappRouter;
