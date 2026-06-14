import { useLocation } from 'react-router-dom';
import ModuleGovernanceBanner from '@/react-app/components/ModuleGovernanceBanner';
import ControleVoosPrototypeBanner from './ControleVoosPrototypeBanner';
import ControleVoosSubnav from './ControleVoosSubnav';

const DEMO_ROUTES = [
  { prefix: '/controle-voos/jornadas', label: 'Jornadas' },
  { prefix: '/controle-voos/indisponibilidades', label: 'Indisponibilidades' },
  { prefix: '/controle-voos/hangaragem', label: 'Hangaragem' },
  { prefix: '/controle-voos/relatorios', label: 'Relatórios' },
  { prefix: '/controle-voos/tabelas', label: 'Tabelas' },
];

export default function ControleVoosPageShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const demoRoute = DEMO_ROUTES.find(({ prefix }) => pathname.startsWith(prefix));

  return (
    <div className="w-full">
      <ControleVoosPrototypeBanner />
      {demoRoute && (
        <ModuleGovernanceBanner
          title={`${demoRoute.label} — tela demonstrativa`}
          maturityLevel="N0"
          evidenceLevel="A0"
          isPrototype
          isRegulated={false}
          description="Tela demonstrativa fora do fluxo operacional N1 conectado ao backend. Não usar como registro operacional."
          className="mb-3"
        />
      )}
      <ControleVoosSubnav />
      {children}
    </div>
  );
}
