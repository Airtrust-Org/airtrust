import { useState } from 'react';
import { useApi } from '@/react-app/hooks/useApi';

type WorkforceProfile = 'flight' | 'maintenance' | 'other';
type CrewMember = {
  id: number;
  nome: string;
  nome_guerra: string | null;
  cargo: string | null;
  funcao: string | null;
  perfil_frms: WorkforceProfile;
};
type WorkforcePage = {
  items: CrewMember[];
  next_cursor: number | null;
  source: 'FUNCIONARIOS';
  interpretation: string;
};
type WorkforceResponse = {
  success: boolean;
  data: WorkforcePage;
  meta?: { tenant_id: number; profile_code: string; source: string };
};
const PROFILE_LABELS: Record<WorkforceProfile, string> = {
  flight: 'Função aeronáutica identificada',
  maintenance: 'Manutenção — verificar atribuição BOA',
  other: 'Função FRMS ainda não classificada',
};

/**
 * A read-only projection of AirTrust employees. Deliberately no individual
 * health data, no employee updates, no imported Costa do Sol data.
 */
export default function BombeirosWorkforcePanel() {
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const { data, error, loading, refetch } = useApi<WorkforceResponse>(
    `/api/bombeiros/frms/equipe?cursor=${cursor}&limit=50`,
    { requireAuth: true, bypassGetCache: true, staleTime: 0 },
  );
  const result = data?.success ? data.data : null;
  return (
    <section aria-label="Cadastro aeronáutico BOA" className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Equipe cadastrada no AirTrust</h2>
      <p className="text-sm text-slate-700">
        Leitura do cadastro corporativo da empresa Bombeiros, com seus próprios vínculos.
        Não inclui funcionários da Costa do Sol. Classificação de função não é autorização de missão.
      </p>
      {loading && <p role="status">Consultando cadastro da empresa…</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-rose-900">
        <p>Cadastro BOA indisponível neste contexto ou aguardando aprovação do perfil: {error}</p>
        <button type="button" className="underline" onClick={() => refetch()}>Tentar novamente</button>
      </div>}
      {!loading && !error && !result &&
        <p role="status">O cadastro não pôde ser verificado. Nenhuma pessoa foi presumida cadastrada.</p>}
      {result && !error && <>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr><th className="p-2">Funcionário</th><th className="p-2">Cargo</th><th className="p-2">Função</th><th className="p-2">Leitura FRMS</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.items.map(item =>
                <tr key={item.id}>
                  <td className="p-2 text-slate-900">{item.nome_guerra || item.nome}</td>
                  <td className="p-2">{item.cargo || 'Não informado'}</td>
                  <td className="p-2">{item.funcao || 'Não informada'}</td>
                  <td className="p-2">{PROFILE_LABELS[item.perfil_frms] ?? 'Não classificada'}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
        {result.items.length === 0 && <p>Nenhum funcionário ativo neste recorte do cadastro.</p>}
        <div className="flex items-center gap-3">
          <button type="button" disabled={history.length === 0}
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => {
              const updated = history.slice(0, -1);
              setCursor(history[history.length - 1]);
              setHistory(updated);
            }}>Página anterior</button>
          <button type="button" disabled={result.next_cursor == null}
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => {
              if (result.next_cursor == null) return;
              setHistory(previous => [...previous, cursor]);
              setCursor(result.next_cursor);
            }}>Próxima página</button>
        </div>
        <p className="text-xs text-slate-600">{result.interpretation}</p>
        <p className="text-xs text-slate-600">Origem: {result.source} · Perfil: {data?.meta?.profile_code ?? 'Não informado'}</p>
      </>}
    </section>
  );
}
