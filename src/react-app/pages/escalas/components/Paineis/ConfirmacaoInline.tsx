/**
 * UX-07: Inline Event Confirmation
 * Shows a lightweight confirmation bar for auto-generated events
 * that the user can confirm or reject directly from the Gantt view.
 */

import { useState } from 'react';
import { Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { mutateApi, escalasKeys } from '../../hooks/queries/escalas-infra';
import { toast } from 'sonner';
import type { EscalaEvento } from '../../hooks/queries/useEscalasQuery';
import { EVENTO_CONFIG } from '../EscalaCalendario/GradeGantt';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

interface ConfirmacaoInlineProps {
  eventos: EscalaEvento[];
  escalaId: string;
  onConfirmado?: () => void;
}

export default function ConfirmacaoInline({
  eventos,
  escalaId,
  onConfirmado,
}: ConfirmacaoInlineProps) {
  const pendentes = eventos.filter(
    (e) => e.gerado_automaticamente === 1 && e.status === 'pendente',
  );

  const [confirming, setConfirming] = useState<Set<string>>(new Set());
  const isLoading = confirming.size > 0;
  const qc = useQueryClient();

  /**
   * Invalidate all escalas queries that reflect event status changes.
   * Previously this was missing entirely — the UI could show stale data
   * for up to 30 s after confirming/rejecting an event.
   */
  async function invalidarAposConfirmacao() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: escalasKeys.calendarios(escalaId) }),
      qc.invalidateQueries({ queryKey: escalasKeys.alocacoes(escalaId) }),
      qc.invalidateQueries({ queryKey: escalasKeys.conflitos(escalaId) }),
    ]);
  }

  const confirmar = async (id: string) => {
    setConfirming((s) => new Set(s).add(id));
    try {
      await mutateApi(`/api/escalas/${escalaId}/eventos/${id}`, 'PUT', { status: 'confirmado' });
      await invalidarAposConfirmacao();
      toast.success('Evento confirmado');
      onConfirmado?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao confirmar evento');
    }
    setConfirming((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  const rejeitar = async (id: string) => {
    setConfirming((s) => new Set(s).add(id));
    try {
      await mutateApi(`/api/escalas/${escalaId}/eventos/${id}`, 'PUT', { status: 'cancelado' });
      await invalidarAposConfirmacao();
      toast.success('Evento rejeitado');
      onConfirmado?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao rejeitar evento');
    }
    setConfirming((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  const confirmarTodos = async () => {
    for (const evt of pendentes) {
      await confirmar(evt.id);
    }
  };

  if (pendentes.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-600" />
          <span className="text-xs font-semibold text-amber-800">
            {pendentes.length}{' '}
            {pendentes.length === 1
              ? 'evento auto-gerado pendente'
              : 'eventos auto-gerados pendentes'}
          </span>
        </div>
        {pendentes.length > 1 && (
          <button
            onClick={confirmarTodos}
            disabled={isLoading}
            className="text-[10px] px-2.5 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50"
          >
            Confirmar Todos
          </button>
        )}
      </div>

      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {pendentes.map((evt) => {
          const cfg = EVENTO_CONFIG[evt.tipo_evento as keyof typeof EVENTO_CONFIG];
          const busy = confirming.has(evt.id);
          return (
            <div
              key={evt.id}
              className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-100"
            >
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: cfg?.cor || '#6B7280' }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-800">
                  {cfg?.label || evt.tipo_evento}
                </span>
                <span className="text-[10px] text-gray-400 ml-2">
                  <FuncionarioLink
                    funcionarioId={evt.funcionario_id}
                    nome={evt.funcionario_nome}
                    className="hover:text-primary hover:underline"
                  />{' '}
                  ·{' '}
                  {evt.data_inicio
                    ? new Date(evt.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })
                    : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => confirmar(evt.id)}
                  disabled={busy}
                  className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                  title="Confirmar"
                >
                  <CheckCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={() => rejeitar(evt.id)}
                  disabled={busy}
                  className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  title="Rejeitar"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
