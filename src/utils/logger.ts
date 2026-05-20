/**
 * Sistema de Logging Profissional
 * Substitui console.logs por sistema estruturado
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  context?: string;
}

class Logger {
  private isDevelopment: boolean;
  private logs: LogEntry[] = [];

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
  }

  private log(level: LogLevel, message: string, data?: any, context?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      context,
    };

    this.logs.push(entry);

    if (this.isDevelopment) {
      const prefix = `[${level.toUpperCase()}]`;
      const contextStr = context ? `[${context}]` : '';
      
      switch (level) {
        case 'debug':
          break;
        case 'info':
          console.info(`${prefix}${contextStr}`, message, data || '');
          break;
        case 'warn':
          console.warn(`${prefix}${contextStr}`, message, data || '');
          break;
        case 'error':
          console.error(`${prefix}${contextStr}`, message, data || '');
          break;
      }
    }
  }

  /**
   * Log de debug (apenas em desenvolvimento)
   */
  debug(message: string, data?: any, context?: string) {
    if (this.isDevelopment) {
      this.log('debug', message, data, context);
    }
  }

  /**
   * Log de informação
   */
  info(message: string, data?: any, context?: string) {
    this.log('info', message, data, context);
  }

  /**
   * Log de warning
   */
  warn(message: string, data?: any, context?: string) {
    this.log('warn', message, data, context);
  }

  /**
   * Log de erro
   */
  error(message: string, error?: any, context?: string) {
    this.log('error', message, error, context);
  }

  /**
   * Obter todos os logs
   */
  getLogs(): LogEntry[] {
    return this.logs;
  }

  /**
   * Limpar logs
   */
  clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();

export type { LogEntry, LogLevel };
