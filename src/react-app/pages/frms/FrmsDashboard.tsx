import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import { useFrmsOperationalAccess } from '@/react-app/hooks/useFrmsOperationalAccess';
import FrmsFlightDashboard from './FrmsFlightDashboard';
import FrmsMaintenanceDashboard from './FrmsMaintenanceDashboard';
import FrmsMaintenanceCheckin from './FrmsMaintenanceCheckin';

/**
 * Entrada canônica do FRMS.
 *
 * Coordenação de voo, gestão de manutenção e check-in de manutenção são
 * superfícies independentes. O backend decide o perfil individual por cargo
 * (Mecânico/Inspetor) e comprova gestão de manutenção por domínio/setores.
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
  const managesMaintenanceOnly =
    access.data.can_manage_maintenance && !access.data.domains.includes('OPERACOES');

  // Um gestor que também é Mecânico/Inspetor pode alternar explicitamente
  // para seu check-in pessoal. Um gestor sem cargo de manutenção nunca recebe
  // esse formulário apenas por manipular a URL.
  if (isMaintenanceWorker && wantsOwnMaintenanceCheckin) {
    return <FrmsMaintenanceCheckin />;
  }

  if (access.data.can_manage_maintenance && (isMaintenanceWorker || managesMaintenanceOnly)) {
    return <FrmsMaintenanceDashboard />;
  }

  if (isMaintenanceWorker) {
    return <FrmsMaintenanceCheckin />;
  }

  return <FrmsFlightDashboard />;
}
