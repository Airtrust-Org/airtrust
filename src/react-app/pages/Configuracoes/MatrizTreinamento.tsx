import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '../../utils/toast';
import { useQualificacaoTipos } from '../../hooks/useQualificacoesExt';
import { usePermissions } from '../../hooks/usePermissions';
import {
  Plus,
  Trash2,
  LoaderCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Search,
} from 'lucide-react';

interface Funcao {
  id: number;
  nome: string;
  codigo?: string | null;
  total_obrigatoria?: number;
  total_recomendada?: number;
  total_critica?: number;
}

interface QualificacaoTipo {
  id: number;
  nome: string;
  codigo?: string | null;
  validade_meses?: number | null;
}

interface MatrizRegistro {
  id: number;
  funcao_id: number;
  funcao_nome: string;
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string;
  qualificacao_tipo_codigo?: string | null;
  obrigatoriedade: 'OBRIGATORIA' | 'RECOMENDADA' | 'NAO_APLICA';
  critico_operacional: number;
  origem: string;
  observacoes?: string | null;
  ativo: number;
}

const OBRIGATORIEDADE_OPTS = [
  { value: 'OBRIGATORIA', label: 'Obrigatória' },
  { value: 'RECOMENDADA', label: 'Recomendada' },
  { value: 'NAO_APLICA', label: 'N/A' },
];

const ORIGEM_OPTS = [
  { value: 'REGULATORIO', label: 'Regulatório' },
  { value: 'SGSO', label: 'SGSO' },
  { value: 'RH', label: 'RH' },
  { value: 'CLIENTE', label: 'Cliente' },
  { value: 'OUTRO', label: 'Outro' },
];

const obrigatoriedadeBadge: Record<string, string> = {
  OBRIGATORIA: 'bg-red-100 text-red-700',
  RECOMENDADA: 'bg-amber-100 text-amber-700',
  NAO_APLICA: 'bg-slate-100 text-slate-500',
};

export function MatrizTreinamento() {
  const { empresaAtualId } = useAuth();
  const { isAdmin, isGestor } = usePermissions();
  const canEdit = isAdmin || isGestor;
  const queryClient = useQueryClient();

  const { tipos: tiposRaw } = useQualificacaoTipos(true, 500);
  const tipos: QualificacaoTipo[] = tiposRaw.map((t) => ({
    id: Number(t.id || 0),
    nome: String(t.nome || ''),
    codigo: t.codigo ?? null,
    validade_meses: t.validade ?? null,
  }));
  const [expandedFuncao, setExpandedFuncao] = useState<number | null>(null);

  // Form para novo registro
  const [showForm, setShowForm] = useState<number | null>(null); // funcao_id selecionado para adicionar
  const [formObrigatoriedade, setFormObrigatoriedade] = useState<
    'OBRIGATORIA' | 'RECOMENDADA' | 'NAO_APLICA'
  >('OBRIGATORIA');
  const [formCritico, setFormCritico] = useState(false);
  const [formOrigem, setFormOrigem] = useState('REGULATORIO');
  const [formObs, setFormObs] = useState('');
  const [formSelectedIds, setFormSelectedIds] = useState<Set<number>>(new Set());
  const [formSearch, setFormSearch] = useState('');

  const funcoesQuery = useQuery({
    queryKey: ['matriz-treinamento', 'funcoes', empresaAtualId],
    enabled: Boolean(empresaAtualId),
    queryFn: async (): Promise<Funcao[]> => {
      const funcoesRes = await fetchWithAuth(`/api/matriz-treinamento/funcoes?t=${Date.now()}`);
      const funcoesJson = (await funcoesRes.json().catch(() => ({}))) as {
        success?: boolean;
        data?: Funcao[];
      };

      let funcoesData = funcoesJson.data || [];
      if (!funcoesRes.ok || funcoesData.length === 0) {
        const fallbackRes = await fetchWithAuth(`/api/funcoes?t=${Date.now()}`);
        const fallbackJson = (await fallbackRes.json().catch(() => ({}))) as {
          data?: Array<{ id: number; nome: string; codigo?: string | null }>;
        };
        funcoesData = (fallbackJson.data || []).map((f) => ({
          id: Number(f.id || 0),
          nome: String(f.nome || ''),
          codigo: f.codigo ?? null,
          total_obrigatoria: 0,
          total_recomendada: 0,
          total_critica: 0,
        }));
      }
      return funcoesData;
    },
  });

  const registrosQuery = useQuery({
    queryKey: ['matriz-treinamento', 'registros', empresaAtualId],
    enabled: Boolean(empresaAtualId),
    queryFn: async (): Promise<MatrizRegistro[]> => {
      const registrosRes = await fetchWithAuth(`/api/matriz-treinamento/registros?t=${Date.now()}`);
      const registrosJson = (await registrosRes.json().catch(() => ({}))) as {
        success?: boolean;
        data?: MatrizRegistro[];
      };
      return registrosJson.data || [];
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (payload: {
      funcao_id: number;
      qualificacao_tipo_ids: number[];
      obrigatoriedade: string;
      critico_operacional: boolean;
      origem: string;
      observacoes: string | null;
    }) => {
      const res = await fetchWithAuth('/api/matriz-treinamento/registros/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { inserted: number; skipped: number };
      };
      if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao salvar');
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matriz-treinamento'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: number; data: Record<string, unknown> }) => {
      const res = await fetchWithAuth(`/api/matriz-treinamento/registros/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.data),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao atualizar');
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matriz-treinamento'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetchWithAuth(`/api/matriz-treinamento/registros/${id}`, {
        method: 'DELETE',
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao remover');
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matriz-treinamento'] });
    },
  });

  const funcoes = funcoesQuery.data || [];
  const registros = registrosQuery.data || [];
  const loading = funcoesQuery.isLoading || registrosQuery.isLoading;
  const saving = bulkAddMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const registrosPorFuncao = (funcaoId: number) =>
    registros.filter((r) => r.funcao_id === funcaoId && r.ativo === 1);

  const tiposJaAdicionados = (funcaoId: number) =>
    new Set(registrosPorFuncao(funcaoId).map((r) => r.qualificacao_tipo_id));

  const tiposDisponiveis = (funcaoId: number) => {
    const adicionados = tiposJaAdicionados(funcaoId);
    return tipos.filter((t) => !adicionados.has(t.id));
  };

  const handleAddRegistro = async (funcaoId: number) => {
    if (!canEdit) {
      showToast.error('Permissão negada para editar a matriz.');
      return;
    }
    if (formSelectedIds.size === 0) {
      showToast.error('Selecione ao menos uma qualificação');
      return;
    }
    try {
      const result = await bulkAddMutation.mutateAsync({
        funcao_id: funcaoId,
        qualificacao_tipo_ids: Array.from(formSelectedIds),
        obrigatoriedade: formObrigatoriedade,
        critico_operacional: formCritico,
        origem: formOrigem,
        observacoes: formObs || null,
      });
      const d = result.data as { inserted?: number; skipped?: number } | undefined;
      const ins = d?.inserted ?? 0;
      const skip = d?.skipped ?? 0;
      if (ins > 0 && skip > 0)
        showToast.success(
          `${ins} qualificação(ões) adicionada(s). ${skip} já existia(m) e foi(ram) ignorada(s).`,
        );
      else if (ins > 0) showToast.success(`${ins} qualificação(ões) adicionada(s) à matriz`);
      else showToast.error('Todas as qualificações selecionadas já existem na matriz');
      setShowForm(null);
      setFormSelectedIds(new Set());
      setFormSearch('');
      setFormObrigatoriedade('OBRIGATORIA');
      setFormCritico(false);
      setFormOrigem('REGULATORIO');
      setFormObs('');
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: number) => {
    if (!canEdit) {
      showToast.error('Permissão negada para editar a matriz.');
      return;
    }
    if (!confirm('Remover este requisito da matriz?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      showToast.success('Requisito removido');
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Erro ao remover requisito');
    }
  };

  const handleToggleCritico = async (registro: MatrizRegistro) => {
    if (!canEdit) {
      showToast.error('Permissão negada para editar a matriz.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: registro.id,
        data: { critico_operacional: !registro.critico_operacional },
      });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  };

  const handleChangeObrigatoriedade = async (registro: MatrizRegistro, value: string) => {
    if (!canEdit) {
      showToast.error('Permissão negada para editar a matriz.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: registro.id,
        data: { obrigatoriedade: value },
      });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Matriz de Treinamentos por Função
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Defina quais qualificações são obrigatórias ou recomendadas para cada função.
          </p>
        </div>
        {!canEdit && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Visualização somente leitura
          </span>
        )}
      </div>

      {funcoes.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Nenhuma função cadastrada. Cadastre funções em Configurações → Cadastros antes de montar a
          matriz.
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {funcoes.map((funcao) => {
          const regs = registrosPorFuncao(funcao.id);
          const isExpanded = expandedFuncao === funcao.id;
          const isAddingHere = showForm === funcao.id;

          return (
            <div key={funcao.id}>
              {/* Cabeçalho da função */}
              <button
                type="button"
                onClick={() => setExpandedFuncao(isExpanded ? null : funcao.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <div>
                    <span className="text-sm font-medium text-slate-900">{funcao.nome}</span>
                    {funcao.codigo && (
                      <span className="ml-2 text-xs text-slate-400">{funcao.codigo}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {regs.filter((r) => r.obrigatoriedade === 'OBRIGATORIA').length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {regs.filter((r) => r.obrigatoriedade === 'OBRIGATORIA').length} obrig.
                    </span>
                  )}
                  {regs.filter((r) => r.obrigatoriedade === 'RECOMENDADA').length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {regs.filter((r) => r.obrigatoriedade === 'RECOMENDADA').length} recom.
                    </span>
                  )}
                  {regs.filter((r) => r.critico_operacional).length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      <ShieldCheck className="w-3 h-3" />
                      {regs.filter((r) => r.critico_operacional).length} crítico(s)
                    </span>
                  )}
                  {regs.length === 0 && (
                    <span className="text-xs text-slate-400">Sem requisitos</span>
                  )}
                </div>
              </button>

              {/* Conteúdo expandido */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-4">
                  {/* Lista de registros */}
                  {regs.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            <th className="px-3 py-2 text-left">Qualificação</th>
                            <th className="px-3 py-2 text-left">Obrigatoriedade</th>
                            <th className="px-3 py-2 text-center">Crítico</th>
                            <th className="px-3 py-2 text-left">Origem</th>
                            <th className="px-3 py-2 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {regs.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2">
                                <span className="font-medium text-slate-800">
                                  {r.qualificacao_tipo_nome}
                                </span>
                                {r.qualificacao_tipo_codigo && (
                                  <span className="ml-1.5 text-xs text-slate-400">
                                    {r.qualificacao_tipo_codigo}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={r.obrigatoriedade}
                                  onChange={(e) =>
                                    void handleChangeObrigatoriedade(r, e.target.value)
                                  }
                                  disabled={!canEdit}
                                  className={`rounded-full border-0 px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent focus:outline-none cursor-pointer ${obrigatoriedadeBadge[r.obrigatoriedade] || ''}`}
                                >
                                  {OBRIGATORIEDADE_OPTS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleCritico(r)}
                                  title="Clique para alternar crítico operacional"
                                  disabled={!canEdit}
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                                    r.critico_operacional
                                      ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                  }`}
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs text-slate-500">{r.origem}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleDelete(r.id)}
                                    className="inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Remover da matriz"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Formulário para adicionar */}
                  {isAddingHere && canEdit ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                      <p className="text-xs font-semibold text-slate-700">
                        Adicionar qualificação à função {funcao.nome}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Qualificação *
                          </label>
                          <div className="relative mb-1.5">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              value={formSearch}
                              onChange={(e) => setFormSearch(e.target.value)}
                              placeholder="Buscar qualificação..."
                              className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>
                          {(() => {
                            const disponiveis = tiposDisponiveis(funcao.id);
                            const filtered = formSearch.trim()
                              ? disponiveis.filter(
                                  (t) =>
                                    t.nome
                                      .toLowerCase()
                                      .includes(formSearch.trim().toLowerCase()) ||
                                    (t.codigo ?? '')
                                      .toLowerCase()
                                      .includes(formSearch.trim().toLowerCase()),
                                )
                              : disponiveis;
                            return (
                              <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-50 bg-white">
                                {filtered.length === 0 && (
                                  <p className="px-3 py-3 text-xs text-slate-400 text-center">
                                    {formSearch
                                      ? 'Nenhuma qualificação encontrada'
                                      : 'Todas as qualificações já foram adicionadas'}
                                  </p>
                                )}
                                {filtered.map((t) => (
                                  <label
                                    key={t.id}
                                    className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer select-none hover:bg-slate-50 transition-colors ${formSelectedIds.has(t.id) ? 'bg-primary/5' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={formSelectedIds.has(t.id)}
                                      onChange={(e) =>
                                        setFormSelectedIds((prev) => {
                                          const next = new Set(prev);
                                          if (e.target.checked) next.add(t.id);
                                          else next.delete(t.id);
                                          return next;
                                        })
                                      }
                                      className="rounded border-slate-300 text-primary"
                                    />
                                    <span className="font-medium text-slate-800">{t.nome}</span>
                                    {t.codigo && (
                                      <span className="ml-auto text-xs text-slate-400">
                                        {t.codigo}
                                      </span>
                                    )}
                                  </label>
                                ))}
                              </div>
                            );
                          })()}
                          {formSelectedIds.size > 0 && (
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-xs text-primary font-medium">
                                {formSelectedIds.size} selecionada(s)
                              </span>
                              <button
                                type="button"
                                onClick={() => setFormSelectedIds(new Set())}
                                className="text-xs text-slate-400 hover:text-slate-600"
                              >
                                Limpar
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Obrigatoriedade
                          </label>
                          <select
                            value={formObrigatoriedade}
                            onChange={(e) =>
                              setFormObrigatoriedade(e.target.value as typeof formObrigatoriedade)
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          >
                            {OBRIGATORIEDADE_OPTS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Origem
                          </label>
                          <select
                            value={formOrigem}
                            onChange={(e) => setFormOrigem(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          >
                            {ORIGEM_OPTS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={formCritico}
                              onChange={(e) => setFormCritico(e.target.checked)}
                              className="rounded border-slate-300"
                            />
                            <span className="text-sm text-slate-700">Crítico operacional</span>
                            <ShieldCheck className="w-4 h-4 text-orange-500" />
                          </label>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Observações
                          </label>
                          <textarea
                            value={formObs}
                            onChange={(e) => setFormObs(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                            placeholder="Observações opcionais..."
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setShowForm(null)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAddRegistro(funcao.id)}
                          disabled={saving || formSelectedIds.size === 0}
                          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                          {saving && <LoaderCircle className="w-3 h-3 animate-spin" />}
                          {formSelectedIds.size > 1
                            ? `Adicionar ${formSelectedIds.size} qualificações`
                            : 'Adicionar'}
                        </button>
                      </div>
                    </div>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(funcao.id);
                        setFormSelectedIds(new Set());
                        setFormSearch('');
                        setFormObrigatoriedade('OBRIGATORIA');
                        setFormCritico(false);
                        setFormOrigem('REGULATORIO');
                        setFormObs('');
                      }}
                      className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-primary hover:text-primary transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar qualificações a esta função
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
