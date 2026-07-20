import { useState } from 'react';
import { AlertTriangle, Send, Eye, Undo2, CheckCircle2, RotateCcw, Ban, FileDown, History } from 'lucide-react';
import {
  useRdvAlertas,
  useRdvRevisoes,
  useRdvAprovacoes,
  useEnviarRdv,
  useIniciarRevisaoRdv,
  useDevolverRdv,
  useAprovarRdv,
  useFinalizarRdv,
  useReabrirRdv,
  useCancelarRdv,
  abrirRelatorioPetrobrasPdf,
  type CvRdv,
} from '@/react-app/hooks/useControleVoos';
import { formatDateTime } from '../data/controleVoosUtils';

const WORKFLOW_LABELS: Record<CvRdv['workflow_status'], string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado à Coordenação',
  em_revisao: 'Em revisão',
  aprovado_coordenacao: 'Aprovado (Coordenação)',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

const WORKFLOW_COLORS: Record<CvRdv['workflow_status'], string> = {
  rascunho: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  enviado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  em_revisao: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  aprovado_coordenacao: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  finalizado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const SEVERITY_STYLES: Record<string, string> = {
  INFORMATIVO: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  ATENCAO: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300',
  IMPEDE_ENVIO: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300',
  IMPEDE_APROVACAO: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300',
};

function ActionButton({
  onClick,
  disabled,
  loading,
  icon: Icon,
  children,
  tone = 'primary',
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: typeof Send;
  children: React.ReactNode;
  tone?: 'primary' | 'danger' | 'neutral';
}) {
  const toneClasses =
    tone === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600'
      : tone === 'neutral'
        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
        : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function JustificativaPrompt({
  label,
  placeholder,
  onConfirm,
  onCancel,
  loading,
  tone = 'primary',
}: {
  label: string;
  placeholder: string;
  onConfirm: (justificativa: string) => void;
  onCancel: () => void;
  loading: boolean;
  tone?: 'primary' | 'danger';
}) {
  const [texto, setTexto] = useState('');
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
      <textarea
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <div className="flex gap-2">
        <button
          onClick={() => texto.trim() && onConfirm(texto.trim())}
          disabled={!texto.trim() || loading}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Enviando…' : 'Confirmar'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function ControleVoosRdvWorkflowPanel({
  vooId,
  rdv,
  isCoordenacao,
}: {
  vooId: string;
  rdv: CvRdv | null | undefined;
  isCoordenacao: boolean;
}) {
  const [prompt, setPrompt] = useState<'devolver' | 'reabrir' | 'cancelar' | null>(null);
  const [showHistorico, setShowHistorico] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: alertas = [] } = useRdvAlertas(rdv ? vooId : undefined);
  const { data: revisoes = [] } = useRdvRevisoes(showHistorico ? vooId : undefined);
  const { data: aprovacoes = [] } = useRdvAprovacoes(showHistorico ? vooId : undefined);

  const enviar = useEnviarRdv();
  const iniciarRevisao = useIniciarRevisaoRdv();
  const devolver = useDevolverRdv();
  const aprovar = useAprovarRdv();
  const finalizar = useFinalizarRdv();
  const reabrir = useReabrirRdv();
  const cancelar = useCancelarRdv();

  if (!rdv) return null;

  const bloqueiosEnvio = alertas.filter((a) => a.severidade === 'IMPEDE_ENVIO');
  const bloqueiosAprovacao = alertas.filter((a) => a.severidade === 'IMPEDE_APROVACAO');
  const isBusy =
    enviar.isPending || iniciarRevisao.isPending || devolver.isPending || aprovar.isPending ||
    finalizar.isPending || reabrir.isPending || cancelar.isPending;

  async function runAction(mutateAsync: () => Promise<unknown>) {
    setActionError(null);
    try {
      await mutateAsync();
      setPrompt(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nao foi possivel concluir a acao.');
    }
  }

  async function handleGerarPdf() {
    setPdfError(null);
    setPdfLoading(true);
    try {
      await abrirRelatorioPetrobrasPdf(vooId);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'Nao foi possivel gerar o PDF.');
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Fluxo Piloto → Coordenação</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${WORKFLOW_COLORS[rdv.workflow_status]}`}>
          {WORKFLOW_LABELS[rdv.workflow_status]}
        </span>
      </div>

      {rdv.motivo_devolucao && rdv.workflow_status === 'rascunho' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          <strong>Devolvido pela Coordenação:</strong> {rdv.motivo_devolucao}
        </div>
      )}

      {alertas.length > 0 && (
        <div className="mb-4 space-y-2">
          {alertas.map((alerta) => (
            <div
              key={alerta.id}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${SEVERITY_STYLES[alerta.severidade] || SEVERITY_STYLES.INFORMATIVO}`}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{alerta.mensagem}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {!isCoordenacao && rdv.workflow_status === 'rascunho' && rdv.status === 'preenchimento_finalizado' && (
          <ActionButton
            icon={Send}
            loading={enviar.isPending}
            disabled={bloqueiosEnvio.length > 0}
            onClick={() => runAction(() => enviar.mutateAsync({ vooId, body: { versao: rdv.versao } }))}
          >
            {bloqueiosEnvio.length > 0 ? 'Envio bloqueado por alertas' : 'Enviar para Coordenação'}
          </ActionButton>
        )}

        {isCoordenacao && rdv.workflow_status === 'enviado' && (
          <ActionButton
            icon={Eye}
            loading={iniciarRevisao.isPending}
            onClick={() => runAction(() => iniciarRevisao.mutateAsync({ vooId, body: { versao: rdv.versao } }))}
          >
            Iniciar revisão
          </ActionButton>
        )}

        {isCoordenacao && rdv.workflow_status === 'em_revisao' && (
          <>
            <ActionButton
              icon={CheckCircle2}
              loading={aprovar.isPending}
              disabled={bloqueiosAprovacao.length > 0}
              onClick={() => runAction(() => aprovar.mutateAsync({ vooId, body: { versao: rdv.versao } }))}
            >
              {bloqueiosAprovacao.length > 0 ? 'Aprovação bloqueada por alertas' : 'Aprovar'}
            </ActionButton>
            {prompt === 'devolver' ? (
              <JustificativaPrompt
                label="Motivo da devolução (obrigatório)"
                placeholder="Ex.: faltou informar consumo de combustível do trecho 2"
                loading={devolver.isPending}
                onCancel={() => setPrompt(null)}
                onConfirm={(justificativa) =>
                  runAction(() => devolver.mutateAsync({ vooId, body: { versao: rdv.versao, justificativa } }))
                }
              />
            ) : (
              <ActionButton icon={Undo2} tone="neutral" onClick={() => setPrompt('devolver')} disabled={isBusy}>
                Devolver ao piloto
              </ActionButton>
            )}
          </>
        )}

        {isCoordenacao && rdv.workflow_status === 'aprovado_coordenacao' && (
          <ActionButton
            icon={CheckCircle2}
            loading={finalizar.isPending}
            onClick={() => runAction(() => finalizar.mutateAsync({ vooId, body: { versao: rdv.versao } }))}
          >
            Finalizar relatório
          </ActionButton>
        )}

        {isCoordenacao && rdv.workflow_status === 'finalizado' && (
          <>
            {prompt === 'reabrir' ? (
              <JustificativaPrompt
                label="Motivo da reabertura (obrigatório)"
                placeholder="Ex.: cliente solicitou correção de horário do trecho 1"
                loading={reabrir.isPending}
                onCancel={() => setPrompt(null)}
                onConfirm={(justificativa) =>
                  runAction(() => reabrir.mutateAsync({ vooId, body: { versao: rdv.versao, justificativa } }))
                }
              />
            ) : (
              <ActionButton icon={RotateCcw} tone="neutral" onClick={() => setPrompt('reabrir')}>
                Reabrir
              </ActionButton>
            )}
            <ActionButton icon={FileDown} tone="primary" loading={pdfLoading} onClick={handleGerarPdf}>
              Gerar relatório Petrobras (PDF fictício)
            </ActionButton>
          </>
        )}

        {isCoordenacao && ['rascunho', 'enviado', 'em_revisao'].includes(rdv.workflow_status) && (
          <>
            {prompt === 'cancelar' ? (
              <JustificativaPrompt
                label="Motivo do cancelamento (obrigatório)"
                placeholder="Ex.: voo cancelado por meteorologia"
                tone="danger"
                loading={cancelar.isPending}
                onCancel={() => setPrompt(null)}
                onConfirm={(justificativa) =>
                  runAction(() => cancelar.mutateAsync({ vooId, body: { versao: rdv.versao, justificativa } }))
                }
              />
            ) : (
              <ActionButton icon={Ban} tone="danger" onClick={() => setPrompt('cancelar')}>
                Cancelar RDV
              </ActionButton>
            )}
          </>
        )}

        {actionError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            {actionError}
          </p>
        )}
        {pdfError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            {pdfError}
          </p>
        )}
      </div>

      <button
        onClick={() => setShowHistorico((v) => !v)}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <History className="h-3.5 w-3.5" /> {showHistorico ? 'Ocultar histórico' : `Ver histórico (v${rdv.versao})`}
      </button>

      {showHistorico && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Aprovações</p>
            {aprovacoes.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Nenhum evento registrado.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {aprovacoes.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>
                      {a.status} (v{a.versao}){a.justificativa ? ` — ${a.justificativa}` : ''}
                    </span>
                    <span className="shrink-0 text-slate-400 dark:text-slate-500">{formatDateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Correções (diff campo a campo)</p>
            {revisoes.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Nenhuma correção registrada.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {revisoes.map((r) => (
                  <li key={r.id}>
                    <span className="font-mono">{r.campo}</span>: <span className="line-through">{r.valor_anterior ?? '—'}</span>{' '}
                    → <span className="font-medium">{r.valor_novo ?? '—'}</span>
                    {r.justificativa && <span className="text-slate-400 dark:text-slate-500"> ({r.justificativa})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
