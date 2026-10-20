/**
 * Entrada administrativa EXCLUSIVA para a aviação dos Bombeiros.
 * Reutiliza o cadastro corporativo de funcionarios do AirTrust, com o
 * empresa_id do usuário no backend — jamais duplica os funcionários.
 *
 * Esta barreira visual é de UX. API /api/bombeiros/frms tem guardas
 * independentes e não autoriza acesso apenas por navegação de frontend.
 */
import AppLayout from '@/react-app/components/AppLayout';
import { useAuth } from '@/react-app/hooks/useAuth';
import FrmsMonthlyConsolidated from '../frms/FrmsMonthlyConsolidated';
import BombeirosWorkforcePanel from './BombeirosWorkforcePanel';
import BombeirosMethodologyDemo from './BombeirosMethodologyDemo';

export function isBombeirosPortalTenant(
  empresa: { id: number; codigo: string } | null | undefined,
): boolean {
  return Boolean(empresa && empresa.id > 0 && empresa.id !== 6 && empresa.codigo === 'bombeiros');
}

export default function BombeirosFrmsPage() {
  const { empresas, empresaAtualId } = useAuth();
  const active = empresas.find(item => item.id === empresaAtualId);
  const allowed = isBombeirosPortalTenant(active);
  return (
    <AppLayout>
      <main className="space-y-5 p-2">
        {!allowed ? (
          <div role="alert" className="rounded-xl border border-red-300 bg-white p-4">
            <h1 className="text-xl font-semibold text-slate-900">Aviação dos Bombeiros — acesso separado</h1>
            <p className="mt-2 text-sm text-slate-700">
              Este espaço é exclusivo da empresa Bombeiros. Nenhum dado da Costa do Sol
              ou de outro tenant é consultado por esta página.
            </p>
          </div>
        ) : (
          <>
            <header className="rounded-xl border border-slate-300 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                BOA/CBMMG — tenant exclusivo
              </p>
              <h1 className="text-2xl font-bold text-slate-950">FRMS — Aviação dos Bombeiros</h1>
              <p className="mt-2 text-sm text-slate-700">
                Administração de fadiga em ambiente segregado. O cadastro e os vínculos
                de funcionários pertencem exclusivamente à empresa selecionada.
                Perfil regulatório próprio FIREFIGHTER_AVIATION exigido no servidor.
              </p>
              <a href="/funcionarios" className="mt-3 inline-flex rounded-md border border-slate-400 px-3 py-2 text-sm font-semibold text-slate-800">
                Cadastro de funcionários da empresa
              </a>
            </header>
            <BombeirosWorkforcePanel />
            <BombeirosMethodologyDemo />
            <FrmsMonthlyConsolidated />
            <p className="text-sm text-slate-600">
              Esta prévia não é relatório mensal assinado nem comprova integralmente a licitação.
              Operações e parâmetros do FRMS offshore não são utilizados como configuração padrão.
            </p>
          </>
        )}
      </main>
    </AppLayout>
  );
}
