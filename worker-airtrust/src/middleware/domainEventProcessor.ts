import type { Context, Next } from 'hono';
import { processarEventosParaModulo } from '../shared/handlers';

const ROTA_MODULO: Record<string, string> = {
  '/api/escalas': 'escalas',
  '/api/qualificacoes': 'qualificacoes',
  '/api/simuladores': 'simuladores',
  '/api/frms': 'frms',
  '/api/hospedagem': 'hospedagem',
  '/api/pasta-virtual': 'pasta_virtual',
  '/api/funcionarios': 'funcionarios',
  '/api/compliance': 'compliance',
};

function getEmpresaIdSafe(c: Context<any>): string | undefined {
  const direct = c.get('empresaId' as never);
  if (direct !== undefined && direct !== null && direct !== '') return String(direct);

  const user = c.get('user' as never) as { empresa_id?: string | number } | undefined;
  if (user?.empresa_id !== undefined && user?.empresa_id !== null) return String(user.empresa_id);

  const queryEmpresaId = c.req.query('empresa_id');
  return queryEmpresaId || undefined;
}

export function domainEventProcessorMiddleware() {
  return async (c: Context<any>, next: Next) => {
    const path = c.req.path;
    const modulo = Object.entries(ROTA_MODULO).find(([rota]) => path.startsWith(rota))?.[1];

    await next();

    if (!modulo || c.req.method === 'GET' || path.includes('/health')) {
      return;
    }

    try {
      const empresaId = getEmpresaIdSafe(c);
      if (empresaId) {
        c.executionCtx?.waitUntil(
          processarEventosParaModulo(c.env.DB, empresaId, modulo).then((resultado) => {
            if (resultado.processados > 0 || resultado.erros > 0) {
              console.log(
                `[EventProcessor] ${modulo}: ${resultado.processados} OK, ${resultado.erros} ERR`,
              );
            }
          }),
        );
      }
    } catch {
      // Nunca bloquear a resposta principal.
    }
  };
}
