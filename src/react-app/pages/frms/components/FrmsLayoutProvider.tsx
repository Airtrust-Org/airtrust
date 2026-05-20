/**
 * FrmsLayoutProvider — wrapper de página FRMS (light mode AirTrust)
 * Usado em páginas standalone: FrmsConceitos, FrmsConfiguracoes, etc.
 */
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function FrmsLayoutProvider({ children }: Props) {
  return (
    <div className="min-h-screen bg-background-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-20 py-8 space-y-8">{children}</div>
    </div>
  );
}
