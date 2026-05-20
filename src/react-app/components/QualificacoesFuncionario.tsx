import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Award, AlertTriangle, CheckCircle, XCircle, FileText, Plus } from 'lucide-react';

interface QualificacoesFuncionarioProps {
  funcionarioId: number;
  funcionarioNome?: string;
}

interface Qualificacao {
  id: number;
  tipo: string;
  categoria: string;
  numero?: string;
  data_vencimento: string;
  status_calculado: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
}

export default function QualificacoesFuncionario({
  funcionarioId,
  funcionarioNome,
}: QualificacoesFuncionarioProps) {
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    carregarQualificacoes();
  }, [funcionarioId]);

  const carregarQualificacoes = async () => {
    try {
      setLoading(true);
      setErro(null);
      const response = await fetch(`${API_BASE_URL}/qualificacoes/funcionario/${funcionarioId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setErro('Funcionário não encontrado');
        } else {
          setErro(`Erro ao carregar qualificações (${response.status})`);
        }
        return;
      }

      const data = await response.json();

      if (data.success) {
        setDados(data);
      } else {
        setErro(data.error || 'Erro ao carregar qualificações');
      }
    } catch (error) {
      console.error('Erro ao carregar qualificações:', error);
      setErro('Erro de conexão ao carregar qualificações');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VALIDO':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'VENCENDO':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'VENCIDO':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Award className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'VALIDO':
        return 'bg-green-100 text-green-800';
      case 'VENCENDO':
        return 'bg-yellow-100 text-yellow-800';
      case 'VENCIDO':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatarData = (data: string) => {
    if (!data) return 'N/A';
    return new Date(data).toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
        <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700">{erro}</p>
      </div>
    );
  }

  if (!dados) return null;

  const { funcionario, qualificacoes, stats } = dados;

  return (
    <div className="space-y-4">
      {/* Header com Info do Funcionário */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {funcionarioNome || funcionario.nome}
            </h3>
            <p className="text-sm text-gray-600">
              Matrícula: {funcionario.matricula} | {funcionario.cargo || 'N/A'}
            </p>
          </div>
          <button
            onClick={() => (window.location.href = `/qualificacoes?funcionario=${funcionarioId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Nova Qualificação
          </button>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <Award className="w-6 h-6 mx-auto mb-2 text-gray-600" />
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-sm text-gray-600">Total</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-600" />
            <p className="text-2xl font-bold text-green-600">{stats.validas}</p>
            <p className="text-sm text-gray-600">Válidas</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg text-center">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
            <p className="text-2xl font-bold text-yellow-600">{stats.vencendo}</p>
            <p className="text-sm text-gray-600">Vencendo</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg text-center">
            <XCircle className="w-6 h-6 mx-auto mb-2 text-red-600" />
            <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
            <p className="text-sm text-gray-600">Vencidas</p>
          </div>
        </div>
      </div>

      {/* Lista de Qualificações */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900">
            Qualificações ({qualificacoes.length})
          </h4>
        </div>

        {qualificacoes.length === 0 ? (
          <div className="text-center py-12">
            <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhuma qualificação cadastrada</p>
            <button
              onClick={() => (window.location.href = `/qualificacoes?funcionario=${funcionarioId}`)}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Adicionar Primeira Qualificação
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {qualificacoes.map((qual: Qualificacao) => (
              <div key={qual.id} className="px-6 py-4 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {getStatusIcon(qual.status_calculado)}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h5 className="font-semibold text-gray-900">{qual.categoria}</h5>
                        <span className="px-2 py-1 text-xs font-medium rounded bg-primary/20 text-primary">
                          {qual.tipo}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${getStatusClass(
                            qual.status_calculado,
                          )}`}
                        >
                          {qual.status_calculado}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        {qual.numero && <span>Nº {qual.numero}</span>}
                        <span>Validade: {formatarData(qual.data_vencimento)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.open(`/api/certificados/gerar/${qual.id}`, '_blank')}
                      className="p-2 text-green-600 hover:bg-green-50 rounded"
                      title="Gerar Certificado"
                    >
                      <FileText className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => (window.location.href = `/qualificacoes?edit=${qual.id}`)}
                      className="px-3 py-1 text-primary hover:bg-primary/10 rounded text-sm"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribuição por Tipo */}
      {qualificacoes.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Distribuição por Tipo</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <p className="text-2xl font-bold text-primary">{stats.por_tipo.treinamentos}</p>
              <p className="text-sm text-gray-600 mt-1">Treinamentos</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{stats.por_tipo.checks}</p>
              <p className="text-sm text-gray-600 mt-1">Checks</p>
            </div>
            <div className="text-center p-4 bg-pink-50 rounded-lg">
              <p className="text-2xl font-bold text-pink-600">{stats.por_tipo.exames}</p>
              <p className="text-sm text-gray-600 mt-1">Exames</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
