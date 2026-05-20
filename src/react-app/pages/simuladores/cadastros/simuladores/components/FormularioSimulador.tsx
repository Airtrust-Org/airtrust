import { API_BASE_URL } from '@/react-app/config/api';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';

export default function FormSimulador() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [carregando, setCarregando] = useState(!!id);
  const [dados, setDados] = useState({
    nome: '',
    modelo: '',
    tipo: 'helicoptero',
    fabricante: '',
    localizacao: '',
    capacidade: 1,
    status: 'operacional',
    observacoes: '',
  });


  useEffect(() => {
    if (id) {
      carregarSimulador();
    }
  }, [id]);

  const carregarSimulador = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/${id}`);
      const data = await response.json();
      if (data.success && data.simulador) {
        setDados(data.simulador);
      }
    } catch (error) {
      console.error('Erro ao carregar simulador:', error);
      toast.warning('❌ Erro ao carregar simulador');
    } finally {
      setCarregando(false);
    }
  };

  const handleSalvar = async () => {
    // Validações
    if (!dados.nome || !dados.modelo || !dados.localizacao) {
      toast.warning('❌ Preencha todos os campos obrigatórios');
      return;
    }

    if (dados.capacidade < 1) {
      toast.warning('❌ Capacidade deve ser pelo menos 1');
      return;
    }

    setLoading(true);
    try {
      const url = id ? `${API_BASE_URL}/simuladores/${id}` : `${API_BASE_URL}/simuladores`;

      const response = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });

      const data = await response.json();

      if (data.success) {
        navigate('/simuladores/lista');
      } else {
        toast.warning(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setLoading(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50">
      <div className="max-w-4xl mx-auto  py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/simuladores/lista')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar para Lista
          </button>

          <h1 className="text-2xl font-bold text-gray-900">{id ? 'Editar' : 'Novo'} Simulador</h1>
          <p className="text-gray-600 mt-1">
            {id ? 'Atualize as informações do simulador' : 'Cadastre um novo simulador no sistema'}
          </p>
        </div>

        {/* Formulário */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="space-y-4">
            {/* Grid 2 colunas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Simulador *
                </label>
                <input
                  type="text"
                  value={dados.nome}
                  onChange={(e) => setDados({ ...dados, nome: e.target.value })}
                  placeholder="Ex: Simulador EC135 - Hangar 1"
                  className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                />
              </div>

              {/* Modelo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Modelo *</label>
                <input
                  type="text"
                  value={dados.modelo}
                  onChange={(e) => setDados({ ...dados, modelo: e.target.value })}
                  placeholder="Ex: EC135 P3"
                  className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo *</label>
                <select
                  value={dados.tipo}
                  onChange={(e) => setDados({ ...dados, tipo: e.target.value })}
                  className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="helicoptero">Helicóptero</option>
                  <option value="aviao">Avião</option>
                  <option value="drone">Drone</option>
                </select>
              </div>

              {/* Fabricante */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fabricante</label>
                <input
                  type="text"
                  value={dados.fabricante}
                  onChange={(e) => setDados({ ...dados, fabricante: e.target.value })}
                  placeholder="Ex: Airbus Helicopters"
                  className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              {/* Localização */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Localização *
                </label>
                <input
                  type="text"
                  value={dados.localizacao}
                  onChange={(e) => setDados({ ...dados, localizacao: e.target.value })}
                  placeholder="Ex: Hangar 3 - Sala 2"
                  className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                />
              </div>

              {/* Capacidade */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Capacidade (alunos) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={dados.capacidade}
                  onChange={(e) =>
                    setDados({ ...dados, capacidade: parseInt(e.target.value) || 1 })
                  }
                  className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={dados.status}
                  onChange={(e) => setDados({ ...dados, status: e.target.value })}
                  className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="operacional">Operacional</option>
                  <option value="manutencao">Em Manutenção</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
              <textarea
                value={dados.observacoes}
                onChange={(e) => setDados({ ...dados, observacoes: e.target.value })}
                rows={4}
                placeholder="Informações adicionais sobre o simulador..."
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => navigate('/simuladores/lista')}
              disabled={loading}
              className=" py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={loading}
              className=" py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {id ? 'Atualizar' : 'Criar'} Simulador
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
