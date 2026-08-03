/**
 * Sistema de Logging Estruturado - AirTrust
 *
 * Uso:
 * const logger = createLogger(c, 'ImportacaoService');
 * logger.info('Iniciando importação', { entidade: 'funcionarios', total: 42 });
 * logger.error('Erro ao importar', error, { linha: 5 });
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogContext {
  requestId: string;
  userId?: number;
  environment: string;
  timestamp: string;
  module: string;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: LogContext;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
}

type LoggerContextSource = {
  get?: (key: string) => unknown;
  env?: {
    ENVIRONMENT?: unknown;
  };
};

export class Logger {
  private context: LogContext;
  private startTime: number;

  constructor(requestId: string, module: string, environment: string, user?: { id: number }) {
    this.context = {
      requestId,
      userId: user?.id,
      environment,
      timestamp: new Date().toISOString(),
      module,
    };
    this.startTime = Date.now();
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error) {
    const entry: LogEntry = {
      level,
      message,
      context: {
        ...this.context,
        timestamp: new Date().toISOString(),
      },
      data,
      duration: Date.now() - this.startTime,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    // Formato visual para desenvolvimento
    if (this.context.environment === 'development') {
      this.logPretty(entry);
    } else {
      // JSON estruturado para produção (parsing automático)
      console.log(JSON.stringify(entry));
    }
  }

  private logPretty(entry: LogEntry) {
    const icons = {
      DEBUG: '🔍',
      INFO: 'ℹ️',
      WARN: '⚠️',
      ERROR: '❌',
      FATAL: '💀',
    };

    const colors = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m', // Green
      WARN: '\x1b[33m', // Yellow
      ERROR: '\x1b[31m', // Red
      FATAL: '\x1b[35m', // Magenta
    };

    const reset = '\x1b[0m';
    const color = colors[entry.level];
    const icon = icons[entry.level];

    console.log('\n' + '═'.repeat(80));
    console.log(`${color}${icon} [${entry.level}]${reset} ${entry.context.module}`);
    console.log('─'.repeat(80));
    console.log(`📝 Mensagem: ${entry.message}`);
    console.log(`🕒 Timestamp: ${entry.context.timestamp}`);
    console.log(`⏱️  Duração: ${entry.duration}ms`);
    console.log(`🆔 Request ID: ${entry.context.requestId}`);

    if (entry.context.userId) {
      console.log(`👤 Usuário ID: ${entry.context.userId}`);
    }

    if (entry.data && Object.keys(entry.data).length > 0) {
      console.log('📊 Dados:');
      console.log(JSON.stringify(entry.data, null, 2));
    }

    if (entry.error) {
      console.log(`${color}💥 Erro: ${entry.error.name}: ${entry.error.message}${reset}`);
      if (entry.error.stack) {
        console.log('📚 Stack:');
        console.log(entry.error.stack);
      }
    }

    console.log('═'.repeat(80) + '\n');
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('WARN', message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>) {
    this.log('ERROR', message, data, error);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>) {
    this.log('FATAL', message, data, error);
  }

  // Helper para medir performance
  startTimer(label: string) {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`⏱️ ${label}`, { duration_ms: duration });
    };
  }
}

export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === 'string' ? error : String(error ?? 'Unknown error'));
}

export function createModuleLogger(
  module: string,
  environment: string,
  requestId: string = crypto.randomUUID(),
) {
  return new Logger(requestId, module, environment);
}

function toLogData(optionalParams: unknown[]): Record<string, unknown> | undefined {
  if (optionalParams.length === 0) {
    return undefined;
  }

  return {
    details: optionalParams.map((param) => {
      if (param instanceof Error) {
        return {
          name: param.name,
          message: param.message,
        };
      }

      return param;
    }),
  };
}

export function createStructuredConsole(
  module: string,
  environment: string,
  requestId: string = crypto.randomUUID(),
) {
  const logger = createModuleLogger(module, environment, requestId);

  return {
    log(message?: unknown, ...optionalParams: unknown[]) {
      logger.info(String(message ?? ''), toLogData(optionalParams));
    },
    warn(message?: unknown, ...optionalParams: unknown[]) {
      logger.warn(String(message ?? ''), toLogData(optionalParams));
    },
    error(message?: unknown, ...optionalParams: unknown[]) {
      const nestedError = optionalParams.find((param) => param instanceof Error);
      logger.error(
        String(message ?? ''),
        nestedError ? toError(nestedError) : undefined,
        toLogData(optionalParams),
      );
    },
  };
}

// Factory para criar logger a partir do contexto Hono
export function createLogger(context: unknown, module: string): Logger {
  const source = context as LoggerContextSource;
  const getValue = typeof source.get === 'function' ? source.get.bind(source) : () => undefined;

  const rawRequestId = getValue('requestId');
  const requestId =
    typeof rawRequestId === 'string' && rawRequestId.trim().length > 0
      ? rawRequestId
      : crypto.randomUUID();

  const rawUser = getValue('user');
  const userId =
    rawUser &&
    typeof rawUser === 'object' &&
    'id' in rawUser &&
    typeof rawUser.id === 'number' &&
    Number.isFinite(rawUser.id)
      ? rawUser.id
      : undefined;

  const rawEnvironment = source.env?.ENVIRONMENT;
  const environment =
    typeof rawEnvironment === 'string' && rawEnvironment.trim().length > 0
      ? rawEnvironment
      : 'development';

  return new Logger(
    requestId,
    module,
    environment,
    userId === undefined ? undefined : { id: userId },
  );
}
