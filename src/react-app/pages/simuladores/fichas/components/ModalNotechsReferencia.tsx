/**
 * MODAL DE REFERÊNCIA — NOTECHS
 * Exibe os 15 itens NOTECHS agrupados, com os descritores completos por
 * faixa de nota (1-2/3-4/5-7/8-10). A ficha principal mostra apenas o bloco
 * compacto (código + título + nota) — os descritores completos ficam aqui,
 * fora da ficha impressa/A4, para não comprometer a legibilidade.
 */

import { X, Info } from 'lucide-react';
import {
  NOTECHS_GRUPOS,
  NOTECHS_PROVENIENCIA_AVISO,
  getNotechsDescritores,
  getNotechsItensPorGrupo,
} from '../notechs';
import { FICHA_AVALIACAO_FAIXAS } from '../avaliacaoScale';

interface ModalNotechsReferenciaProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ModalNotechsReferencia({
  isOpen,
  onClose,
}: ModalNotechsReferenciaProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Referência NOTECHS</h2>
            <p className="text-xs text-slate-500">
              Non-Technical Skills / CRM — 15 itens, descritores completos por faixa de nota.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{NOTECHS_PROVENIENCIA_AVISO}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {NOTECHS_GRUPOS.map((grupo) => (
            <div key={grupo.codigo} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-purple-700">
                {grupo.tituloPt} <span className="text-slate-400">/ {grupo.tituloEn}</span>
              </h3>
              <div className="space-y-4">
                {getNotechsItensPorGrupo(grupo.codigo).map((item) => (
                  <div key={item.codigo} className="rounded-md border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.tituloPt} <span className="font-normal text-slate-400">/ {item.tituloEn}</span>
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {getNotechsDescritores(item.codigo).map((descritor) => {
                        const faixa = FICHA_AVALIACAO_FAIXAS.find(
                          (f) => f.rangeLabel === descritor.rangeLabel,
                        );
                        return (
                          <div
                            key={`${descritor.itemCodigo}-${descritor.rangeLabel}`}
                            className="rounded border border-slate-200 bg-slate-50 p-2"
                          >
                            <span
                              className="mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                              style={{ backgroundColor: faixa?.color || '#94a3b8' }}
                            >
                              {descritor.rangeLabel}
                            </span>
                            <p className="text-xs leading-snug text-slate-700">{descritor.texto}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 px-6 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
