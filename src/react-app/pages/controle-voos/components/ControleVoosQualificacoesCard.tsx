import { useEffect, useState } from 'react';
import { Award, RefreshCw } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import { useTripulantes } from '@/react-app/hooks/useControleVoos';

type QualificationIssue = {
  nome: string;
  codigo: string;
  vencimento: string | null;
  status: 'VENCIDA' | 'VENCENDO' | 'SEM_VALIDADE';
};
type MemberQualifications = {
  funcionario_id: number;
  total_registros_atuais: number;
  validas: number;
  vencendo: number;
  vencidas: number;
  sem_validade: number;
  avisos: QualificationIssue[];
};
type Response = { date: string; tripulantes: MemberQualifications[]; info?: string };

export default function ControleVoosQualificacoesCard({ vooId, versao }: { vooId: number; versao: number }) {
  const { data: crew = [] } = useTripulantes(vooId);
  const fingerprint = crew.map((member) => String(member.funcionario_id)).join(',');
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void apiClient<Response>(`/controle-voos/voos/${vooId}/qualificacoes`)
      .then((res) => {
        if (!active) return;
        if (!res.success || !res.data || !Array.isArray(res.data.tripulantes)) {
          throw new Error(res.error || 'Não foi possível consultar qualificações.');
        }
        setData(res.data);
      })
      .catch((cause) => {
        if (active) {
          setData(null);
          setError(cause instanceof Error ? cause.message : 'Falha ao consultar qualificações.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vooId, versao, fingerprint, revision]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
      aria-label="Qualificações da tripulação">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <Award className="h-4 w-4 text-blue-600" /> Qualificações da tripulação
        </h2>
        <button type="button" aria-label="Atualizar qualificações" onClick={() => setRevision((v) => v + 1)}
          disabled={loading} className="rounded-lg border border-slate-300 p-1.5 text-slate-600 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {loading ? <p className="text-sm text-slate-500">Consultando registros de qualificação…</p> :
        error ? <p role="alert" className="text-sm text-amber-800">
          Qualificações não verificadas: {error}. Consulte o módulo Qualificações antes da decisão.
        </p> : !data || data.tripulantes.length === 0 ?
        <p className="text-sm text-slate-500">Nenhuma tripulação registrada para consulta.</p> : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Validades na data de {data.date.split('-').reverse().join('/')}. Apenas registros existentes; requisitos obrigatórios ausentes não são avaliados.
          </p>
          {data.tripulantes.map((item) => {
            const member = crew.find((c) => c.funcionario_id === item.funcionario_id);
            const name = member?.funcionario_nome || `Funcionário ${item.funcionario_id}`;
            const pending = item.vencidas + item.vencendo + item.sem_validade;
            return (
              <div key={item.funcionario_id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {member?.funcao || 'Tripulante'} · {name}
                  </span>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${pending > 0 || item.total_registros_atuais === 0
                    ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                    {item.total_registros_atuais === 0 ? 'Sem registros' : `${pending} registro(s) para conferir`}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {item.validas} vigente(s) · {item.vencendo} vencendo em até 30 dias · {item.vencidas} vencida(s) · {item.sem_validade} sem validade informada
                </p>
                {item.avisos.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-400">
                    {item.avisos.map((issue, idx) => (
                      <li key={`${issue.codigo}-${idx}`}>
                        {issue.nome}: {issue.status === 'SEM_VALIDADE' ? 'validade não informada' :
                          `${issue.status === 'VENCIDA' ? 'vencida' : 'vencendo'} em ${issue.vencimento?.split('-').reverse().join('/')}`}
                      </li>
                    ))}
                    {pending > item.avisos.length && <li>Outros {pending - item.avisos.length} registro(s) para consultar no módulo Qualificações.</li>}
                  </ul>
                )}
              </div>
            );
          })}
          <p className="text-xs text-slate-500">
            Resumo informativo de validade: não atesta habilitação na aeronave nem substitui a verificação da matriz de requisitos.
          </p>
        </div>
      )}
    </section>
  );
}
