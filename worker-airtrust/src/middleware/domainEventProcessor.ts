import type { Context, Next } from 'hono';
import { processarEventosParaModulo } from '../shared/handlers';
import type { AppEnv } from '../types';
import { createLogger, toError } from '../utils/logger';
import { enforceLmsCompletionIntegrity } from './lms-completion-integrity';
import { enforcePersistedLmsProgressEvidence } from './lms-completion-persisted-progress';
import { enforceLmsCompletionReversal } from './lms-completion-reversal';
import { enforceLmsEnrollmentIntegrity } from './lms-enrollment-integrity';

type DomainEventContext = {
  Bindings: AppEnv['Bindings'];
  Variables: AppEnv['Variables'] & {
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
  const empresaId = c.get('empresaId');
  return empresaId ? String(empresaId) : undefined;
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
  const requestId =
    c.res.headers.get('x-request-id') ??
    c.req.header('x-request-id') ??
    c.req.header('cf-ray') ??
    null;
  const userId = c.get('userId') ?? c.get('user')?.id;
  const payload = {
    method,
    path,
    status: c.res.status,
    empresa_id: empresaId || null,
    request_id: requestId,
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
      userId ? String(userId) : null,
    )
    .run();
}

export function domainEventProcessorMiddleware() {
  return async (c: Context<DomainEventContext>, next: Next) => {
    const path = c.req.path;
    const method = c.req.method;
    const modulo = Object.entries(ROTA_MODULO).find(([rota]) => path.startsWith(rota))?.[1];

    // Auth and tenant were resolved by the global middleware before this point.
    // Reversal has a governed schema-aware entry point and must preempt legacy handlers.
    const reversalResponse = await enforceLmsCompletionReversal(c);
    if (reversalResponse) return reversalResponse;

    // Enrollment/rematriculation policy must preempt the broader legacy handlers.
    const enrollmentResponse = await enforceLmsEnrollmentIntegrity(c);
    if (enrollmentResponse) return enrollmentResponse;

    // A terminal payload cannot prove its own progress. Require earlier evidence first.
    const persistedProgressResponse = await enforcePersistedLmsProgressEvidence(c);
    if (persistedProgressResponse) return persistedProgressResponse;

    // LMS completion/progress integrity must run before any legacy route handler.
    const integrityResponse = await enforceLmsCompletionIntegrity(c);
    if (integrityResponse) return integrityResponse;

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
            logger.error(
              'Falha no processamento assíncrono de eventos de domínio',
              toError(error),
              {
                empresaId,
                modulo,
                path,
                method,
              },
            );
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
