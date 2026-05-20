/**
 * ModalSnapshotRevisao — Exibe o conteúdo completo de uma revisão específica.
 * Mostra tripulações e alocações registradas no momento da publicação.
 */

import { useQuery } from '@tanstack/react-query';
import { Clock, Users, Plane, X, Calendar, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { fetchApi } from '../../hooks/queries/escalas-infra';
import type { EscalaTripulacao, EscalaAlocacao } from '../../hooks/queries/escalas-types';

interface SnapshotData {
  tripulacoes: EscalaTripulacao[];
  eventos: unknown[];
  alocacoes: EscalaAlocacao[];
  savedAt: string;
  revisao: number;
  publicado_em?: string | null;
  publicado_por?: string | null;
}

interface Props {
  escalaId: string;
  revisaoNum: number;
  revisaoLabel: string;
  escalaLabel: string;
  onClose: () => void;
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function fmtDateHora(iso: string | undefined | null): string {
  if (!iso) return '—';
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

export default function ModalSnapshotRevisao({
  escalaId,
  revisaoNum,
  revisaoLabel,
  escalaLabel,
  onClose,
}: Props) {
  const { data: snapshot, isLoading, error } = useQuery<SnapshotData | null>({
    queryKey: ['escala-snapshot-revisao-completo', escalaId, revisaoNum],
    queryFn: () => fetchApi<SnapshotData>(`/api/escalas/${escalaId}/revisoes/${revisaoNum}`),
    staleTime: 5 * 60_000,
  });

  const tripulacoes = snapshot?.tripulacoes ?? [];
  const alocacoes = snapshot?.alocacoes ?? [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`📋 ${revisaoLabel} — ${escalaLabel}`}
      size="lg"
    >
      <div className="space-y-4 text-sm">
        {/* Metadados da revisão */}
        <div className="flex items-center gap-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>Publicado em {fmtDateHora(snapshot?.publicado_em ?? snapshot?.savedAt)}</span>
          </div>
          {snapshot?.publicado_por && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span>por {snapshot.publicado_por}</span>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-xs">Erro ao carregar snapshot desta revisão.</span>
          </div>
        )}

        {!isLoading && snapshot && (
          <>
            {/* Alocações por tripulante (novo sistema) */}
            {alocacoes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Plane className="h-4 w-4 text-indigo-500" />
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Alocações por tripulante ({alocacoes.length})
                  </h3>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {alocacoes.map((al) => (
                    <div
                      key={al.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {al.funcionario?.nome ?? al.funcionario_nome ?? '—'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {al.funcao} · {al.aeronave?.prefixo ?? al.aeronave_prefixo ?? 'Sem aeronave'}
                          {al.quinzena_id != null ? ` · Q${al.quinzena_id}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                        <Calendar className="h-3 w-3" />
                        <span>{fmtDate(al.data_inicio)} → {fmtDate(al.data_fim)}</span>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          al.status === 'confirmado'
                            ? 'bg-emerald-100 text-emerald-700'
                            : al.status === 'cancelado'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {al.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Tripulações Gantt (sistema legado) */}
            {tripulacoes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-sky-500" />
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Tripulações ({tripulacoes.length})
                  </h3>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {tripulacoes.map((trip) => (
                    <div
                      key={trip.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          <span className="text-sky-700">PIC</span> {trip.pic_nome}
                          {trip.sic_nome ? (
                            <> · <span className="text-indigo-700">SIC</span> {trip.sic_nome}</>
                          ) : null}
                        </p>
                        {trip.aeronave && (
                          <p className="text-[11px] text-slate-500">{trip.aeronave}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                        <Calendar className="h-3 w-3" />
                        <span>{fmtDate(trip.data_inicio)} → {fmtDate(trip.data_fim)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {alocacoes.length === 0 && tripulacoes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
                <X className="h-8 w-8 mb-2 text-slate-300" />
                <p className="text-sm">Nenhuma alocação ou tripulação registrada nesta revisão.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
