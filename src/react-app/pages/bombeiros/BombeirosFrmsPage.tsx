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
import BombeirosMonthlyReportPreview from './BombeirosMonthlyReportPreview';
import BombeirosWorkforcePanel from './BombeirosWorkforcePanel';

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
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
              aria-label="Origem operacional dos dados">
              <h2 className="font-semibold">Dados operacionais autenticados</h2>
              <p className="mt-1">
                A equipe e os relatórios abaixo são consultados na API do próprio tenant Bombeiros.
                Sem funcionário, check-in real, caso rastreável ou revisão científica válida,
                a informação correspondente permanece indisponível. Esta tela não importa
                dados de apresentação nem presume conformidade ou aptidão para voo.
              </p>
              <p className="mt-2">
                Os tripulantes registram seus autorrelatos no acesso individual de check-in;
                os gestores autorizados fazem o tratamento em sua fila setorial. O administrador
                consulta somente consolidados, sem visualizar informações pessoais de saúde.
              </p>
            </section>
            <BombeirosWorkforcePanel />
            <BombeirosMonthlyReportPreview />
            <p className="text-sm text-slate-600">
              O relatório exibido é uma prévia técnica não assinada. Não há cálculo
              científico homologado de risco de fadiga nem liberação automática de missão.
              Nenhum dado ou parâmetro da operação offshore é reutilizado.
            </p>
          </>
        )}
      </main>
    </AppLayout>
  );
}
