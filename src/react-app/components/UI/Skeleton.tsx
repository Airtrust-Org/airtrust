/**
 * Skeleton Loaders - Placeholder animados para melhor UX durante carregamento
 *
 * Benefícios:
 * - Reduz perceived loading time (perceived vs real)
 * - Mantém layout enquanto carrega (Cumulative Layout Shift = 0)
 * - Melhor UX que spinners genéricos
 * - Contexual feedback (entender padrão do conteúdo)
 * - Shimmer effect mais natural (gradiente deslizante)
 */

import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  circle?: boolean;
}

/**
 * Componente base de Skeleton com shimmer effect
 * @param width - Largura do skeleton (padrão: 100%)
 * @param height - Altura do skeleton (padrão: 20px)
 * @param circle - Se true, renderiza como círculo
 */
export function Skeleton({
  width = '100%',
  height = '20px',
  className = '',
  circle = false,
}: SkeletonProps) {
  const w = typeof width === 'number' ? `${width}px` : width;
  const h = typeof height === 'number' ? `${height}px` : height;
  const borderRadius = circle ? '50%' : 'var(--radius, 6px)';

  return (
    <div
      className={cn(
        // Base
        'relative overflow-hidden bg-slate-200 dark:bg-slate-700',
        // Shimmer effect - gradiente deslizante da esquerda pra direita
        'before:absolute before:inset-0',
        'before:-translate-x-full',
        'before:animate-shimmer',
        'before:bg-gradient-to-r',
        'before:from-transparent before:via-white/30 dark:before:via-white/10 before:to-transparent',
        className,
      )}
      style={{
        width: w,
        height: h,
        borderRadius,
      }}
    />
  );
}

// Helper para combinar classNames
function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Skeleton para Card de Funcionário/Habilitação/etc
 */
export function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      {/* Header com avatar + title */}
      <div className="flex items-center gap-3">
        <Skeleton width={48} height={48} circle className="flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton width="70%" height={16} />
          <Skeleton width="50%" height={14} />
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2">
        <Skeleton width="100%" height={14} />
        <Skeleton width="80%" height={14} />
      </div>

      {/* Footer com buttons */}
      <div className="flex gap-2 pt-2 border-t border-slate-200">
        <Skeleton width="80px" height={32} />
        <Skeleton width="80px" height={32} />
      </div>
    </div>
  );
}

/**
 * Skeleton para Lista de Cards
 */
export function SkeletonCardList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton para Tabela
 */
export function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-slate-200">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width="90%" height={16} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <table className="w-full">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * Skeleton para VirtualTable (tabela virtualizada)
 * - Múltiplas linhas com shimmer
 */
export function SkeletonVirtualTable({
  rows = 8,
  columns = 6,
  height = '600px',
}: {
  rows?: number;
  columns?: number;
  height?: string;
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden" style={{ height }}>
      {/* Header */}
      <div className="sticky top-0 bg-slate-50 border-b border-slate-200 flex p-0">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={`header-${i}`} className="flex-1 px-6 py-3 min-w-[100px]">
            <Skeleton width="60%" height={14} />
          </div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex border-b border-slate-200">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={`cell-${rowIndex}-${colIndex}`} className="flex-1 px-6 py-4 min-w-[100px]">
                <Skeleton width={colIndex === 0 ? '70%' : '90%'} height={16} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton para Form
 */
export function SkeletonForm({ fields = 3 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {/* Título */}
      <Skeleton width="40%" height={24} />

      {/* Fields */}
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton width="30%" height={14} />
          <Skeleton width="100%" height={40} />
        </div>
      ))}

      {/* Button */}
      <Skeleton width="120px" height={40} />
    </div>
  );
}

/**
 * Skeleton para Header/Title
 */
export function SkeletonHeader() {
  return (
    <div className="space-y-2">
      <Skeleton width="40%" height={28} />
      <Skeleton width="60%" height={16} />
    </div>
  );
}

/**
 * Skeleton para Linha de texto (múltiplas linhas)
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={14} />
      ))}
    </div>
  );
}

/**
 * Skeleton para Avatar com info ao lado
 */
export function SkeletonAvatar() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton width={64} height={64} circle />
      <div className="flex-1 space-y-2">
        <Skeleton width="70%" height={18} />
        <Skeleton width="50%" height={14} />
      </div>
    </div>
  );
}

/**
 * Skeleton para Image
 */
export function SkeletonImage({
  width = '100%',
  height = '300px',
}: {
  width?: string | number;
  height?: string | number;
}) {
  return <Skeleton width={width} height={height} className="rounded" />;
}

/**
 * Provider wrapper que facilita uso de skeletons com suspense
 */
export function SkeletonProvider({
  children,
  isLoading,
  skeleton,
}: {
  children: React.ReactNode;
  isLoading: boolean;
  skeleton: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  return <>{children}</>;
}

export default Skeleton;
