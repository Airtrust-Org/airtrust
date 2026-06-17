import {
  Component,
  Suspense,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import type { ModalCertificadoProps } from '@/react-app/components/modals/ModalCertificado';

type ModalCertificadoModule = { default: ComponentType<ModalCertificadoProps> };
type ModalCertificadoLoader = () => Promise<ModalCertificadoModule>;

const defaultLoader: ModalCertificadoLoader = () =>
  import('@/react-app/components/modals/ModalCertificado').then((m) => ({
    default: m.ModalCertificado,
  }));

function ModalLoadingFallback({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Certificados" size="4xl">
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary-500" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Carregando modal de certificados</p>
          <p className="mt-1 text-sm text-slate-600">
            Aguarde enquanto os componentes do certificado sao preparados.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function ModalErrorFallback({
  isOpen,
  onClose,
  onRetry,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Certificados" size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Nao foi possivel abrir o modal de certificados
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Houve uma falha ao carregar esse trecho da aplicacao. Tente novamente ou recarregue
              a pagina para baixar os assets atualizados.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Recarregar pagina
          </button>
        </div>
      </div>
    </Modal>
  );
}

class LazyModalErrorBoundary extends Component<
  {
    children: ReactNode;
    isOpen: boolean;
    onClose: () => void;
    onRetry: () => void;
    resetKey: string;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: Readonly<{ resetKey: string }>) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error) {
    console.error('[CertificadoModalLoader] Erro ao carregar modal lazy:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ModalErrorFallback
          isOpen={this.props.isOpen}
          onClose={this.props.onClose}
          onRetry={this.props.onRetry}
        />
      );
    }

    return this.props.children;
  }
}

interface CertificadoModalLoaderProps extends ModalCertificadoProps {
  loadComponent?: ModalCertificadoLoader;
}

export function CertificadoModalLoader({
  loadComponent = defaultLoader,
  ...props
}: CertificadoModalLoaderProps) {
  const [retryAttempt, setRetryAttempt] = useState(0);
  const LazyModalCertificado = useMemo(
    () =>
      lazyWithRetry(
        loadComponent,
        `ModalCertificado-${props.qualificacao.id}-${retryAttempt}`,
      ),
    [loadComponent, props.qualificacao.id, retryAttempt],
  );

  return (
    <LazyModalErrorBoundary
      isOpen={props.isOpen}
      onClose={props.onClose}
      onRetry={() => setRetryAttempt((current) => current + 1)}
      resetKey={`${props.qualificacao.id}-${retryAttempt}-${props.isOpen ? 'open' : 'closed'}`}
    >
      <Suspense fallback={<ModalLoadingFallback isOpen={props.isOpen} onClose={props.onClose} />}>
        <LazyModalCertificado key={retryAttempt} {...props} />
      </Suspense>
    </LazyModalErrorBoundary>
  );
}
