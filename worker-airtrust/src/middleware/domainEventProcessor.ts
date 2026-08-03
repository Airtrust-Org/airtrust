import type { Context, Next } from 'hono';
import { processarEventosParaModulo } from '../shared/handlers';
import { createLogger, toError } from '../utils/logger';

type DomainEventContext = {
  Bindings: {
    DB: D1Database;
    ENVIRONMENT?: string;
  };
  Variables: {
    requestId?: string;
    empresaId?: string | number;
    userId?: string | number;
    user?: {
      id?: number;
      empresa_id?: string | number;
    };
  };
};

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

function getEmpresaIdSafe(c: Context<DomainEventContext>): string | undefined {
  const direct = c.get('empresaId');
  if (direct !== undefined && direct !== null && direct !== '') return String(direct);

  const user = c.get('user');
  if (user?.empresa_id !== undefined && user.empresa_id !== null) return String(user.empresa_id);

  const queryEmpresaId = c.req.query('empresa_id');
  return queryEmpresaId || undefined;
}

export function domainEventProcessorMiddleware() {
  return async (c: Context<DomainEventContext>, next: Next) => {
    const path = c.req.path;
    const method = c.req.method;
    const modulo = Object.entries(ROTA_MODULO).find(([rota]) => path.startsWith(rota))?.[1];

    await next();

    if (!modulo || method === 'GET' || path.includes('/health')) {
      return;
    }

    const logger = createLogger(c, 'DomainEventProcessor');

    try {
      const empresaId = getEmpresaIdSafe(c);
      if (!empresaId) return;

      const executionCtx = c.executionCtx;
      if (!executionCtx) {
        logger.warn('Contexto de execução indisponível para processar eventos de domínio', {
          empresaId,
          modulo,
          path,
          method,
        });
        return;
      }

      const processingPromise = processarEventosParaModulo(c.env.DB, empresaId, modulo)
        .then((resultado) => {
          if (resultado.processados > 0 || resultado.erros > 0) {
            logger.info('Processamento de eventos de domínio concluído', {
              empresaId,
              modulo,
              path,
              method,
              processados: resultado.processados,
              erros: resultado.erros,
            });
          }
        })
        .catch((error) => {
          logger.error('Falha no processamento assíncrono de eventos de domínio', toError(error), {
            empresaId,
            modulo,
            path,
            method,
          });
        });

      executionCtx.waitUntil(processingPromise);
    } catch (error) {
      logger.error('Falha ao agendar processamento de eventos de domínio', toError(error), {
        modulo,
        path,
        method,
      });
      // Nunca bloquear a resposta principal.
    }
  };
}
