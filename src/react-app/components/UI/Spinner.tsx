import React from 'react';

interface SpinnerProps {
  fullScreen?: boolean;
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  centered?: boolean;
}

/**
 * Componente Spinner para estados de carregamento
 * Usado em lazy loading de rotas e componentes pesados
 *
 * @example
 * ```tsx
 * // Spinner inline
 * <Spinner message="Carregando dados..." />
 *
 * // Spinner fullscreen
 * <Spinner fullScreen message="Redirecionando..." />
 * ```
 */
export function Spinner({
  fullScreen = false,
  message = 'Carregando...',
  size = 'md',
  centered = true,
}: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 border-2',
    md: 'h-12 w-12 border-4',
    lg: 'h-16 w-16 border-4',
  };

  const containerClass = fullScreen
    ? 'fixed inset-0 z-modal flex items-center justify-center bg-white/80 backdrop-blur-sm'
    : centered
    ? 'flex items-center justify-center py-8'
    : 'flex items-start justify-start p-4';

  return (
    <div className={containerClass}>
      <div className="text-center">
        {/* Spinner animation */}
        <div className="flex justify-center">
          <div
            className={`${sizeClasses[size]} rounded-full border-blue-200 border-t-blue-600 animate-spin`}
          />
        </div>

        {/* Message */}
        {message && <p className="mt-3 text-sm text-gray-600 font-medium">{message}</p>}
      </div>
    </div>
  );
}

export default Spinner;
