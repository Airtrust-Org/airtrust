import { API_BASE_URL } from '@/react-app/config/api';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, Calendar, TrendingUp } from 'lucide-react';

export default function HistoricoFuncionario() {
  const { funcionario_id } = useParams();
  const [historico, setHistorico] = useState<any>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    carregarHistorico();
  }, [funcionario_id]);

  const carregarHistorico = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/simuladores/sessoes/funcionario/${funcionario_id}`,
      );
      const data = await response.json();
      if (data.success) {
        setHistorico(data);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50">
      <div className="max-w-5xl mx-auto  py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Histórico de Simulador</h1>
          <p className="text-gray-600 mt-1">
            {historico?.funcionario?.nome} - {historico?.funcionario?.matricula}
          </p>
        </div>

        {/* Cards Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Sessões</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {historico?.total_sessoes || 0}
                </p>
              </div>
              <Calendar className="w-12 h-12 text-primary" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Horas Voadas</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {historico?.horas_voadas || 0}h
                </p>
              </div>
              <Clock className="w-12 h-12 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Taxa Aprovação</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">95%</p>
              </div>
              <TrendingUp className="w-12 h-12 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Lista Sessões */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Sessões Realizadas</h2>

          <div className="space-y-4">
            {historico?.sessoes?.map((sessao: any) => (
              <div
                key={sessao.id}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{sessao.simulador}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(sessao.data).toLocaleDateString('pt-BR')} • Instrutor:{' '}
                      {sessao.instrutor}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {sessao.manobras_executadas} manobras executadas
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      sessao.resultado === 'aprovado'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {sessao.resultado}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {(!historico?.sessoes || historico.sessoes.length === 0) && (
            <p className="text-center text-gray-500 py-8">Nenhuma sessão encontrada</p>
          )}
        </div>
      </div>
    </div>
  );
}
