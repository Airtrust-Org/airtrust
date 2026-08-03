import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

type AuditResult = 'CONFORME' | 'NC_MAJOR' | 'NC_MINOR' | 'OBSERVACAO' | 'NAO_APLICAVEL';

interface AuditItem {
  id: number;
  numero_item: number | null;
  descricao: string;
  rbac_referencia: string | null;
  criterio_aceitacao: string | null;
  resultado: AuditResult | null;
  evidencia: string | null;
  verificado_por_nome: string | null;
  updated_at: string;
}

interface AuditDetail {
  id: string;
  titulo: string;
  tipo: string;
  status: 'PROGRAMADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  descricao: string | null;
  data_programada: string | null;
  data_realizada: string | null;
  auditor_nome: string | null;
  observacoes_gerais: string | null;
  percentual_conformidade: number | null;
  updated_at: string;
  itens: AuditItem[];
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface Props {
  auditoriaId: string;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}

const RESULT_LABELS: Record<AuditResult, string> = {
  CONFORME: 'Conforme',
  NC_MAJOR: 'NC Major',
  NC_MINOR: 'NC Minor',
  OBSERVACAO: 'Observação',
  NAO_APLICAVEL: 'Não aplicável',
};

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json().catch(() => ({}))) as ApiResponse<T>;
}

export default function SgsoAuditoriaWorkflow({ auditoriaId, onClose, onChanged }: Props) {
  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState<number | 'new' | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    numero_item: '',
    descricao: '',
    criterio: '',
    referencia: '',
  });
  const [generalNotes, setGeneralNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/sgso/auditorias/${encodeURIComponent(auditoriaId)}`,
      );
      const payload = await readJson<AuditDetail>(response);
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Não foi possível carregar a auditoria');
      }
      setAudit(payload.data);
      setGeneralNotes(payload.data.observacoes_gerais || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  }, [auditoriaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => audit?.itens.filter((item) => !item.resultado).length ?? 0,
    [audit],
  );
  const writable = audit?.status === 'PROGRAMADA' || audit?.status === 'EM_ANDAMENTO';

  const saveExistingItem = async (
    item: AuditItem,
    changes: Partial<Pick<AuditItem, 'resultado' | 'evidencia'>>,
  ) => {
    if (!writable || savingItemId !== null) return;
    setSavingItemId(item.id);
    setError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/sgso/auditorias/${encodeURIComponent(auditoriaId)}/item`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            item_id: item.id,
            resultado: changes.resultado ?? item.resultado ?? undefined,
            evidencia: changes.evidencia ?? item.evidencia ?? '',
            expected_updated_at: item.updated_at,
          }),
        },
      );
      const payload = await readJson<{ item_id: number }>(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Não foi possível salvar o item');
      }
      toast.success('Item salvo');
      await load();
      await onChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar item';
      setError(message);
      toast.error(message);
      await load();
    } finally {
      setSavingItemId(null);
    }
  };

  const addItem = async () => {
    const numero = Number(newItem.numero_item);
    if (!Number.isInteger(numero) || numero <= 0 || newItem.descricao.trim().length < 3) {
      setError('Informe número e descrição do item');
      return;
    }
    if (!writable || savingItemId !== null) return;
    setSavingItemId('new');
    setError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/sgso/auditorias/${encodeURIComponent(auditoriaId)}/item`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            numero_item: numero,
            descricao: newItem.descricao.trim(),
            criterio_aceitacao: newItem.criterio.trim() || undefined,
            rbac_referencia: newItem.referencia.trim() || undefined,
          }),
        },
      );
      const payload = await readJson<{ item_id: number }>(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Não foi possível adicionar o item');
      }
      setNewItem({ numero_item: '', descricao: '', criterio: '', referencia: '' });
      toast.success('Item adicionado');
      await load();
      await onChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar item';
      setError(message);
      toast.error(message);
    } finally {
      setSavingItemId(null);
    }
  };

  const finishAudit = async () => {
    if (!audit || !writable || finishing) return;
    if (audit.itens.length === 0 || pendingCount > 0) {
      setError('Todos os itens precisam ter resultado antes da conclusão');
      return;
    }
    const confirmed = await confirmDialog(
      'Concluir esta auditoria? Depois disso os itens ficarão bloqueados para edição.',
    );
    if (!confirmed) return;

    setFinishing(true);
    setError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/sgso/auditorias/${encodeURIComponent(auditoriaId)}/concluir`,
        {
          method: 'POST',
          body: JSON.stringify({
            observacoes_gerais: generalNotes.trim() || undefined,
            expected_updated_at: audit.updated_at,
          }),
        },
      );
      const payload = await readJson<unknown>(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Não foi possível concluir a auditoria');
      }
      toast.success('Auditoria concluída');
      await load();
      await onChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao concluir auditoria';
      setError(message);
      toast.error(message);
      await load();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Execução de auditoria
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              {audit?.titulo || 'Carregando...'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Recarregar auditoria"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Fechar auditoria"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Carregando auditoria...</div>
          ) : !audit ? (
            <div className="py-16 text-center text-sm text-slate-500">Auditoria indisponível</div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="font-semibold text-slate-900">{audit.status.replace('_', ' ')}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Itens</p>
                  <p className="font-semibold text-slate-900">{audit.itens.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Pendentes</p>
                  <p
                    className={
                      pendingCount ? 'font-semibold text-amber-700' : 'font-semibold text-green-700'
                    }
                  >
                    {pendingCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Conformidade</p>
                  <p className="font-semibold text-slate-900">
                    {audit.percentual_conformidade == null
                      ? '—'
                      : `${audit.percentual_conformidade.toFixed(1)}%`}
                  </p>
                </div>
              </div>

              {writable && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-blue-900">
                    Adicionar item de checklist
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
                    <input
                      type="number"
                      min="1"
                      value={newItem.numero_item}
                      onChange={(event) =>
                        setNewItem((value) => ({ ...value, numero_item: event.target.value }))
                      }
                      placeholder="Nº"
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={newItem.descricao}
                      onChange={(event) =>
                        setNewItem((value) => ({ ...value, descricao: event.target.value }))
                      }
                      placeholder="Descrição do requisito"
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={newItem.referencia}
                      onChange={(event) =>
                        setNewItem((value) => ({ ...value, referencia: event.target.value }))
                      }
                      placeholder="Referência RBAC / procedimento"
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm sm:col-start-2"
                    />
                    <div className="flex gap-2 sm:col-start-2">
                      <input
                        value={newItem.criterio}
                        onChange={(event) =>
                          setNewItem((value) => ({ ...value, criterio: event.target.value }))
                        }
                        placeholder="Critério de aceitação"
                        className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void addItem()}
                        disabled={savingItemId !== null}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" /> Adicionar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {audit.itens.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    Nenhum item de checklist. Adicione itens para iniciar a auditoria.
                  </div>
                ) : (
                  audit.itens.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">
                            {item.numero_item ? `${item.numero_item}. ` : ''}
                            {item.descricao}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                            {item.rbac_referencia && <span>{item.rbac_referencia}</span>}
                            {item.criterio_aceitacao && (
                              <span>Critério: {item.criterio_aceitacao}</span>
                            )}
                            {item.verificado_por_nome && (
                              <span>Verificado por {item.verificado_por_nome}</span>
                            )}
                          </div>
                        </div>
                        <select
                          value={item.resultado || ''}
                          disabled={!writable || savingItemId !== null}
                          onChange={(event) =>
                            void saveExistingItem(item, {
                              resultado: event.target.value as AuditResult,
                            })
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                        >
                          <option value="">Selecionar resultado...</option>
                          {Object.entries(RESULT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        key={`${item.id}:${item.updated_at}`}
                        defaultValue={item.evidencia || ''}
                        disabled={!writable || savingItemId !== null}
                        onBlur={(event) => {
                          if (event.target.value !== (item.evidencia || '')) {
                            void saveExistingItem(item, { evidencia: event.target.value });
                          }
                        }}
                        placeholder="Evidência objetiva, documento, entrevista ou observação"
                        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                        rows={2}
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-sm font-semibold text-slate-800">Observações gerais</label>
                <textarea
                  value={generalNotes}
                  onChange={(event) => setGeneralNotes(event.target.value)}
                  disabled={!writable}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>

              {writable ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm text-green-900">
                    {pendingCount > 0
                      ? `Ainda existem ${pendingCount} item(ns) sem resultado.`
                      : audit.itens.length === 0
                        ? 'Adicione pelo menos um item.'
                        : 'Todos os itens estão respondidos. A auditoria pode ser concluída.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void finishAudit()}
                    disabled={finishing || pendingCount > 0 || audit.itens.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {finishing ? 'Concluindo...' : 'Concluir auditoria'}
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Auditoria encerrada. Os itens permanecem disponíveis somente para consulta.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
