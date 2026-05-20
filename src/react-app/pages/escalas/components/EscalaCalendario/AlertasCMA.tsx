// src/react-app/pages/escalas/components/EscalaCalendario/AlertasCMA.tsx

import type { AlertaCMA } from '../../hooks/queries/useEscalasQuery';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

interface AlertasCMAProps {
  alertas: AlertaCMA[];
  onMinimizar: () => void;
}

export default function AlertasCMA({ alertas, onMinimizar }: AlertasCMAProps) {
  if (alertas.length === 0) return null;

  const criticos = alertas.filter((a) => a.dias_para_vencer !== null && a.dias_para_vencer <= 15);
  const atencao = alertas.filter((a) => a.dias_para_vencer !== null && a.dias_para_vencer > 15);

  return (
    <div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-4 py-2">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-red-500 text-lg">⚠️</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-red-800">
              {alertas.length} tripulante{alertas.length !== 1 ? 's' : ''} com CMA a vencer
            </span>
            <span className="text-[10px] text-red-500">Exames serão agendados automaticamente</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {criticos.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 bg-red-100 border border-red-300 rounded-lg px-2 py-1"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <FuncionarioLink
                  funcionarioId={a.funcionario_id}
                  nome={a.funcionario_nome}
                  className="text-[11px] font-semibold text-red-800 hover:underline"
                />
                <span className="text-[10px] text-red-600">{a.dias_para_vencer}d para vencer</span>
              </div>
            ))}

            {atencao.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 bg-orange-100 border border-orange-200 rounded-lg px-2 py-1"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                <FuncionarioLink
                  funcionarioId={a.funcionario_id}
                  nome={a.funcionario_nome}
                  className="text-[11px] font-medium text-orange-800 hover:underline"
                />
                <span className="text-[10px] text-orange-600">
                  {a.dias_para_vencer}d para vencer
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onMinimizar}
          className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors text-xs"
          title="Minimizar alertas"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
