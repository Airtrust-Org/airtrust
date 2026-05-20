/**
 * Error Boundary Component - Captura erros em componentes React
 *
 * Benefícios:
 * - Previne white screen of death
 * - UI elegante com fallback
 * - Log em Sentry (produção)
 * - Detalhes técnicos em desenvolvimento
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

async function hardRecoverOnce(error: Error): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isRecoverableAssetError(error)) return false;

  const key = `airtrust-hard-recover:${window.location.pathname}`;
  if (sessionStorage.getItem(key) === '1') return false;
  sessionStorage.setItem(key, '1');

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

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('hard_refresh', Date.now().toString());
  window.location.replace(nextUrl.toString());
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
    // Log error para serviço de monitoring
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);

    // Callback customizado
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    this.setState({
      errorInfo,
    });

    void hardRecoverOnce(error);

    // Enviar para serviço de tracking (Sentry, etc)
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

  handleGoHome = (): void => {
    this.handleReset();
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Usar fallback customizado se fornecido
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Fallback padrão elegante
      return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <Card className="max-w-lg w-full shadow-xl border-0">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-critical/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={24} className="text-critical" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl text-slate-900">Algo deu errado</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    Ocorreu um erro inesperado. A equipe foi notificada.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Always allow inspecting error details (production too) */}
              {this.state.error && (
                <details
                  className="group cursor-pointer"
                  role="region"
                  aria-label="Detalhes técnicos do erro"
                  open={true}
                >
                  <summary className="select-none flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 py-2 px-3 rounded-md hover:bg-slate-50">
                    <span className="group-open:rotate-90 transition-transform inline-block">
                      ▶
                    </span>
                    Detalhes técnicos
                  </summary>
                  <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                        Mensagem do Erro
                      </p>
                      <pre className="text-xs text-critical font-mono overflow-auto max-h-24 p-2 bg-white rounded border border-slate-200">
                        {this.state.error.toString()}
                      </pre>
                    </div>

                    {this.state.errorInfo && (
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                          Stack de Componentes
                        </p>
                        <pre className="text-xs text-slate-700 font-mono overflow-auto max-h-32 p-2 bg-white rounded border border-slate-200 whitespace-pre-wrap break-words">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Dica útil */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900">
                  💡 <strong>Dica:</strong> Tente recarregar a página. Se o problema persistir,
                  entre em contato com o suporte.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={this.handleReset}
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

/**
 * Hook para usar Error Boundary programaticamente
 */
export function useErrorHandler() {
  const handleError = (error: Error) => {
    throw error;
  };

  return handleError;
}

export default ErrorBoundary;
