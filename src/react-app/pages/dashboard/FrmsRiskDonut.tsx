import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { FrmsAlertaRaw } from './types';

interface FrmsRiskDonutProps {
  frmsAlertas: FrmsAlertaRaw[];
}

const DONUT_DATA = [
  { nivel: 'VIOLACAO' as const, name: 'Violação', color: '#dc2626' },
  { nivel: 'CRITICO' as const, name: 'Crítico', color: '#ef4444' },
  { nivel: 'ATENCAO' as const, name: 'Atenção', color: '#f59e0b' },
  { nivel: 'AVISO' as const, name: 'Aviso', color: '#94a3b8' },
];

const CENTER = 72;
const OUTER_RADIUS = 62;
const INNER_RADIUS = 36;

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(angleInRadians), y: cy + radius * Math.sin(angleInRadians) };
}

function describeArc(startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(CENTER, CENTER, OUTER_RADIUS, endAngle);
  const endOuter = polarToCartesian(CENTER, CENTER, OUTER_RADIUS, startAngle);
  const startInner = polarToCartesian(CENTER, CENTER, INNER_RADIUS, endAngle);
  const endInner = polarToCartesian(CENTER, CENTER, INNER_RADIUS, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArcFlag} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
}

export const FrmsRiskDonut = React.memo(function FrmsRiskDonut({ frmsAlertas }: FrmsRiskDonutProps) {
  const navigate = useNavigate();
  const mesLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const data = DONUT_DATA.map((item) => ({
    ...item,
    value: frmsAlertas.filter((f) => f.nivel === item.nivel).length,
  }));

  const total = data.reduce((acc, item) => acc + item.value, 0);

  const segments = (() => {
    if (total === 0) {
      return [{ key: 'EMPTY', path: describeArc(0, 359.999), color: '#e2e8f0', nivel: null as string | null }];
    }
    let angle = 0;
    return data
      .filter((item) => item.value > 0)
      .map((item) => {
        const sweep = (item.value / total) * 360;
        const startAngle = angle;
        const endAngle = angle + sweep;
        angle = endAngle;
        return { key: item.nivel, path: describeArc(startAngle, endAngle), color: item.color, nivel: item.nivel };
      });
  })();

  return (
    <section className="h-full rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label={`Distribuição de alertas FRMS - ${mesLabel}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            FRMS · {mesLabel}
          </p>
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Distribuição de alertas
          </h3>
        </div>
        <Link to="/frms/alertas" className="text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400">
          Ver painel
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 144 144" className="h-36 w-36" role="img" aria-label={`Gráfico de pizza com ${total} alertas FRMS no total`}>
            {segments.map((segment) => (
              <path
                key={segment.key}
                d={segment.path}
                fill={segment.color}
                className={segment.nivel ? 'cursor-pointer transition-opacity hover:opacity-80 focus-visible:opacity-80' : ''}
                tabIndex={segment.nivel ? 0 : undefined}
                role={segment.nivel ? 'button' : undefined}
                aria-label={segment.nivel ? `${segment.nivel}: ${data.find(d => d.nivel === segment.nivel)?.value ?? 0} alertas` : undefined}
                onClick={() => { if (segment.nivel) navigate(`/frms/alertas?nivel=${segment.nivel}`); }}
                onKeyDown={(e) => {
                  if (segment.nivel && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    navigate(`/frms/alertas?nivel=${segment.nivel}`);
                  }
                }}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-center dark:bg-slate-900">
            <p className="text-xl font-black text-slate-900 dark:text-slate-100">{total}</p>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Alertas</p>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {data.map((item) => (
            <Link
              key={item.nivel}
              to={`/frms/alertas?nivel=${item.nivel}`}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:bg-slate-800/50 dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.value}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
        <Link
          to="/frms/alertas"
          className="flex items-center justify-between text-xs font-bold text-slate-500 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-slate-400 dark:hover:text-slate-200"
        >
          <span>Abrir módulo FRMS completo</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
});
