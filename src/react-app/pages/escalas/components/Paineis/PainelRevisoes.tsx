/**
 * PainelRevisoes — Histórico de revisões publicadas de uma escala.
 * Exibe a lista de snapshots ordenados do mais recente ao mais antigo.
 * Permite comparar qualquer revisão anterior com o estado atual.
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Eye, GitCompare, X } from 'lucide-react';
import { fetchApi } from '../../hooks/queries/escalas-infra';
import type { EscalaRevisao } from '../../hooks/queries/escalas-types';

interface PainelRevisoesProps {
  escalaId: string;
  onClose: () => void;
  /** Chamado ao clicar em "Comparar" numa revisão — passa o número da revisão */
  onComparar?: (revisaoNum: number) => void;
  /** Chamado ao clicar em "Ver completo" — abre snapshot completo da revisão */
  onVerCompleto?: (revisaoNum: number) => void;
}

function formatarDataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function PainelRevisoes({ escalaId, onClose, onComparar, onVerCompleto }: PainelRevisoesProps) {
  const { data: revisoes, isLoading } = useQuery<EscalaRevisao[]>({
    queryKey: ['escala-revisoes', escalaId],
    queryFn: () => fetchApi<EscalaRevisao[]>(`/api/escalas/${escalaId}/revisoes`),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Histórico de Revisões</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {revisoes && revisoes.length > 0
              ? `${revisoes.length} publicação${revisoes.length > 1 ? 'ões' : ''} registrada${revisoes.length > 1 ? 's' : ''}`
              : 'Todas as publicações desta escala'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}

        {!isLoading && (!revisoes || revisoes.length === 0) && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500">
            <Clock className="h-8 w-8 mb-2 text-slate-300" />
            <p className="text-sm font-medium">Nenhuma revisão publicada ainda.</p>
          </div>
        )}

        {revisoes?.map((rev, index) => {
          const isLatest = index === 0;
          const label = rev.revisao === 0 ? 'Publicação inicial' : `Revisão ${rev.revisao}`;

          return (
            <div
              key={rev.id}
              className={`rounded-xl border p-3 ${
                isLatest ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2
                    className={`h-4 w-4 flex-shrink-0 ${isLatest ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <span className="text-sm font-semibold text-slate-900 truncate">{label}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isLatest && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Atual
                    </span>
                  )}
                  {onVerCompleto && (
                    <button
                      type="button"
                      onClick={() => onVerCompleto(rev.revisao)}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      title={`Ver conteúdo completo de ${label}`}
                    >
                      <Eye className="h-3 w-3" />
                      Ver
                    </button>
                  )}
                  {onComparar && (
                    <button
                      type="button"
                      onClick={() => {
                        onComparar(rev.revisao);
                      }}
                      className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                        isLatest
                          ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                      title={`Comparar ${label} com o estado atual`}
                    >
                      <GitCompare className="h-3 w-3" />
                      Diff
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-1 pl-6 space-y-0.5">
                <p className="text-xs text-slate-500">{formatarDataHora(rev.publicado_em)}</p>
                {rev.publicado_por_nome && (
                  <p className="text-xs text-slate-500">por {rev.publicado_por_nome}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {revisoes && revisoes.length > 1 && onComparar && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <p className="text-[10px] text-slate-400 text-center">
            Clique em <strong>Ver diff</strong> para comparar qualquer revisão com o estado atual
          </p>
        </div>
      )}
    </div>
  );
}
