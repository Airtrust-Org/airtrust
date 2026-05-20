/**
 * MKT-02: Version Comparison View
 * Shows a diff-style comparison between two escala states.
 * Currently compares current state vs published snapshot.
 */

import { useMemo } from 'react';
import { ArrowLeftRight, X, History, Plus, Minus, CheckCircle } from 'lucide-react';
import type { EscalaEvento, EscalaTripulacao } from '../../hooks/queries/useEscalasQuery';

/** Format ISO date (YYYY-MM-DD) to DD/MM/YYYY */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

interface ComparacaoVersaoProps {
  tripulacoes: EscalaTripulacao[];
  eventos: EscalaEvento[];
  /** Snapshot data (previously saved state) — if null, comparison unavailable */
  snapshot?: {
    tripulacoes: EscalaTripulacao[];
    eventos: EscalaEvento[];
    savedAt: string;
    revisao?: number;
    publicado_em?: string | null;
  } | null;
  /** Label da revisão exibida (ex: "Revisão 2") */
  revisaoLabel?: string;
  onClose: () => void;
}

export default function ComparacaoVersao({
  tripulacoes,
  eventos,
  snapshot,
  revisaoLabel,
  onClose,
}: ComparacaoVersaoProps) {
  const diff = useMemo(() => {
    if (!snapshot) return null;

    const currentEventIds = new Set(eventos.map((e) => e.id));
    const snapshotEventIds = new Set(snapshot.eventos.map((e) => e.id));

    const adicionados = eventos.filter((e) => !snapshotEventIds.has(e.id));
    const removidos = snapshot.eventos.filter((e) => !currentEventIds.has(e.id));

    // Changed: exist in both but different
    const alterados = eventos.filter((e) => {
      const old = snapshot.eventos.find((o) => o.id === e.id);
      if (!old) return false;
      return (
        old.tipo_evento !== e.tipo_evento ||
        old.data_inicio !== e.data_inicio ||
        old.data_fim !== e.data_fim ||
        old.turno !== e.turno ||
        old.status !== e.status
      );
    });

    const currentTripIds = new Set(tripulacoes.map((t) => t.id));
    const snapshotTripIds = new Set(snapshot.tripulacoes.map((t) => t.id));
    const tripAdicionadas = tripulacoes.filter((t) => !snapshotTripIds.has(t.id));
    const tripRemovidas = snapshot.tripulacoes.filter((t) => !currentTripIds.has(t.id));

    return { adicionados, removidos, alterados, tripAdicionadas, tripRemovidas };
  }, [eventos, tripulacoes, snapshot]);

  return (
    <div className="fixed inset-0 z-modal bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Comparação de Versões</h2>
              <p className="text-xs text-gray-500">
                {snapshot
                  ? revisaoLabel
                    ? `Comparando com ${revisaoLabel}`
                    : snapshot.revisao !== undefined
                      ? `Comparando com ${snapshot.revisao === 0 ? 'publicação inicial' : `Revisão ${snapshot.revisao}`}`
                      : `Snapshot de ${snapshot.savedAt}`
                  : 'Nenhum snapshot disponível'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!diff ? (
            <div className="text-center py-12 text-gray-400">
              <History className="w-10 h-10 mb-2 mx-auto" />
              <p className="text-sm">Nenhum snapshot salvo para comparação.</p>
              <p className="text-xs mt-1">Publique ou aprove a escala para criar um snapshot.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{diff.adicionados.length}</p>
                  <p className="text-xs text-green-700">Adicionados</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-red-600">{diff.removidos.length}</p>
                  <p className="text-xs text-red-700">Removidos</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-amber-600">{diff.alterados.length}</p>
                  <p className="text-xs text-amber-700">Alterados</p>
                </div>
              </div>

              {/* Tripulações changes */}
              {(diff.tripAdicionadas.length > 0 || diff.tripRemovidas.length > 0) && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-600 mb-2">Tripulações</h3>
                  <div className="space-y-1">
                    {diff.tripAdicionadas.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-800"
                      >
                        <Plus className="w-4 h-4" />
                        {t.pic_nome}
                        {t.sic_nome ? ` + ${t.sic_nome}` : ''}
                      </div>
                    ))}
                    {diff.tripRemovidas.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-800 line-through"
                      >
                        <Minus className="w-4 h-4" />
                        {t.pic_nome}
                        {t.sic_nome ? ` + ${t.sic_nome}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Event changes */}
              {diff.adicionados.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-green-700 mb-2">
                    + Eventos Adicionados
                  </h3>
                  <div className="space-y-1">
                    {diff.adicionados.slice(0, 20).map((e) => (
                      <div
                        key={e.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-800"
                      >
                        {e.funcionario_nome} — {e.tipo_evento} — {fmtDate(e.data_inicio)}
                      </div>
                    ))}
                    {diff.adicionados.length > 20 && (
                      <p className="text-xs text-gray-400">
                        ...e mais {diff.adicionados.length - 20}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {diff.removidos.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-red-700 mb-2">− Eventos Removidos</h3>
                  <div className="space-y-1">
                    {diff.removidos.slice(0, 20).map((e) => (
                      <div
                        key={e.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-800 line-through"
                      >
                        {e.funcionario_nome} — {e.tipo_evento} — {fmtDate(e.data_inicio)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diff.alterados.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-amber-700 mb-2">~ Eventos Alterados</h3>
                  <div className="space-y-1">
                    {diff.alterados.slice(0, 20).map((e) => (
                      <div
                        key={e.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800"
                      >
                        {e.funcionario_nome} — {e.tipo_evento} — {fmtDate(e.data_inicio)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diff.adicionados.length === 0 &&
                diff.removidos.length === 0 &&
                diff.alterados.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle className="w-8 h-8 mb-2 mx-auto text-gray-400" />
                    <p className="text-sm">Nenhuma diferença detectada</p>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
