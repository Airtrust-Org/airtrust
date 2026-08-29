import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import { useFrmsOperationalAccess } from '@/react-app/hooks/useFrmsOperationalAccess';
import FrmsFlightDashboard from './FrmsFlightDashboard';
import FrmsMaintenanceDashboard from './FrmsMaintenanceDashboard';
import FrmsMaintenanceCheckin from './FrmsMaintenanceCheckin';

export type FrmsManagementArea = 'operacoes' | 'manutencao';

function isTenantAdminRole(role: string | null | undefined): boolean {
  const normalized = String(role || '').trim().toUpperCase();
  return normalized === 'ADMIN' || normalized === 'ADMINISTRADOR';
}

export function resolveFrmsManagementArea(params: {
  requestedArea: string | null;
  canManageOperations: boolean;
  canManageMaintenance: boolean;
}): FrmsManagementArea {
  const { requestedArea, canManageOperations, canManageMaintenance } = params;

  if (requestedArea === 'manutencao' && canManageMaintenance) return 'manutencao';
  if (requestedArea === 'operacoes' && canManageOperations) return 'operacoes';
  if (canManageOperations) return 'operacoes';
  if (canManageMaintenance) return 'manutencao';
  return 'operacoes';
}

/**
 * Entrada canônica do FRMS.
 *
 * O colaborador de manutenção recebe apenas o próprio check-in. Gestores de
 * fadiga/FRMS, gestores de manutenção e administradores recebem as áreas de
 * gestão que o backend comprovou, sem misturar equipe de voo com manutenção.
 */
export default function FrmsDashboard() {
  const [searchParams] = useSearchParams();
  const access = useFrmsOperationalAccess();

  if (access.isLoading) {
    return (
      <AppLayout>
        <div className="space-y-3 p-4" aria-label="Carregando escopo do FRMS">
          <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
          <div className="h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
        </div>
      </AppLayout>
    );
  }

  if (access.isError || !access.data) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl p-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            Não foi possível confirmar seu escopo operacional do FRMS. Nenhum painel de equipe foi carregado.
            <button
              type="button"
              onClick={() => void access.refetch()}
              className="mt-3 block rounded-lg border border-red-300 px-3 py-2 font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950/50"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isMaintenanceWorker = access.data.frms_profile === 'maintenance';
  const wantsOwnMaintenanceCheckin = searchParams.get('view') === 'checkin';
  const canManageMaintenance = access.data.can_manage_maintenance === true;
  const isAdmin = isTenantAdminRole(access.data.administrative_role);
  const canManageOperations =
    isAdmin ||
    access.data.domains.includes('OPERACOES') ||
    access.data.domains.includes('FRMS') ||
    !canManageMaintenance;

  // Um Mecânico/Inspetor sem função de gestão nunca recebe painel de equipe.
  if (isMaintenanceWorker && !canManageMaintenance) {
    return <FrmsMaintenanceCheckin />;
  }

  // Quem também gerencia pode abrir explicitamente seu check-in pessoal.
  if (isMaintenanceWorker && wantsOwnMaintenanceCheckin) {
    return <FrmsMaintenanceCheckin />;
  }

  const area = resolveFrmsManagementArea({
    requestedArea: searchParams.get('area'),
    canManageOperations,
    canManageMaintenance,
  });

  if (area === 'manutencao' && canManageMaintenance) {
    return <FrmsMaintenanceDashboard />;
  }

  return <FrmsFlightDashboard />;
}
