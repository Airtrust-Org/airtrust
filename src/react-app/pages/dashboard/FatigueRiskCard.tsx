import React from 'react';
import { Link } from 'react-router-dom';
import type { FrmsAlertaRaw } from './types';
import { FRMS_NIVEL_CONF } from './constants';

interface FatigueRiskCardProps {
  frmsAlertas: FrmsAlertaRaw[];
}

export const FatigueRiskCard = React.memo(function FatigueRiskCard({ frmsAlertas }: FatigueRiskCardProps) {
  const byTripulante = new Map<string, { nome: string; nivel: FrmsAlertaRaw['nivel']; detalhe: string; tripulanteId: string }>();

  for (const alerta of frmsAlertas) {
    const key = String(alerta.tripulante_id);
    const current = byTripulante.get(key);
    const weight = (n: string) => n === 'VIOLACAO' ? 4 : n === 'CRITICO' ? 3 : n === 'ATENCAO' ? 2 : 1;
    if (!current || weight(alerta.nivel) > weight(current.nivel)) {
      byTripulante.set(key, {
        nome: alerta.nome_tripulante || `Tripulante ${alerta.tripulante_id}`,
        nivel: alerta.nivel,
        detalhe: alerta.descricao || alerta.tipo || 'Alerta FRMS',
        tripulanteId: String(alerta.tripulante_id),
      });
    }
  }

  const itens = Array.from(byTripulante.values())
    .sort((a, b) => {
      const w = (n: string) => n === 'VIOLACAO' ? 4 : n === 'CRITICO' ? 3 : n === 'ATENCAO' ? 2 : 1;
      return w(b.nivel) - w(a.nivel);
    })
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
        <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Tripulantes em risco FRMS
        </h3>
      </div>
      {itens.length === 0 ? (
        <p className="px-4 py-5 text-xs text-slate-500 dark:text-slate-400">Sem alertas de fadiga no período.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {itens.map((item) => (
            <Link
              key={`${item.tripulanteId}-${item.nivel}`}
              to={`/frms/tripulante/${item.tripulanteId}`}
              className="block px-4 py-3 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{item.nome}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${FRMS_NIVEL_CONF[item.nivel].cls}`}>
                  {item.nivel}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.detalhe}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
});
