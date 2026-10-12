import { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import { useTripulantes } from '@/react-app/hooks/useControleVoos';

type CrewFatigue = {
  funcionario_id: number;
  nome: string;
  funcao: string;
  checkin: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
  estado: string;
  fonte: string;
  score_fadiga: number | null;
  efetividade_pct: number | null;
  status_quinzena: string | null;
  tendencia: string | null;
  decisao: string | null;
  acao_recomendada: string | null;
  alertas: string[];
  dados_disponiveis: boolean;
};
type FatigueResponse = { success: boolean; data?: { date: string; tripulantes: CrewFatigue[] }; error?: string };

const COLOR: Record<string, string> = {
  NORMAL: 'bg-emerald-50 text-emerald-800',
  ATENCAO: 'bg-amber-50 text-amber-800',
  MITIGACAO_NECESSARIA: 'bg-orange-50 text-orange-800',
  CRITICO_VIOLACAO: 'bg-red-50 text-red-800',
  NAO_AVALIADO: 'bg-slate-100 text-slate-700',
};
const label = (value: string | null | undefined) => value ? value.replace(/_/g, ' ').toLowerCase() : 'Não informado';

export default function ControleVoosFadigaCard({ vooId, versao }: { vooId: number; versao: number }) {
  const { data: crew = [] } = useTripulantes(vooId);
  const fingerprint = crew.map((member) => `${member.funcionario_id}:${member.funcao}`).join(',');
  const [rows, setRows] = useState<CrewFatigue[]>([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void apiClient<FatigueResponse['data']>(`/controle-voos/voos/${vooId}/fadiga`)
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data || !Array.isArray(response.data.tripulantes)) {
          throw new Error(response.error || 'Resumo de fadiga indisponível.');
        }
        setRows(response.data.tripulantes);
        setDate(response.data.date);
      })
      .catch((cause) => {
        if (active) {
          setRows([]);
          setError(cause instanceof Error ? cause.message : 'Falha ao consultar o FRMS.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vooId, versao, fingerprint, reload]);

  const attention = rows.filter((r) => !r.dados_disponiveis || r.checkin !== 'RECEBIDO' ||
    r.estado !== 'NORMAL' || r.alertas.length > 0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900" aria-label="Fadiga dos tripulantes">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <Activity className="h-4 w-4 text-cyan-600" /> Fadiga da tripulação
        </h2>
        <button type="button" aria-label="Atualizar fadiga" onClick={() => setReload((v) => v + 1)}
          disabled={loading} className="rounded-lg border border-slate-300 p-1.5 text-slate-600 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {date && <p className="mb-3 text-xs text-slate-500">Data operacional: {date.split('-').reverse().join('/')}. Fonte: FRMS.</p>}
      {loading ? <p className="text-sm text-slate-500">Consultando fadiga diária e acumulada…</p> :
        error ? <p role="alert" className="text-sm text-amber-800">Não foi possível verificar a fadiga: {error}. Confirme no painel FRMS antes da decisão operacional.</p> :
        rows.length === 0 ? <p className="text-sm text-slate-500">Nenhum tripulante disponível para avaliação.</p> :
        <div className="space-y-3">
          {attention.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            {attention.length} tripulante(s) com pendência, atenção ou dados insuficientes. Verifique antes da decisão operacional.
          </p>}
          {rows.map((row) => (
            <div key={row.funcionario_id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.funcao} · {row.nome}</p>
                <span className={`rounded-md px-2 py-1 text-xs font-medium ${COLOR[row.estado] || COLOR.NAO_AVALIADO}`}>
                  {label(row.estado)}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><dt className="text-slate-500">Fadiga diária</dt>
                  <dd className={row.checkin === 'RECEBIDO' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                    {row.checkin === 'RECEBIDO' ? 'Registrada' : label(row.checkin)}
                  </dd></div>
                <div><dt className="text-slate-500">Quinzena</dt><dd>{label(row.status_quinzena)}</dd></div>
                <div><dt className="text-slate-500">Score de fadiga</dt><dd>{row.score_fadiga ?? 'Sem dado'}</dd></div>
                <div><dt className="text-slate-500">Efetividade</dt><dd>{row.efetividade_pct == null ? 'Sem dado' : `${row.efetividade_pct.toFixed(0)}%`}</dd></div>
                <div><dt className="text-slate-500">Tendência</dt><dd>{label(row.tendencia)}</dd></div>
                <div><dt className="text-slate-500">Fonte da jornada</dt><dd>{label(row.fonte)}</dd></div>
              </dl>
              {row.acao_recomendada && <p className="mt-2 text-xs text-slate-700 dark:text-slate-300"><strong>Ação:</strong> {row.acao_recomendada}</p>}
              {row.alertas.length > 0 && <p className="mt-2 text-xs text-amber-700">Alertas: {row.alertas.map(label).join(' · ')}</p>}
              {!row.dados_disponiveis && <p className="mt-2 text-xs text-amber-700">Sem dados suficientes no FRMS; não interpretar como condição normal.</p>}
            </div>
          ))}
          <p className="text-xs text-slate-500">Resumo informativo do FRMS, não substitui a decisão da Coordenação ou o procedimento operacional.</p>
        </div>}
    </section>
  );
}
