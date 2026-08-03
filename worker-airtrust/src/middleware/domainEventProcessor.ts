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

function isAccessMutation(method: string, path: string): boolean {
  if (!['PUT', 'PATCH'].includes(method)) return false;
  return /\/(admin-usuarios|empresas-usuarios|usuarios)(\/|$)/.test(path);
}

function shouldRecordMutationReceipt(method: string, path: string, status: number): boolean {
  if (status < 200 || status >= 400 || path.includes('/health')) return false;
  return method === 'DELETE' || isAccessMutation(method, path);
}

function getPathRecordId(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return decodeURIComponent(segments.at(-1) || path);
}

async function recordMutationReceipt(
  c: Context<DomainEventContext>,
  method: string,
  path: string,
  empresaId: string | undefined,
): Promise<void> {
  const requestId = c.get('requestId');
  const userId = c.get('userId') ?? c.get('user')?.id;
  const payload = {
    method,
    path,
    status: c.res.status,
    empresa_id: empresaId || null,
    request_id: requestId || null,
  };

  await c.env.DB.prepare(
    `INSERT INTO auditoria_avancada_v2
      (tabela, acao, registro_id, dados_novos, usuario_id, origem, created_at)
     VALUES ('http_mutation_receipts', ?, ?, ?, ?, 'api_middleware', datetime('now'))`,
  )
    .bind(
      method === 'DELETE' ? 'HTTP_DELETE' : 'HTTP_ACCESS_MUTATION',
      getPathRecordId(path),
      JSON.stringify(payload),
      userId !== undefined && userId !== null ? String(userId) : null,
    )
    .run();
}

export function domainEventProcessorMiddleware() {
  return async (c: Context<DomainEventContext>, next: Next) => {
    const path = c.req.path;
    const method = c.req.method;
    const modulo = Object.entries(ROTA_MODULO).find(([rota]) => path.startsWith(rota))?.[1];

    await next();

    const shouldProcessEvents = Boolean(modulo && method !== 'GET' && !path.includes('/health'));
    const shouldAudit = shouldRecordMutationReceipt(method, path, c.res.status);
    if (!shouldProcessEvents && !shouldAudit) return;

    const logger = createLogger(c, 'DomainEventProcessor');
    const empresaId = getEmpresaIdSafe(c);

    let executionCtx: ExecutionContext;
    try {
      executionCtx = c.executionCtx;
    } catch (error) {
      logger.warn('Contexto de execução indisponível para tarefas pós-mutação', {
        empresaId,
        modulo,
        path,
        method,
        error: toError(error).message,
      });
      return;
    }

    if (!executionCtx) {
      logger.warn('Contexto de execução indisponível para tarefas pós-mutação', {
        empresaId,
        modulo,
        path,
        method,
      });
      return;
    }

    const backgroundTasks: Promise<unknown>[] = [];

    if (shouldAudit) {
      backgroundTasks.push(
        recordMutationReceipt(c, method, path, empresaId).catch((error) => {
          logger.error('Falha ao registrar recibo central de mutação', toError(error), {
            empresaId,
            path,
            method,
            status: c.res.status,
          });
        }),
      );
    }

    if (shouldProcessEvents && modulo && empresaId) {
      backgroundTasks.push(
        processarEventosParaModulo(c.env.DB, empresaId, modulo)
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
          }),
      );
    }

    if (backgroundTasks.length === 0) return;

    try {
      executionCtx.waitUntil(Promise.allSettled(backgroundTasks).then(() => undefined));
    } catch (error) {
      logger.error('Falha ao agendar tarefas pós-mutação', toError(error), {
        empresaId,
        modulo,
        path,
        method,
      });
      // Nunca bloquear a resposta principal.
    }
  };
}
