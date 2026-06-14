import { useMemo } from 'react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { MOCK_TRIPULANTES, MOCK_JORNADAS } from './data/controleVoosMockData';
import { formatHours } from './data/controleVoosUtils';

export default function ControleVoosJornadas() {
  const tripulantesComJornadas = useMemo(() => {
    return MOCK_TRIPULANTES.map((t) => {
      const jornadas = MOCK_JORNADAS.filter((j) => j.tripulanteId === t.id);
      const totalHorasJornada = jornadas.reduce((sum, j) => sum + j.horasJornada, 0);
      const totalHorasVoo = jornadas.reduce((sum, j) => sum + j.horasVoo, 0);
      return { ...t, jornadas, totalHorasJornada, totalHorasVoo };
    });
  }, []);

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="Jornadas — Integração FRMS" description="Visão consolidada de jornada, horas de voo e score FRMS por tripulante. Os dados são originados do módulo FRMS e complementados pelo registro de voo. — 13 de junho de 2026" />

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tripulante</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Função</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Início jornada</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Fim jornada</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Horas voo (hoje)</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Horas jornada (hoje)</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Horas voo (mês)</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Score FRMS</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tripulantesComJornadas.map((t) => {
                    const j = t.jornadas[0];
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{t.nome}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">Mat. {t.matricula}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{t.designacao}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{j?.horarioInicio || '—'}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{j?.horarioFim || '—'}</td>
                        <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300 text-right">{formatHours(t.totalHorasVoo)}</td>
                        <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300 text-right">{formatHours(t.totalHorasJornada)}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 text-right">{formatHours(t.horasMes)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-bold ${
                            t.frmsScore >= 85 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                            t.frmsScore >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          }`}>
                            {t.frmsScore}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center"><ControleVoosStatusBadge status={t.frmsStatus} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Score FRMS &lt; 70 = OK · 70-85 = Atenção · &gt; 85 = Bloqueado — dados demonstrativos
          </p>

          {/* Legenda */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">Legenda — Status FRMS</h2>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div className="flex items-center gap-2">
                <ControleVoosStatusBadge status="ok" />
                <span className="text-slate-600 dark:text-slate-400">OK — Tripulante apto para voo</span>
              </div>
              <div className="flex items-center gap-2">
                <ControleVoosStatusBadge status="atencao" />
                <span className="text-slate-600 dark:text-slate-400">Atenção — Score elevado. Avaliar antes de alocar.</span>
              </div>
              <div className="flex items-center gap-2">
                <ControleVoosStatusBadge status="bloqueado" />
                <span className="text-slate-600 dark:text-slate-400">Bloqueado — Tripulante NÃO pode ser alocado a voo.</span>
              </div>
            </div>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
