import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { apiClient } from '@/react-app/services/apiClient';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import {
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Download,
} from 'lucide-react';

interface QueueItem {
  id: number;
  historico_id: string;
  current_codigo: string | null;
  funcionario_id?: number;
  funcionario_nome?: string;
  data_conclusao?: string;
  data_vencimento?: string;
  numero_certificado?: string;
}

interface Tipo {
  id: string;
  nome: string;
  codigo: string;
  categoria: string;
  validade_meses?: number;
}

export default function ReclassificacaoQualificacoes() {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [progress, setProgress] = useState<{
    total: number;
    pendentes: number;
    aplicadas: number;
    ignoradas: number;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [selectedTipoByHistorico, setSelectedTipoByHistorico] = useState<Record<string, string>>(
    {},
  );
  const [suggestionsByHistorico, setSuggestionsByHistorico] = useState<Record<string, Tipo[]>>({});
  const [loadingSuggestionsFor, setLoadingSuggestionsFor] = useState<string | null>(null);
  const token = useMemo(() => getAccessToken(), []);

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarTudo = async () => {
    setLoading(true);
    try {
      await Promise.all([carregarQueue(), carregarTipos(), carregarProgresso()]);
    } finally {
      setLoading(false);
    }
  };

  const carregarQueue = async () => {
    const resp = await fetch(
      `${API_BASE_URL}/qualificacoes/reclass/queue?limit=500&search=${encodeURIComponent(search)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );
    const data = await resp.json();
    if (data.success) {
      setItems(data.data.items || []);
    }
  };

  const carregarTipos = async () => {
    const response = await apiClient<any>(`${API_BASE_URL}/qualificacoes/tipos`);
    if (response.success) setTipos(response.data || []);
  };

  const carregarProgresso = async () => {
    const response = await apiClient<any>(`${API_BASE_URL}/qualificacoes/reclass/progresso`);
    if (response.success) setProgress(response.data);
  };

  const aplicar = async (historicoId: string) => {
    const targetTipoId = selectedTipoByHistorico[historicoId];
    if (!targetTipoId) {
      toast.warning('Selecione um tipo antes de aplicar');
      return;
    }
    if (
      !(await confirmDialog(
        'Aplicar reclassificação? Esta ação altera definitivamente o registro.',
      ))
    )
      return;
    setApplying(historicoId);
    try {
      const response = await apiClient<any>(
        `${API_BASE_URL}/qualificacoes/reclass/${historicoId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ target_tipo_id: targetTipoId, reason: 'UI manual' }),
        },
      );
      if (response.success) {
        setItems((prev) => prev.filter((i) => i.historico_id !== historicoId));
        setSelectedTipoByHistorico((prev) => {
          const clone = { ...prev };
          delete clone[historicoId];
          return clone;
        });
        await carregarProgresso();
      } else {
        showAlertDialog(response.error || 'Falha ao aplicar');
      }
    } catch (e) {
      toast.warning('Erro na requisição');
    } finally {
      setApplying(null);
    }
  };

  const carregarSugestoes = async (historicoId: string) => {
    setLoadingSuggestionsFor(historicoId);
    try {
      const resp = await fetch(`${API_BASE_URL}/qualificacoes/reclass/sugestoes/${historicoId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await resp.json();
      if (data.success) {
        setSuggestionsByHistorico((prev) => ({ ...prev, [historicoId]: data.data || [] }));
      }
    } catch (e) {
      // silencioso
    } finally {
      setLoadingSuggestionsFor(null);
    }
  };

  const exportarCsv = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/qualificacoes/reclass/queue/export?format=csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!resp.ok) {
        toast.warning('Falha ao exportar');
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reclass_queue_pending.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.warning('Erro ao exportar');
    }
  };

  const tiposFiltrados = useMemo(() => {
    const base = tipos;
    if (!tipoFilter) return base;
    const f = tipoFilter.toLowerCase();
    return base.filter(
      (t) =>
        t.nome.toLowerCase().includes(f) ||
        t.codigo.toLowerCase().includes(f) ||
        t.categoria.toLowerCase().includes(f),
    );
  }, [tipos, tipoFilter]);

  return (
    <AppLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Reclassificação de Qualificações</h1>
        <button
          onClick={carregarTudo}
          disabled={loading}
          className="px-4 py-2 flex items-center gap-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
      <div className="flex gap-3">
        <button
          onClick={exportarCsv}
          className="px-3 py-2 flex items-center gap-2 rounded-lg border text-sm hover:bg-gray-50"
        >
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" /> Sugestões geradas por heurística simples.
        </div>
      </div>

      {/* Progress Bar */}
      {progress && (
        <div className="bg-white border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Total: {progress.total}</span>
            <span>Pendentes: {progress.pendentes}</span>
            <span>Aplicadas: {progress.aplicadas}</span>
            <span>Ignoradas: {progress.ignoradas}</span>
            <span>
              Cobertura:{' '}
              {progress.total > 0
                ? ((progress.aplicadas / progress.total) * 100).toFixed(1) + '%'
                : '0%'}
            </span>
          </div>
          <div className="h-2 w-full bg-gray-200 rounded overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.aplicadas / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-600">Buscar Funcionário</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') carregarQueue();
              }}
              placeholder="Nome ou ID"
              className="pl-9 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-600">Filtrar Tipos</label>
          <input
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            placeholder="Buscar tipo (nome/código/categoria)"
            className="px-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-600">Ações</label>
          <div className="flex gap-2">
            <button
              onClick={carregarQueue}
              className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Atualizar Lista
            </button>
            <button
              onClick={async () => {
                setSearch('');
                setTipoFilter('');
                carregarQueue();
              }}
              className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Histórico ID</th>
                <th className="px-4 py-3 text-left">Funcionário</th>
                <th className="px-4 py-3 text-left">Data Conclusão</th>
                <th className="px-4 py-3 text-left">Data Vencimento</th>
                <th className="px-4 py-3 text-left">Código Atual</th>
                <th className="px-4 py-3 text-left">Selecionar Tipo</th>
                <th className="px-4 py-3 text-left">Sugestões</th>
                <th className="px-4 py-3 text-left">Aplicar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    Nenhum registro pendente
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const historicoId = item.historico_id.toString();
                  const selectedTipoId = selectedTipoByHistorico[historicoId];
                  const selectedTipo = tipos.find((t) => t.id === selectedTipoId);
                  return (
                    <tr key={historicoId} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{historicoId}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <FuncionarioLink
                            funcionarioId={item.funcionario_id}
                            nome={item.funcionario_nome || '—'}
                            className="font-medium text-gray-800 truncate max-w-[180px]"
                          />
                          <span className="text-xs text-gray-500">ID: {item.funcionario_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {item.data_conclusao?.split('T')[0] || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {item.data_vencimento?.split('T')[0] || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        <span className="inline-flex items-center gap-1">
                          {item.current_codigo || 'GEN'}
                          {item.current_codigo?.startsWith('GEN') && (
                            <AlertCircle className="w-3 h-3 text-red-500" title="Genérico" />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          <input
                            list={`tipos-${historicoId}`}
                            placeholder="Código ou nome"
                            value={selectedTipoId ? selectedTipo?.codigo || selectedTipoId : ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              const match = tipos.find(
                                (t) => t.codigo === val || t.id === val || t.nome === val,
                              );
                              if (match) {
                                setSelectedTipoByHistorico((prev) => ({
                                  ...prev,
                                  [historicoId]: match.id,
                                }));
                              }
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs"
                          />
                          <datalist id={`tipos-${historicoId}`}>
                            {tiposFiltrados.map((t) => (
                              <option key={t.id} value={t.codigo}>
                                {t.nome}
                              </option>
                            ))}
                          </datalist>
                          {selectedTipo && (
                            <span className="text-xs text-gray-500 truncate">
                              {selectedTipo.nome} · {selectedTipo.categoria}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <button
                          type="button"
                          onClick={() => carregarSugestoes(historicoId)}
                          disabled={loadingSuggestionsFor === historicoId}
                          className="px-2 py-1 mb-1 rounded border text-xs flex items-center gap-1 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {loadingSuggestionsFor === historicoId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3 text-primary" />
                          )}
                          {loadingSuggestionsFor === historicoId ? 'Gerando...' : 'Sugestões'}
                        </button>
                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {suggestionsByHistorico[historicoId]?.map((s) => (
                            <div
                              key={s.id}
                              className="cursor-pointer px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                              onClick={() =>
                                setSelectedTipoByHistorico((prev) => ({
                                  ...prev,
                                  [historicoId]: s.id,
                                }))
                              }
                              title={`Validade: ${s.validade_meses || '—'} meses`}
                            >
                              <span className="font-medium">{s.codigo}</span> · {s.nome}
                            </div>
                          )) || null}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => aplicar(historicoId)}
                          disabled={!selectedTipoId || applying === historicoId}
                          className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {applying === historicoId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          Aplicar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
