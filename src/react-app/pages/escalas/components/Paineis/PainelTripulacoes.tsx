// src/react-app/pages/escalas/components/Paineis/PainelTripulacoes.tsx

import { useState } from 'react';
import type { EscalaTripulacao } from '../../hooks/queries/useEscalasQuery';

interface Props {
  tripulacoes: EscalaTripulacao[];
  escalaId: string;
  modoEdicao: boolean;
  onClose: () => void;
}

export default function PainelTripulacoes({
  tripulacoes,
  escalaId: _escalaId, // reserved for future use
  modoEdicao: _modoEdicao, // reserved for future use
  onClose,
}: Props) {
  void _escalaId;
  void _modoEdicao;
  const [busca, setBusca] = useState('');

  const filtradas = tripulacoes.filter(
    (t) =>
      !busca ||
      t.pic_nome.toLowerCase().includes(busca.toLowerCase()) ||
      (t.sic_nome && t.sic_nome.toLowerCase().includes(busca.toLowerCase())),
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">👥 Tripulações</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
          ✕
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar tripulante..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      <div className="space-y-2">
        {filtradas.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Nenhuma tripulação encontrada</p>
        ) : (
          filtradas.map((t) => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              {/* PIC */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {t.pic_nome.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-800 truncate">
                    {t.pic_nome}
                  </div>
                  <div className="flex gap-1 items-center">
                    <span className="text-[9px] px-1 bg-blue-100 text-blue-700 rounded font-medium">
                      PIC
                    </span>
                  </div>
                </div>
              </div>

              {/* SIC (se houver) */}
              {t.sic_id && t.sic_nome && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {t.sic_nome.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-800 truncate">
                      {t.sic_nome}
                    </div>
                    <div className="flex gap-1 items-center">
                      <span className="text-[9px] px-1 bg-indigo-100 text-indigo-700 rounded font-medium">
                        SIC
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Padrão + Período */}
              <div className="text-[10px] text-slate-500 border-t border-slate-100 pt-2 space-y-0.5">
                {t.padrao_nome && (
                  <div>
                    📅 Padrão: <span className="font-medium text-slate-700">{t.padrao_nome}</span>
                  </div>
                )}
                <div>
                  {t.data_inicio
                    ? new Date(t.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')
                    : '—'}{' '}
                  →{' '}
                  {t.data_fim
                    ? new Date(t.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')
                    : '—'}
                </div>
                {t.base && (
                  <div>
                    📍 Base: <span className="font-medium text-slate-700">{t.base}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
