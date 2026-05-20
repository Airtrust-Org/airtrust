import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Filter } from 'lucide-react';

interface FiltrosAvancadosProps {
  onFiltrar: (filtros: any) => void;
}

export default function FiltrosAvancados({ onFiltrar }: FiltrosAvancadosProps) {
  const [funcoes, setFuncoes] = useState<any[]>([]);
  const [setores, setSetores] = useState<any[]>([]);
  const [funcaoSelecionada, setFuncaoSelecionada] = useState('');
  const [setorSelecionado, setSetorSelecionado] = useState('');
  const [statusSelecionado, setStatusSelecionado] = useState('todos');

  useEffect(() => {
    const carregarOpcoes = async () => {
      try {
        const [funcRes, setRes] = await Promise.all([
          fetch(`${API_BASE_URL}/funcoes`),
          fetch(`${API_BASE_URL}/setores`),
        ]);

        if (funcRes.ok) {
          const data = await funcRes.json();
          setFuncoes(data.data || data || []);
        }

        if (setRes.ok) {
          const data = await setRes.json();
          setSetores(data.data || data || []);
        }
      } catch (error) {
        console.error('Erro ao carregar opções:', error);
      }
    };
    carregarOpcoes();
  }, []);

  useEffect(() => {
    onFiltrar({
      funcao: funcaoSelecionada,
      setor: setorSelecionado,
      status: statusSelecionado,
    });
  }, [funcaoSelecionada, setorSelecionado, statusSelecionado, onFiltrar]);

  const limparFiltros = () => {
    setFuncaoSelecionada('');
    setSetorSelecionado('');
    setStatusSelecionado('todos');
  };

  const filtrosAtivos = [funcaoSelecionada, setorSelecionado].filter(Boolean).length;

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold">Filtros</h3>
          {filtrosAtivos > 0 && (
            <span className="bg-primary/20 text-primary text-xs px-2 py-1 rounded-full">
              {filtrosAtivos}
            </span>
          )}
        </div>
        {filtrosAtivos > 0 && (
          <button onClick={limparFiltros} className="text-sm text-primary hover:text-primary">
            Limpar
          </button>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Função</label>
        <select
          value={funcaoSelecionada}
          onChange={(e) => setFuncaoSelecionada(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary"
        >
          <option value="">Todas as funções</option>
          {funcoes.map((funcao) => (
            <option key={funcao.id} value={String(funcao.id)}>
              {funcao.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Setor</label>
        <select
          value={setorSelecionado}
          onChange={(e) => setSetorSelecionado(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos os setores</option>
          {setores.map((setor) => (
            <option key={setor.id} value={String(setor.id)}>
              {setor.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Status</label>
        <select
          value={statusSelecionado}
          onChange={(e) => setStatusSelecionado(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary"
        >
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>
      </div>
    </div>
  );
}
