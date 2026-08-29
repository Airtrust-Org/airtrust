import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
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

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const showTechnicalDetails = this.props.showDetails ?? import.meta.env.DEV;

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="text-red-600 dark:text-red-400" size={32} />
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Algo deu errado</h1>
            </div>

            <p className="mb-4 text-slate-600 dark:text-slate-300">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>

            {showTechnicalDetails && this.state.error && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
                  Detalhes técnicos (desenvolvimento)
                </summary>
                <div className="mt-2 space-y-2 rounded border border-red-200 bg-red-50 p-3 dark:border-red-900/70 dark:bg-red-950/30">
                  <p className="break-words font-mono text-sm text-red-800 dark:text-red-200">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            <button
              onClick={this.handleReset}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary/90"
            >
              <RefreshCw size={20} />
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
