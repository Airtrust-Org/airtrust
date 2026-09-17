import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import {
  useAtualizarTripulante,
  useCriarTripulante,
  useTripulantes,
  type CvTripulante,
} from '@/react-app/hooks/useControleVoos';

type EligibleCrewMember = {
  id: number;
  nome: string;
  matricula: string | null;
  funcao_codigo: 'PIC' | 'SIC';
  funcao_nome: string;
};

type Envelope<T> = { success: boolean; data?: T | { data?: T }; error?: string };

function extract<T>(response: unknown): T {
  const envelope = response as Envelope<T>;
  if (!envelope?.success) throw new Error(envelope?.error || 'Falha na API');
  const payload = envelope.data;
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

export default function ControleVoosTripulacaoCard({
  vooId,
  aeronaveId,
  rdvVersion,
}: {
  vooId: number;
  aeronaveId: number | null;
  rdvVersion?: number;
}) {
  const { data: tripulantes = [], isLoading } = useTripulantes(vooId);
  const criar = useCriarTripulante();
  const atualizar = useAtualizarTripulante();
  const [eligible, setEligible] = useState<EligibleCrewMember[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [dialog, setDialog] = useState<{ mode: 'add' | 'replace'; target?: CvTripulante } | null>(null);
  const [funcao, setFuncao] = useState<CvTripulante['funcao']>('PIC');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!aeronaveId) return;
    let cancelled = false;
    setLoadingEligible(true);
    void apiClient.get<unknown>(`/controle-voos/voos/tripulantes-elegiveis?aeronave_id=${aeronaveId}`)
      .then((response) => { if (!cancelled) setEligible(extract<EligibleCrewMember[]>(response) || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar tripulantes elegíveis.'); })
      .finally(() => { if (!cancelled) setLoadingEligible(false); });
    return () => { cancelled = true; };
  }, [aeronaveId]);

  const assigned = useMemo(() => new Set(tripulantes.map((item) => item.funcionario_id)), [tripulantes]);
  const options = eligible.filter((item) => {
    if (assigned.has(item.id) && item.id !== dialog?.target?.funcionario_id) return false;
    if (funcao === 'PIC') return item.funcao_codigo === 'PIC';
    if (funcao === 'SIC') return item.funcao_codigo === 'PIC' || item.funcao_codigo === 'SIC';
    return true;
  });

  const openAdd = () => {
    const missingPic = !tripulantes.some((item) => item.funcao === 'PIC');
    setFuncao(missingPic ? 'PIC' : 'SIC');
    setFuncionarioId('');
    setError(null);
    setDialog({ mode: 'add' });
  };

  const openReplace = (target: CvTripulante) => {
    setFuncao(target.funcao);
    setFuncionarioId(String(target.funcionario_id));
    setError(null);
    setDialog({ mode: 'replace', target });
  };

  const save = async () => {
    if (!funcionarioId) return setError('Selecione o tripulante.');
    setError(null);
    try {
      if (dialog?.mode === 'replace' && dialog.target) {
        await atualizar.mutateAsync({
          vooId,
          tripulanteId: dialog.target.id,
          funcionario_id: Number(funcionarioId),
          funcao,
          ...(rdvVersion !== undefined ? { versao: rdvVersion } : {}),
        });
      } else {
        await criar.mutateAsync({ vooId, funcionario_id: Number(funcionarioId), funcao });
      }
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a tripulação.');
    }
  };

  return (
    <div id="tripulacao" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Tripulação</h2>
        <button type="button" onClick={openAdd} disabled={!aeronaveId || loadingEligible} className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> {tripulantes.length ? 'Adicionar tripulante' : 'Cadastrar tripulação'}
        </button>
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Carregando tripulação…</p> : tripulantes.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum tripulante cadastrado neste voo.</p>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {tripulantes.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.funcionario_nome || `Funcionário ${item.funcionario_id}`}</p>
                <p className="text-xs text-slate-500">{item.funcao}{item.funcionario_codigo_anac ? ` · ANAC ${item.funcionario_codigo_anac}` : ''}</p>
              </div>
              <button type="button" onClick={() => openReplace(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-600">
                <RefreshCw className="h-3.5 w-3.5" /> Trocar
              </button>
            </div>
          ))}
        </div>
      )}
      {error && !dialog && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white">{dialog.mode === 'replace' ? 'Trocar tripulante' : 'Cadastrar tripulante'}</h3>
              <button type="button" onClick={() => setDialog(null)} aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <label className="block text-sm">Função
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" value={funcao} onChange={(e) => { setFuncao(e.target.value as CvTripulante['funcao']); setFuncionarioId(''); }} disabled={dialog.mode === 'replace'}>
                  <option value="PIC">PIC — Comandante</option><option value="SIC">SIC — Segundo em comando</option><option value="COM">Comissário</option><option value="MEC">Mecânico</option><option value="OUTRO">Outro</option>
                </select>
              </label>
              <label className="block text-sm">Tripulante
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)} disabled={loadingEligible}>
                  <option value="">{loadingEligible ? 'Carregando…' : 'Selecione'}</option>
                  {options.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.matricula ? ` · ${item.matricula}` : ''} · {item.funcao_nome}</option>)}
                </select>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button type="button" onClick={() => setDialog(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Cancelar</button>
                <button type="button" onClick={save} disabled={criar.isPending || atualizar.isPending || !funcionarioId} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Salvar tripulação</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
