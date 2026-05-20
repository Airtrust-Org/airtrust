import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { CheckCircle, AlertCircle, XCircle, Clock, Calendar, Plus } from 'lucide-react';

interface Qualificacao {
  id: number;
  tipo: string;
  codigo: string;
  nome: string;
  data_conclusao: string;
  data_vencimento: string;
  status_vencimento: 'VALIDA' | 'VENCENDO' | 'VENCIDA' | 'INDEFINIDA';
  dias_para_vencer: number;
}

interface Props {
  funcionarioId: number;
  onAddQualificacao?: () => void;
}

export function QualificacoesCard({ funcionarioId, onAddQualificacao }: Props) {
  const [qualificacoes, setQualificacoes] = useState<Qualificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [compliance, setCompliance] = useState<any>(null);

  useEffect(() => {
    carregarDados();
  }, [funcionarioId]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const resQual = await fetch(`${API_BASE_URL}/funcionarios/search/${funcionarioId}/qualificacoes`);
      const dataQual = await resQual.json();
      
      const resComp = await fetch(`${API_BASE_URL}/funcionarios/search/${funcionarioId}/compliance`);
      const dataComp = await resComp.json();
      
      if (dataQual.success) setQualificacoes(dataQual.data || []);
      if (dataComp.success) setCompliance(dataComp.data);
    } catch (error) {
      console.error('Erro ao carregar qualificações:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VALIDA':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'VENCENDO':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'VENCIDA':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const classes = {
      VALIDA: 'bg-green-100 text-green-700 border-green-300',
      VENCENDO: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      VENCIDA: 'bg-red-100 text-red-700 border-red-300',
      INDEFINIDA: 'bg-gray-100 text-gray-700 border-gray-300'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded border ${classes[status as keyof typeof classes] || classes.INDEFINIDA}`}>
        {status}
      </span>
    );
  };

  const getTipoBadge = (tipo: string) => {
    const classes = {
      TREINAMENTO: 'bg-primary/20 text-blue-700 border-blue-300',
      EXAME: 'bg-purple-100 text-purple-700 border-purple-300',
      CHECK: 'bg-green-100 text-green-700 border-green-300'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded border ${classes[tipo as keyof typeof classes] || classes.TREINAMENTO}`}>
        {tipo}
      </span>
    );
  };

  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getDiasText = (dias: number) => {
    if (dias < 0) return `Vencida há ${Math.abs(Math.floor(dias))} dias`;
    if (dias === 0) return 'Vence hoje';
    return `${Math.floor(dias)} dias`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header com Compliance */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Qualificações</h3>
          {onAddQualificacao && (
            <button
              onClick={onAddQualificacao}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          )}
        </div>

        {compliance && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{compliance.total}</p>
                <p className="text-xs text-gray-600">Total</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{compliance.validas}</p>
                <p className="text-xs text-gray-600">Válidas</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{compliance.vencendo}</p>
                <p className="text-xs text-gray-600">Vencendo</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{compliance.vencidas}</p>
                <p className="text-xs text-gray-600">Vencidas</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Compliance</span>
                <span className={`text-sm font-bold ${
                  compliance.status === 'OK' ? 'text-green-600' :
                  compliance.status === 'ATENCAO' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {compliance.compliance_percent}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    compliance.status === 'OK' ? 'bg-green-500' :
                    compliance.status === 'ATENCAO' ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${compliance.compliance_percent}%` }}
                ></div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lista de Qualificações */}
      <div className="p-6">
        {qualificacoes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhuma qualificação cadastrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {qualificacoes.map((qual) => (
              <div
                key={qual.id}
                className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <div className="flex-shrink-0">
                  {getStatusIcon(qual.status_vencimento)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getTipoBadge(qual.tipo)}
                    <span className="font-medium text-gray-900">{qual.codigo}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{qual.nome}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(qual.data_vencimento)}
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(qual.status_vencimento)}
                    <span className="text-xs text-gray-500">
                      {getDiasText(qual.dias_para_vencer)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
