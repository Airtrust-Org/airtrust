/**
 * Error Boundary Component - Captura erros em componentes React
 *
 * Benefícios:
 * - Previne white screen of death
 * - UI elegante com fallback
 * - Log em Sentry (produção)
 * - Detalhes técnicos apenas em desenvolvimento ou quando explicitamente habilitados
 * - Keyboard navigation acessível
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './UI/Button';
import { Card, CardContent, CardHeader, CardTitle } from './UI/Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function isRecoverableAssetError(error: Error): boolean {
  const message = String(error?.message || '').toLowerCase();
  const stack = String(error?.stack || '').toLowerCase();
  const raw = `${message}\n${stack}`;

  return (
    raw.includes('chunkloaderror') ||
    raw.includes('loading chunk') ||
    raw.includes('failed to fetch dynamically imported module') ||
    raw.includes('importing a module script failed') ||
    (raw.includes('javascript mime') && raw.includes('text/html')) ||
    raw.includes('not a valid javascript mime type')
  );
}

async function clearLegacyAirtrustCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('airtrust-'))
          .map((name) => caches.delete(name)),
      );
    }
  } catch {
    // Segue para reload mesmo se limpeza falhar.
  }
}

async function forceHardRecover(): Promise<void> {
  if (typeof window === 'undefined') return;

  await clearLegacyAirtrustCaches();

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('hard_refresh', Date.now().toString());
  window.location.replace(nextUrl.toString());
}

async function hardRecoverOnce(error: Error): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isRecoverableAssetError(error)) return false;

  const key = `airtrust-hard-recover:${window.location.pathname}`;
  if (sessionStorage.getItem(key) === '1') return false;
  sessionStorage.setItem(key, '1');

  await forceHardRecover();
  return true;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    this.setState({ errorInfo });
    void hardRecoverOnce(error);

    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleRetry = (): void => {
    const error = this.state.error;
    if (error && isRecoverableAssetError(error)) {
      void forceHardRecover();
      return;
    }
    this.handleReset();
  };

  handleGoHome = (): void => {
    this.handleReset();
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const showTechnicalDetails = this.props.showDetails ?? import.meta.env.DEV;

      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
          <Card className="w-full max-w-lg border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-critical/10">
                  <AlertTriangle size={24} className="text-critical" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">
                    Algo deu errado
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Ocorreu um erro inesperado. A equipe foi notificada.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {showTechnicalDetails && this.state.error && (
                <details
                  className="group cursor-pointer"
                  role="region"
                  aria-label="Detalhes técnicos do erro"
                >
                  <summary className="flex select-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100">
                    <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                    Detalhes técnicos (desenvolvimento)
                  </summary>
                  <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        Mensagem do Erro
                      </p>
                      <pre className="max-h-24 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-xs text-critical dark:border-slate-700 dark:bg-slate-900">
                        {this.state.error.toString()}
                      </pre>
                    </div>

                    {this.state.errorInfo && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                          Stack de Componentes
                        </p>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-950/30">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Dica:</strong> tente recarregar a página. Se o problema persistir, entre em
                  contato com o suporte.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={this.handleRetry}
                  variant="primary"
                  className="flex-1"
                  leftIcon={<RefreshCw size={16} />}
                >
                  Tentar Novamente
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="secondary"
                  className="flex-1"
                  leftIcon={<Home size={16} />}
                >
                  Ir para Início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export function useErrorHandler() {
  const handleError = (error: Error) => {
    throw error;
  };

  return handleError;
}

export default ErrorBoundary;
