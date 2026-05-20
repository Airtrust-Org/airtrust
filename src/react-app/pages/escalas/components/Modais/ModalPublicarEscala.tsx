/**
 * ModalPublicarEscala — Modal de confirmação e pré-checklist para publicar escala.
 * Usado tanto na publicação inicial (aprovada → publicada) quanto na revisão
 * (publicada → publicada).
 */

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Send,
  Users,
  Plane,
  RefreshCw,
  X,
  Clock,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';

interface CoberturaSummary {
  total: number;
  completos: number;
  parciais: number;
  livres: number;
}

interface Props {
  /** Modo: publicação inicial ou nova revisão */
  modo: 'publicar' | 'revisao';
  escalaLabel: string;
  cobertura: CoberturaSummary;
  totalConflitos: number;
  totalAlocacoes: number;
  /** Número atual da revisão (só relevante em modo='revisao') */
  numeroRevisaoAtual?: number;
  onConfirmar: (justificativa?: string) => Promise<void>;
  onClose: () => void;
}

function CheckItem({
  ok,
  label,
  detalhe,
}: {
  ok: boolean;
  label: string;
  detalhe?: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${ok ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}`}>
      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-400'}`}>
        {ok ? (
          <CheckCircle2 className="h-3 w-3 text-white" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-white" />
        )}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${ok ? 'text-emerald-900' : 'text-amber-900'}`}>
          {label}
        </p>
        {detalhe && (
          <p className={`mt-0.5 text-xs ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
            {detalhe}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ModalPublicarEscala({
  modo,
  escalaLabel,
  cobertura,
  totalConflitos,
  totalAlocacoes,
  numeroRevisaoAtual = 0,
  onConfirmar,
  onClose,
}: Props) {
  const [justificativa, setJustificativa] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [loading, setLoading] = useState(false);

  const isRevisao = modo === 'revisao';
  const proximaRevisao = numeroRevisaoAtual + 1;

  const coberturaOk = cobertura.livres === 0;
  const conflitosOk = totalConflitos === 0;
  const temAlocacoes = totalAlocacoes > 0;

  const podePublicar = !loading && (isRevisao ? confirmado : true);

  async function handleConfirmar() {
    setLoading(true);
    try {
      await onConfirmar(justificativa.trim() || undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        isRevisao
          ? `🔄 Publicar Revisão ${proximaRevisao}`
          : '🚀 Publicar Escala para Tripulantes'
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            isLoading={loading}
            disabled={!podePublicar}
            className={
              isRevisao
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }
          >
            {isRevisao ? `Publicar Revisão ${proximaRevisao}` : 'Confirmar Publicação'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Escala label */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800">{escalaLabel}</span>
          {isRevisao && (
            <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              Revisão {numeroRevisaoAtual} → {proximaRevisao}
            </span>
          )}
        </div>

        {isRevisao ? (
          /* ── Modo Revisão ── */
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Uma nova revisão será gerada com o estado atual das alocações e eventos.
              As revisões anteriores são mantidas no histórico.
            </p>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-lg font-bold text-slate-900">{totalAlocacoes}</p>
                <p className="text-[11px] text-slate-500">Alocações</p>
              </div>
              <div
                className={`rounded-xl border p-3 ${cobertura.livres > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}
              >
                <p
                  className={`text-lg font-bold ${cobertura.livres > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                >
                  {cobertura.completos}
                </p>
                <p
                  className={`text-[11px] ${cobertura.livres > 0 ? 'text-amber-600' : 'text-emerald-600'}`}
                >
                  Completos
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${totalConflitos > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
              >
                <p
                  className={`text-lg font-bold ${totalConflitos > 0 ? 'text-red-700' : 'text-slate-400'}`}
                >
                  {totalConflitos}
                </p>
                <p className={`text-[11px] ${totalConflitos > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  Conflitos
                </p>
              </div>
            </div>

            {(cobertura.livres > 0 || totalConflitos > 0) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  {cobertura.livres > 0 && `${cobertura.livres} tripulante(s) ainda sem alocação. `}
                  {totalConflitos > 0 && `${totalConflitos} conflito(s) ativo(s).`}
                  {' '}Ainda assim, a revisão pode ser publicada.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Observação sobre esta revisão (opcional)
              </label>
              <textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={2}
                placeholder="Descreva o que mudou nesta revisão..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-indigo-600"
              />
              <span className="text-sm text-slate-700">
                Confirmo que as alterações estão corretas e desejo publicar a Revisão {proximaRevisao}.
              </span>
            </label>
          </div>
        ) : (
          /* ── Modo Publicação Inicial ── */
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              A escala será publicada e disponibilizada para os tripulantes.
              Verifique os itens abaixo antes de confirmar.
            </p>

            {/* Checklist */}
            <div className="space-y-2">
              <CheckItem
                ok={temAlocacoes}
                label={
                  temAlocacoes
                    ? `${totalAlocacoes} alocação(ões) operacional(is) registrada(s)`
                    : 'Nenhuma alocação operacional encontrada'
                }
                detalhe={!temAlocacoes ? 'Adicione alocações antes de publicar.' : undefined}
              />

              <CheckItem
                ok={coberturaOk}
                label={
                  coberturaOk
                    ? `Cobertura completa — ${cobertura.completos}/${cobertura.total} tripulantes alocados`
                    : `${cobertura.livres} tripulante(s) sem alocação`
                }
                detalhe={
                  !coberturaOk
                    ? `${cobertura.completos} completo(s), ${cobertura.parciais} parcial(is), ${cobertura.livres} livre(s)`
                    : undefined
                }
              />

              <CheckItem
                ok={conflitosOk}
                label={
                  conflitosOk
                    ? 'Sem conflitos de escala detectados'
                    : `${totalConflitos} conflito(s) de escala ativo(s)`
                }
                detalhe={
                  !conflitosOk
                    ? 'Verifique os conflitos antes de publicar para evitar problemas operacionais.'
                    : undefined
                }
              />
            </div>

            {/* Stats summary */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2">
                <p className="text-base font-bold text-slate-800">{cobertura.total}</p>
                <p className="text-[10px] text-slate-500 leading-tight">Tripulantes</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2">
                <p className="text-base font-bold text-emerald-700">{cobertura.completos}</p>
                <p className="text-[10px] text-emerald-600 leading-tight">Completos</p>
              </div>
              <div className={`rounded-xl p-2 ${cobertura.livres > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className={`text-base font-bold ${cobertura.livres > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                  {cobertura.livres}
                </p>
                <p className={`text-[10px] leading-tight ${cobertura.livres > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  Livres
                </p>
              </div>
              <div className={`rounded-xl p-2 ${totalConflitos > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className={`text-base font-bold ${totalConflitos > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                  {totalConflitos}
                </p>
                <p className={`text-[10px] leading-tight ${totalConflitos > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  Conflitos
                </p>
              </div>
            </div>

            {(cobertura.livres > 0 || totalConflitos > 0) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  A escala pode ser publicada mesmo com pendências. Os tripulantes verão as
                  alocações no estado atual.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Observação (opcional)
              </label>
              <textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={2}
                placeholder="Alguma nota sobre esta publicação..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
