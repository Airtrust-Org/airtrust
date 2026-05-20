/**
 * Gate — Renderização condicional baseada em permissões
 *
 * Uso:
 *   <Gate permission="admin.usuarios">
 *     <UsuariosPage />
 *   </Gate>
 *
 *   <Gate permission={['funcionarios.edit', 'funcionarios.delete']} any>
 *     <EditButton />
 *   </Gate>
 *
 *   <Gate permission="admin.config" fallback={<p>Sem acesso</p>}>
 *     <CriticalSettings />
 *   </Gate>
 */

import type { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';

interface GateProps {
  /** Permissão ou array de permissões necessárias */
  permission: string | string[];
  /** Se true, basta ter qualquer uma das permissões (OR). Padrão: AND */
  any?: boolean;
  /** Conteúdo exibido se não tiver permissão (padrão: null) */
  fallback?: ReactNode;
  children: ReactNode;
}

export function Gate({ permission, any: anyMode = false, fallback = null, children }: GateProps) {
  const { can, canAll } = usePermissions();

  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasAccess = anyMode ? can(permissions) : canAll(permissions);

  if (!hasAccess) return <>{fallback}</>;
  return <>{children}</>;
}
