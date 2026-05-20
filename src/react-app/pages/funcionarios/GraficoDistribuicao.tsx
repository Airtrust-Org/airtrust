import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { BarChart3 } from 'lucide-react';

export default function GraficoDistribuicao() {
  const [stats, setStats] = useState<any>({});
  const [tipoGrafico, setTipoGrafico] = useState<'funcao' | 'setor'>('funcao');
  
  useEffect(() => {
    const carregarStats = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/funcionarios/stats`);
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
      }
    };
    
    carregarStats();
  }, []);
  
  const dados = tipoGrafico === 'funcao' 
    ? stats.distribuicaoPorFuncao || [] 
    : stats.distribuicaoPorSetor || [];
  
  const maxValor = Math.max(...dados.map((d: any) => d.total || 0), 1);
  
  const cores = [
    'bg-primary/100',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-red-500',
    'bg-yellow-500'
  ];
  
  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-gray-600" />
          <h3 className="text-lg font-semibold">Distribuição de Funcionários</h3>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setTipoGrafico('funcao')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tipoGrafico === 'funcao'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Por Função
          </button>
          <button
            onClick={() => setTipoGrafico('setor')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tipoGrafico === 'setor'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Por Setor
          </button>
        </div>
      </div>
      
      {dados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Nenhum dado disponível
        </div>
      ) : (
        <div className="space-y-4">
          {dados.map((item: any, index: number) => (
            <div key={index} className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium text-gray-700 truncate">
                {item[tipoGrafico] || 'Sem informação'}
              </div>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                  <div
                    className={`h-full ${cores[index % cores.length]} transition-all duration-500 flex items-center justify-end pr-2`}
                    style={{ width: `${(item.total / maxValor) * 100}%` }}
                  >
                    <span className="text-white text-sm font-semibold">
                      {item.total}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-600 w-16 text-right">
                  {((item.total / dados.reduce((acc: number, d: any) => acc + d.total, 0)) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
