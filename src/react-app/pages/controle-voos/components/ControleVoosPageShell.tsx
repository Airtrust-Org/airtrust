import { useLocation } from 'react-router-dom';
import ModuleGovernanceBanner from '@/react-app/components/ModuleGovernanceBanner';
import ControleVoosPrototypeBanner from './ControleVoosPrototypeBanner';
import ControleVoosSubnav from './ControleVoosSubnav';

const DEMO_ROUTES = [
  { prefix: '/controle-voos/jornadas', label: 'Jornadas' },
  { prefix: '/controle-voos/indisponibilidades', label: 'Indisponibilidades' },
  { prefix: '/controle-voos/hangaragem', label: 'Hangaragem' },
];

export default function ControleVoosPageShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const demoRoute = DEMO_ROUTES.find(({ prefix }) => pathname.startsWith(prefix));

  return (
    <main className="w-full" role="main">
      <ControleVoosPrototypeBanner />
      {demoRoute && (
        <ModuleGovernanceBanner
          title={`${demoRoute.label} — preview controlado`}
          maturityLevel="N0"
          evidenceLevel="A0"
          isPrototype
          isRegulated={false}
          description="Tela em preview, fora do fluxo operacional conectado. Nao usar como registro operacional nem como dado oficial."
          className="mb-3"
        />
      )}
      <ControleVoosSubnav />
      {children}
    </main>
  );
}
