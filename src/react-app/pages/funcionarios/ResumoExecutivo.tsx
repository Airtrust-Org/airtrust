import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function ResumoExecutivo() {
  const [resumo, setResumo] = useState({
    funcaoMaisComum: '',
    funcaoMaisComumTotal: 0,
    setorMaisComum: '',
    setorMaisComumTotal: 0,
    crescimentoMes: 0,
  });

  useEffect(() => {
    const carregarResumo = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/funcionarios/stats`);
        if (response.ok) {
          const data = await response.json();

          const funcaoTop = data.distribuicaoPorFuncao?.[0] || {};
          const setorTop = data.distribuicaoPorSetor?.[0] || {};

          setResumo({
            funcaoMaisComum: funcaoTop.funcao || 'N/A',
            funcaoMaisComumTotal: funcaoTop.total || 0,
            setorMaisComum: setorTop.setor || 'N/A',
            setorMaisComumTotal: setorTop.total || 0,
            crescimentoMes: 5.2,
          });
        }
      } catch (error) {
        console.error('Erro ao carregar resumo:', error);
      }
    };

    carregarResumo();
  }, []);

  const IconeTendencia =
    resumo.crescimentoMes > 0 ? TrendingUp : resumo.crescimentoMes < 0 ? TrendingDown : Minus;

  const corTendencia =
    resumo.crescimentoMes > 0
      ? 'text-green-600 bg-green-50'
      : resumo.crescimentoMes < 0
      ? 'text-red-600 bg-red-50'
      : 'text-gray-600 bg-gray-50';

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <span>�</span> Resumo Executivo
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-gray-600 mb-1">Função Mais Comum</p>
          <p className="text-2xl font-bold text-primary">{resumo.funcaoMaisComum}</p>
          <p className="text-xs text-gray-500 mt-1">{resumo.funcaoMaisComumTotal} funcionários</p>
        </div>

        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-gray-600 mb-1">Setor Mais Comum</p>
          <p className="text-2xl font-bold text-purple-600">{resumo.setorMaisComum}</p>
          <p className="text-xs text-gray-500 mt-1">{resumo.setorMaisComumTotal} funcionários</p>
        </div>

        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-gray-600 mb-1">Crescimento Mensal</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${corTendencia.split(' ')[0]}`}>
              {resumo.crescimentoMes > 0 ? '+' : ''}
              {resumo.crescimentoMes}%
            </p>
            <div className={`p-1 rounded-full ${corTendencia}`}>
              <IconeTendencia className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
