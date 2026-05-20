import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

interface LazyLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}

const DefaultFallback: React.FC = () => (
  <div className="flex items-center justify-center py-8">
    <div className="flex items-center space-x-3">
      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      <span className="text-gray-500 text-sm">Carregando...</span>
    </div>
  </div>
);

const ErrorBoundary: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ 
  children, 
  fallback 
}) => {
  try {
    return <>{children}</>;
  } catch (error) {
    console.error('Erro no LazyLoader:', error);
    return fallback || <div className="p-4 text-red-600">Erro ao carregar componente</div>;
  }
};

const LazyLoader: React.FC<LazyLoaderProps> = ({ 
  children, 
  fallback = <DefaultFallback />,
  className = ""
}) => {
  return (
    <div className={className}>
      <ErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

export default LazyLoader;
