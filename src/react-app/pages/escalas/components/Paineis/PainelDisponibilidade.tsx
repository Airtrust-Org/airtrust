import { useMemo } from 'react';
import { AlertTriangle, CalendarCheck, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  useAeronavesQuery,
  useTripulantesOperacionaisQuery,
} from '../../hooks/queries/useEscalasQuery';

interface PainelDisponibilidadeProps {
  mes: number;
  ano: number;
  escalaId?: string;
  aeronaveHint?: string | null;
}

function formatarStatus(status: string) {
  switch (status) {
    case 'APTO':
      return 'Apto';
    case 'ATENCAO_CMA':
      return 'Atencao CMA';
    case 'ATENCAO_FRMS':
      return 'Atencao FRMS';
    case 'BLOQUEADO_CMA':
      return 'Bloqueado CMA';
    case 'BLOQUEADO_FRMS':
      return 'Bloqueado FRMS';
    default:
      return status;
  }
}

export default function PainelDisponibilidade({
  mes,
  ano,
  escalaId,
  aeronaveHint,
}: PainelDisponibilidadeProps) {
  const { data: aeronaves } = useAeronavesQuery();

  const aeronaveSelecionada = useMemo(() => {
    const hint = (aeronaveHint || '').trim().toUpperCase();
    if (!hint) return null;

    return (
      (aeronaves || []).find((aeronave) => {
        const modelo = (aeronave.modelo || '').trim().toUpperCase();
        const prefixo = (aeronave.prefixo || '').trim().toUpperCase();
        return (
          hint === modelo || hint === prefixo || hint.includes(modelo) || modelo.includes(hint)
        );
      }) || null
    );
  }, [aeronaveHint, aeronaves]);

  const { data, isLoading } = useTripulantesOperacionaisQuery(
    aeronaveSelecionada?.id,
    escalaId,
    true,
  );

  const items = data?.tripulantes ?? [];

  const { aptos, atencao, bloqueados } = useMemo(() => {
    const aptosLista = items.filter((item) => item.status_operacional === 'APTO');
    const atencaoLista = items.filter((item) => item.status_operacional.startsWith('ATENCAO'));
    const bloqueadosLista = items.filter((item) => item.status_operacional.startsWith('BLOQUEADO'));
    return { aptos: aptosLista, atencao: atencaoLista, bloqueados: bloqueadosLista };
  }, [items]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-slate-500" />
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Prontidao Operacional</h3>
            <p className="text-[11px] text-gray-500">
              {aeronaveSelecionada
                ? `${aeronaveSelecionada.modelo}${aeronaveSelecionada.prefixo ? ` • ${aeronaveSelecionada.prefixo}` : ''}`
                : `Mes ${String(mes).padStart(2, '0')}/${ano}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {aptos.length}
          </span>
          <span className="flex items-center gap-1 text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {atencao.length}
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {bloqueados.length}
          </span>
        </div>
      </div>

      {!aeronaveSelecionada && (
        <div className="p-6 text-center text-gray-400 text-sm">
          Sem contexto de aeronave para calcular prontidao operacional.
        </div>
      )}

      {aeronaveSelecionada && items.length === 0 && (
        <div className="p-6 text-center text-gray-400 text-sm">
          {data?.resumo.sem_habilitacao || 'Nenhum tripulante operacional encontrado'}
        </div>
      )}

      <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
        {bloqueados.map((item) => (
          <div key={item.funcionario_id} className="px-4 py-3 flex items-start gap-2 bg-red-50/50">
            <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{item.nome}</p>
              <p className="text-[10px] text-red-600 truncate">
                {formatarStatus(item.status_operacional)}
              </p>
            </div>
          </div>
        ))}

        {atencao.map((item) => (
          <div
            key={item.funcionario_id}
            className="px-4 py-3 flex items-start gap-2 bg-amber-50/50"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{item.nome}</p>
              <p className="text-[10px] text-amber-700 truncate">
                {formatarStatus(item.status_operacional)}
                {item.frms_score !== null ? ` • FRMS ${item.frms_score}` : ''}
              </p>
            </div>
          </div>
        ))}

        {aptos.map((item) => (
          <div key={item.funcionario_id} className="px-4 py-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{item.nome}</p>
              <p className="text-[10px] text-gray-500 truncate">
                {item.habilitacoes.map((habilitacao) => habilitacao.modelo_codigo).join(', ') ||
                  'Sem habilitacao mapeada'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
