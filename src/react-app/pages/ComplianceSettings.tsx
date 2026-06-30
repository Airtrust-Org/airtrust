// ========================================
// AIRTRUST - COMPLIANCE: CONFIGURAÇÕES E RECÁLCULO
// Componente React 19 para gerenciar recálculo de compliance
// ========================================

import { useState, useEffect, useTransition } from 'react';
import { getAccessToken } from '@/react-app/config/api';
import AppLayout from '@/react-app/components/AppLayout';

// ========================================
// TIPOS
// ========================================

interface RecalculateResponse {
  success: boolean;
  message: string;
  data?: {
    qualificacoes_processadas: number;
    licencas_processadas: number;
    registros_criados: number;
    registros_deletados: number;
    execution_time_ms: number;
  };
  error?: string;
}

interface ComplianceStats {
  total: number;
  conformes: number;
  a_vencer: number;
  vencidos: number;
  pendentes: number;
  percentual_medio: number;
}

interface Requisito {
  id: number;
  funcao: string;
  tipo_recurso: 'qualificacao' | 'licenca' | 'curso_lms';
  referencia: string;
  descricao?: string | null;
  obrigatorio: number;
}

interface RequisitoForm {
  funcao: string;
  tipo_recurso: 'qualificacao' | 'licenca' | 'curso_lms';
  referencia: string;
  descricao: string;
  obrigatorio: boolean;
}

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export function ComplianceSettings() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RecalculateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'funcionario' | 'tipo_qualificacao'>('all');
  const [entityId, setEntityId] = useState<string>('');
  const [stats, setStats] = useState<ComplianceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [requisitos, setRequisitos] = useState<Requisito[]>([]);
  const [loadingRequisitos, setLoadingRequisitos] = useState(false);
  const [modalRequisito, setModalRequisito] = useState<{
    open: boolean;
    editing: Requisito | null;
  }>({ open: false, editing: null });
  const [requisitoForm, setRequisitoForm] = useState<RequisitoForm>({
    funcao: '',
    tipo_recurso: 'qualificacao',
    referencia: '',
    descricao: '',
    obrigatorio: true,
  });
  const [savingRequisito, setSavingRequisito] = useState(false);
  const [requisitoError, setRequisitoError] = useState<string | null>(null);

  const loadRequisitos = async () => {
    setLoadingRequisitos(true);
    try {
      const token = getAccessToken();
      const res = await apiFetch('/api/compliance/requisitos', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setRequisitos(data.data || []);
    } catch {
      /* silencioso */
    } finally {
      setLoadingRequisitos(false);
    }
  };

  const openCreate = () => {
    setRequisitoForm({
      funcao: '',
      tipo_recurso: 'qualificacao',
      referencia: '',
      descricao: '',
      obrigatorio: true,
    });
    setRequisitoError(null);
    setModalRequisito({ open: true, editing: null });
  };

  const openEdit = (r: Requisito) => {
    setRequisitoForm({
      funcao: r.funcao,
      tipo_recurso: r.tipo_recurso,
      referencia: r.referencia,
      descricao: r.descricao || '',
      obrigatorio: r.obrigatorio === 1,
    });
    setRequisitoError(null);
    setModalRequisito({ open: true, editing: r });
  };

  const saveRequisito = async () => {
    if (!requisitoForm.funcao || !requisitoForm.referencia) {
      setRequisitoError('Função e Referência são obrigatórios.');
      return;
    }
    setSavingRequisito(true);
    setRequisitoError(null);
    try {
      const token = getAccessToken();
      const editing = modalRequisito.editing;
      const url = editing
        ? `/api/compliance/requisitos/${editing.id}`
        : '/api/compliance/requisitos';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...requisitoForm, obrigatorio: requisitoForm.obrigatorio ? 1 : 0 }),
      });
      const data = await res.json();
      if (data.success) {
        setModalRequisito({ open: false, editing: null });
        await loadRequisitos();
      } else {
        setRequisitoError(data.error || 'Erro ao salvar');
      }
    } catch (e) {
      setRequisitoError(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setSavingRequisito(false);
    }
  };

  const deleteRequisito = async (id: number) => {
    if (!confirm('Remover este requisito de compliance?')) return;
    const token = getAccessToken();
    await apiFetch(`/api/compliance/requisitos/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadRequisitos();
  };

  useEffect(() => {
    loadRequisitos();
  }, []);

  // ========================================
  // CARREGAR ESTATÍSTICAS
  // ========================================

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const token = getAccessToken();
      const response = await apiFetch('/api/compliance/stats', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar estatísticas');
      }

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // ========================================
  // EXECUTAR RECÁLCULO
  // ========================================

  const handleRecalculate = async (dryRun: boolean = false) => {
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const token = getAccessToken();

        const response = await apiFetch('/api/compliance/recalculate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            scope,
            entity_id: entityId ? parseInt(entityId, 10) : undefined,
            dry_run: dryRun,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erro ao recalcular');
        }

        const data: RecalculateResponse = await response.json();
        setResult(data);

        // Recarregar stats após recálculo real
        if (!dryRun && data.success) {
          await loadStats();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      }
    });
  };

  // Carregar stats na montagem
  useEffect(() => {
    loadStats();
  }, []);

  return (
    <AppLayout>
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">⚙️ Configurações de Compliance</h1>
          <p className="text-gray-600">
            Recalcule os status de compliance de qualificações e licenças
          </p>
        </div>

        {/* Estatísticas Atuais */}
        {stats && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">📊 Estatísticas Atuais</h2>
              <button
                onClick={loadStats}
                disabled={loadingStats}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {loadingStats ? '🔄 Carregando...' : '🔄 Atualizar'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Total</div>
                <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-700">✅ Conformes</div>
                <div className="text-2xl font-bold text-green-800">{stats.conformes}</div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-sm text-yellow-700">⚠️ A Vencer</div>
                <div className="text-2xl font-bold text-yellow-800">{stats.a_vencer}</div>
              </div>

              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-red-700">❌ Vencidos</div>
                <div className="text-2xl font-bold text-red-800">{stats.vencidos}</div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-700">⏳ Pendentes</div>
                <div className="text-2xl font-bold text-blue-800">{stats.pendentes}</div>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-700">📈 Média</div>
                <div className="text-2xl font-bold text-purple-800">
                  {stats.percentual_medio.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Formulário de Recálculo */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">🔄 Recálculo de Compliance</h2>

          <div className="space-y-4">
            {/* Seletor de Escopo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Escopo do Recálculo
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent transition-all"
                disabled={isPending}
              >
                <option value="all">🌐 Todos os registros</option>
                <option value="funcionario">👤 Funcionário específico</option>
                <option value="tipo_qualificacao">📋 Tipo de qualificação</option>
              </select>
            </div>

            {/* Campo ID (condicional) */}
            {scope !== 'all' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {scope === 'funcionario'
                    ? '👤 ID do Funcionário'
                    : '📋 ID do Tipo de Qualificação'}
                </label>
                <input
                  type="number"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder={
                    scope === 'funcionario' ? 'Digite o ID do funcionário' : 'Digite o ID do tipo'
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent transition-all"
                  disabled={isPending}
                />
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => handleRecalculate(true)}
                disabled={isPending || (scope !== 'all' && !entityId)}
                className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isPending ? '⏳ Simulando...' : '🧪 Simular Recálculo'}
              </button>

              <button
                onClick={() => handleRecalculate(false)}
                disabled={isPending || (scope !== 'all' && !entityId)}
                className="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold shadow-md"
              >
                {isPending ? (
                  <>
                    <span className="inline-block animate-spin mr-2">⚙️</span>
                    Recalculando...
                  </>
                ) : (
                  '✅ Executar Recálculo'
                )}
              </button>
            </div>

            {/* Resultados */}
            {result && result.success && result.data && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                  ✅ {result.message}
                </h3>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>
                    • Qualificações processadas:{' '}
                    <strong>{result.data.qualificacoes_processadas}</strong>
                  </li>
                  <li>
                    • Licenças processadas: <strong>{result.data.licencas_processadas}</strong>
                  </li>
                  <li>
                    • Registros criados: <strong>{result.data.registros_criados}</strong>
                  </li>
                  <li>
                    • Registros deletados (soft): <strong>{result.data.registros_deletados}</strong>
                  </li>
                  <li>
                    • Tempo de execução: <strong>{result.data.execution_time_ms}ms</strong>
                  </li>
                </ul>
              </div>
            )}

            {/* Erro */}
            {(error || (result && !result.success)) && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-1 flex items-center gap-2">❌ Erro</h3>
                <p className="text-sm text-red-700">
                  {error || result?.error || 'Erro desconhecido'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Informações sobre Cálculo Automático */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
            ℹ️ Sobre o Cálculo Automático
          </h3>
          <div className="text-sm text-blue-700 space-y-2">
            <p>
              <strong>Triggers D1 ativos:</strong> O sistema calcula automaticamente o status de
              compliance sempre que uma qualificação ou licença é inserida ou atualizada.
            </p>
            <p>
              <strong>Quando usar o recálculo manual:</strong>
            </p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Após migrações de dados</li>
              <li>Correção de dados históricos em massa</li>
              <li>Após mudanças em regras de validade</li>
              <li>Quando há suspeita de inconsistências</li>
            </ul>
            <p className="mt-3">
              <strong>Regras de status:</strong>
            </p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>
                <span className="text-green-700">✅ CONFORME:</span> Vencimento em mais de 30 dias
                (100%)
              </li>
              <li>
                <span className="text-yellow-700">⚠️ A_VENCER:</span> Vencimento em até 30 dias
                (75%)
              </li>
              <li>
                <span className="text-red-700">❌ VENCIDO:</span> Data de vencimento passou (0%)
              </li>
              <li>
                <span className="text-gray-700">⏳ PENDENTE:</span> Sem data de vencimento definida
              </li>
            </ul>
          </div>
        </div>

        {/* === SEÇÃO: REQUISITOS DE COMPLIANCE === */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">📋 Requisitos de Compliance</h2>
              <p className="text-sm text-gray-500 mt-1">
                Defina quais qualificações, licenças ou cursos EAD são obrigatórios por função
              </p>
            </div>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              + Adicionar Requisito
            </button>
          </div>

          {loadingRequisitos ? (
            <p className="text-sm text-gray-400 py-4 text-center">Carregando...</p>
          ) : requisitos.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              Nenhum requisito cadastrado. Adicione o primeiro requisito de compliance.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Função</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Referência</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Obrigatório</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requisitos.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{r.funcao}</td>
                      <td className="px-4 py-3">
                        {r.tipo_recurso === 'qualificacao' && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            Qualificação
                          </span>
                        )}
                        {r.tipo_recurso === 'licenca' && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                            Licença
                          </span>
                        )}
                        {r.tipo_recurso === 'curso_lms' && (
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                            Curso EAD
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{r.referencia}</td>
                      <td className="px-4 py-3 text-gray-500">{r.descricao || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.obrigatorio ? (
                          <span className="text-green-600 font-semibold">✓</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(r)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteRequisito(r.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de requisito */}
        {modalRequisito.open && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {modalRequisito.editing ? 'Editar Requisito' : 'Novo Requisito de Compliance'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Função *</label>
                  <input
                    type="text"
                    value={requisitoForm.funcao}
                    onChange={(e) => setRequisitoForm((f) => ({ ...f, funcao: e.target.value }))}
                    placeholder="Ex: Piloto Comandante, Comissário..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Recurso
                  </label>
                  <select
                    value={requisitoForm.tipo_recurso}
                    onChange={(e) =>
                      setRequisitoForm((f) => ({
                        ...f,
                        tipo_recurso: e.target.value as RequisitoForm['tipo_recurso'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="qualificacao">Qualificação</option>
                    <option value="licenca">Licença</option>
                    <option value="curso_lms">Curso EAD (LMS)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Referência *
                    <span className="ml-1 font-normal text-gray-400 text-xs">
                      {requisitoForm.tipo_recurso === 'qualificacao' && '(código da qualificação)'}
                      {requisitoForm.tipo_recurso === 'licenca' && '(tipo da licença)'}
                      {requisitoForm.tipo_recurso === 'curso_lms' && '(ID do curso LMS)'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={requisitoForm.referencia}
                    onChange={(e) =>
                      setRequisitoForm((f) => ({ ...f, referencia: e.target.value }))
                    }
                    placeholder={
                      requisitoForm.tipo_recurso === 'curso_lms' ? 'Ex: 42' : 'Ex: ATP, IFR...'
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <input
                    type="text"
                    value={requisitoForm.descricao}
                    onChange={(e) => setRequisitoForm((f) => ({ ...f, descricao: e.target.value }))}
                    placeholder="Descrição opcional..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requisitoForm.obrigatorio}
                    onChange={(e) =>
                      setRequisitoForm((f) => ({ ...f, obrigatorio: e.target.checked }))
                    }
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-gray-700">Requisito obrigatório</span>
                </label>

                {requisitoError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {requisitoError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setModalRequisito({ open: false, editing: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                  disabled={savingRequisito}
                >
                  Cancelar
                </button>
                <button
                  onClick={saveRequisito}
                  disabled={savingRequisito}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingRequisito ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Voltar */}
        <div className="mt-6 text-center">
          <button
            onClick={() => window.history.back()}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            ← Voltar
          </button>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
