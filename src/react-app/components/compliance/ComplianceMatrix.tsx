import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Save, CheckSquare, Square, AlertCircle, Users, BookOpen } from 'lucide-react';
import Button from '@/react-app/components/Button';
import Card, { CardContent, CardHeader } from '@/react-app/components/Card';

interface Funcao {
  id: number;
  nome: string;
  descricao?: string;
  categoria?: string;
}

interface ComplianceTraining {
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
  obrigatorio_funcoes?: string;
}

interface ComplianceMatrixProps {
  onBack?: () => void;
}

interface MatrixState {
  [funcaoNome: string]: {
    [treinamentoId: number]: boolean;
  };
}

export default function ComplianceMatrix({ onBack }: ComplianceMatrixProps) {
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [treinamentos, setTreinamentos] = useState<ComplianceTraining[]>([]);
  const [matrix, setMatrix] = useState<MatrixState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFuncao, setSelectedFuncao] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [funcoesResponse, treinamentosResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/funcoes`),
        fetch(`${API_BASE_URL}/treinamentos/catalogo-treinamentos`),
      ]);

      if (!funcoesResponse.ok || !treinamentosResponse.ok) {
        throw new Error('Erro ao carregar dados');
      }

      const funcoesData = await funcoesResponse.json();
      const treinamentosData = await treinamentosResponse.json();

      if (!funcoesData.success || !treinamentosData.success) {
        throw new Error('Erro na resposta da API');
      }

      setFuncoes(funcoesData.data || []);
      setTreinamentos(treinamentosData.data || []);

      const initialMatrix: MatrixState = {};
      funcoesData.data?.forEach((funcao: Funcao) => {
        initialMatrix[funcao.nome] = {};
        treinamentosData.data?.forEach((treinamento: ComplianceTraining) => {
          const obrigatorioFuncoes = treinamento.obrigatorio_funcoes || '';
          const funcoesArray = obrigatorioFuncoes
            .split(',')
            .map((f) => f.trim())
            .filter((f) => f);
          initialMatrix[funcao.nome][treinamento.id] = funcoesArray.includes(funcao.nome);
        });
      });

      setMatrix(initialMatrix);

      if (funcoesData.data && funcoesData.data.length > 0) {
        setSelectedFuncao(funcoesData.data[0].nome);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const toggleRequirement = (funcaoNome: string, treinamentoId: number) => {
    setMatrix((prev) => ({
      ...prev,
      [funcaoNome]: {
        ...prev[funcaoNome],
        [treinamentoId]: !prev[funcaoNome]?.[treinamentoId],
      },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const treinamentoUpdates: { [treinamentoId: number]: string[] } = {};

      treinamentos.forEach((treinamento) => {
        treinamentoUpdates[treinamento.id] = [];
      });

      Object.entries(matrix).forEach(([funcaoNome, treinamentoMap]) => {
        Object.entries(treinamentoMap).forEach(([treinamentoIdStr, isRequired]) => {
          const treinamentoId = parseInt(treinamentoIdStr);
          if (isRequired) {
            treinamentoUpdates[treinamentoId].push(funcaoNome);
          }
        });
      });

      const updatePromises = Object.entries(treinamentoUpdates).map(
        ([treinamentoIdStr, funcoesObrigatorias]) => {
          const treinamentoId = parseInt(treinamentoIdStr);
          const obrigatorioFuncoes = funcoesObrigatorias.join(',');

          return apiFetch(`/api/treinamentos/catalogo-treinamentos/${treinamentoId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              obrigatorio_funcoes: obrigatorioFuncoes,
            }),
          });
        },
      );

      const results = await Promise.all(updatePromises);

      const failedUpdates = results.filter((response) => !response.ok);
      if (failedUpdates.length > 0) {
        throw new Error(`${failedUpdates.length} atualizações falharam`);
      }

      await fetch(`${API_BASE_URL}/compliance/recalculate`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Erro ao salvar matriz:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const getRequiredCount = (funcaoNome: string) => {
    if (!matrix[funcaoNome]) return 0;
    return Object.values(matrix[funcaoNome]).filter(Boolean).length;
  };

  const getTotalRequiredByTraining = (treinamentoId: number) => {
    let count = 0;
    Object.values(matrix).forEach((funcaoMap) => {
      if (funcaoMap[treinamentoId]) count++;
    });
    return count;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-16 bg-gray-200 rounded mb-6"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-600 mb-4">Erro ao carregar matriz: {error}</p>
        <Button variant="primary" onClick={loadData}>
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Matriz de Compliance
              </h2>
              <p className="text-sm text-gray-600">
                Configure quais treinamentos são obrigatórios para cada função
              </p>
            </div>
            <div className="flex gap-3">
              {onBack && (
                <Button variant="secondary" onClick={onBack}>
                  Voltar
                </Button>
              )}
              <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Matriz
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Seletor de Função (Mobile) */}
      <div className="block lg:hidden">
        <Card>
          <CardContent className="p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecionar Função
            </label>
            <select
              value={selectedFuncao}
              onChange={(e) => setSelectedFuncao(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {funcoes.map((funcao) => (
                <option key={funcao.id} value={funcao.nome}>
                  {funcao.nome} ({getRequiredCount(funcao.nome)} obrigatórios)
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>

      {/* Matriz de Compliance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Configuração da Matriz</h3>
            <div className="text-sm text-gray-500">
              {funcoes.length} funções × {treinamentos.length} treinamentos
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 sticky left-0 bg-gray-50 min-w-[200px]">
                    <div className="flex items-center">
                      <BookOpen className="w-4 h-4 mr-2" />
                      Treinamento
                    </div>
                  </th>
                  {funcoes.map((funcao) => (
                    <th
                      key={funcao.id}
                      className="text-center py-3 px-3 font-medium text-gray-900 min-w-[120px]"
                    >
                      <div className="flex flex-col items-center">
                        <Users className="w-4 h-4 mb-1" />
                        <span className="text-xs">{funcao.nome}</span>
                        <span className="text-xs text-gray-500">
                          ({getRequiredCount(funcao.nome)})
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="text-center py-3 px-3 font-medium text-gray-900 min-w-[80px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {treinamentos.map((treinamento) => (
                  <tr key={treinamento.id} className="hover:bg-gray-50">
                    <td className="py-4 px-4 sticky left-0 bg-white hover:bg-gray-50 border-r border-gray-200">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{treinamento.nome}</div>
                        <div className="text-xs text-gray-500">
                          {treinamento.codigo} • {treinamento.categoria}
                        </div>
                      </div>
                    </td>
                    {funcoes.map((funcao) => {
                      const isChecked = matrix[funcao.nome]?.[treinamento.id] || false;
                      return (
                        <td key={funcao.id} className="py-4 px-3 text-center">
                          <button
                            onClick={() => toggleRequirement(funcao.nome, treinamento.id)}
                            className="flex items-center justify-center w-6 h-6 mx-auto text-primary hover:text-primary transition-colors"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-4 px-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                        {getTotalRequiredByTraining(treinamento.id)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="block lg:hidden p-4 space-y-4">
            {selectedFuncao &&
              treinamentos.map((treinamento) => {
                const isChecked = matrix[selectedFuncao]?.[treinamento.id] || false;
                return (
                  <div
                    key={treinamento.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">{treinamento.nome}</div>
                      <div className="text-xs text-gray-500">
                        {treinamento.codigo} • {treinamento.categoria}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRequirement(selectedFuncao, treinamento.id)}
                      className="flex items-center justify-center w-8 h-8 text-primary hover:text-primary transition-colors"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-6 h-6" />
                      ) : (
                        <Square className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-medium text-gray-900">Resumo da Matriz</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="text-2xl font-bold text-primary">{funcoes.length}</div>
              <div className="text-sm text-blue-700">Funções</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{treinamentos.length}</div>
              <div className="text-sm text-green-700">Treinamentos</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {Object.values(matrix).reduce(
                  (total, funcaoMap) => total + Object.values(funcaoMap).filter(Boolean).length,
                  0,
                )}
              </div>
              <div className="text-sm text-purple-700">Requisitos Totais</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
