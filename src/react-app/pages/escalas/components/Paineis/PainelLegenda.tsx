// FIX: [BUG 1] - Legend now renders active event types from API config with icon, color, and name.
// src/react-app/pages/escalas/components/Paineis/PainelLegenda.tsx
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import { Q1, Q2 } from '../../constants/escalaTokens';
import { useTiposEventoResolvidos } from '../../hooks/useTiposEventoResolvidos';

export default function PainelLegenda() {
  const { tiposEventoVisiveis, toggleTipoEvento } = useEscalaStore();
  const { configMap, tiposAtivos, loading } = useTiposEventoResolvidos();
  const tiposVisiveis = tiposAtivos.filter((tipo) => tiposEventoVisiveis.includes(tipo));

  return (
    <div
      className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-2"
      data-testid="painel-legenda-escala"
    >
      <div className="flex items-center gap-4 flex-wrap md:flex-nowrap md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex-shrink-0">
              Tipos
            </span>
            {loading && tiposAtivos.length === 0 && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                Carregando tipos...
              </span>
            )}
            {!loading && tiposAtivos.length === 0 && (
              <span className="rounded-full border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                Nenhum tipo ativo configurado
              </span>
            )}
            {tiposAtivos.map((tipo) => {
              const conf = configMap[tipo];
              const cor = conf.cor;
              const label = conf.label;
              const ativo = tiposEventoVisiveis.includes(tipo);
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => toggleTipoEvento(tipo)}
                  className={[
                    'flex items-center gap-1.5 text-[11px] font-medium rounded-full border px-2.5 py-1 transition-all',
                    ativo
                      ? 'text-slate-700 border-slate-200 bg-white'
                      : 'text-slate-400 border-slate-100 bg-slate-50 opacity-30 hover:opacity-70',
                  ].join(' ')}
                  title={`${ativo ? 'Ocultar' : 'Mostrar'} ${label}`}
                >
                  <span
                    className="w-4 h-4 rounded flex-shrink-0"
                    style={{ backgroundColor: cor }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden md:flex flex-shrink-0 items-center gap-3 border-l border-slate-200 pl-4">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
            Marcadores
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className={cn('inline-block h-3 w-3 flex-shrink-0 rounded', Q1.accent)} />
            {Q1.short}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className={cn('inline-block h-3 w-3 flex-shrink-0 rounded', Q2.accent)} />
            {Q2.short}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-emerald-600">
            <CheckCircle2 className="w-3 h-3" />
            OK
          </span>
        </div>
      </div>
    </div>
  );
}
