import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Save, X, FileText } from 'lucide-react';
import Button from '../Button';

interface TemplateFormProps {
  template?: any;
  onSubmit: (dados: any) => void;
  onCancel: () => void;
}

interface Manobra {
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
  pontuacao_minima: number;
}

const TemplateForm: React.FC<TemplateFormProps> = ({ template, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    nome: template?.nome || '',
    categoria: template?.categoria || 'CHECK',
    duracao_minutos: template?.duracao_minutos || 120,
    descricao: template?.descricao || '',
    aeronave_aplicavel: template?.aeronave_aplicavel || '',
    nota_minima: template?.nota_minima || 7.0,
  });

  const [manobrasDisponiveis, setManobrasDisponiveis] = useState<Manobra[]>([]);
  const [manobrasSelecionadas, setManobrasSelecionadas] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const carregarManobras = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/simuladores/manobras`);
        const data = await response.json();
        if (data.success) {
          setManobrasDisponiveis(data.data || []);
        }
      } catch (error) {
        console.error('Erro ao carregar manobras:', error);
        setManobrasDisponiveis([
          {
            id: 1,
            codigo: 'M-101.A',
            nome: 'Decolagem Normal',
            categoria: 'DECOLAGEM',
            pontuacao_minima: 5,
          },
          {
            id: 2,
            codigo: 'M-102.A',
            nome: 'Aproximação ILS',
            categoria: 'APROXIMACAO',
            pontuacao_minima: 5,
          },
          {
            id: 3,
            codigo: 'M-103.A',
            nome: 'Pane de Motor',
            categoria: 'EMERGENCIA',
            pontuacao_minima: 5,
          },
          {
            id: 4,
            codigo: 'M-104.A',
            nome: 'Pouso com Vento',
            categoria: 'POUSO',
            pontuacao_minima: 5,
          },
          {
            id: 5,
            codigo: 'M-105.A',
            nome: 'Navegação RNAV',
            categoria: 'NAVEGACAO',
            pontuacao_minima: 5,
          },
        ]);
      }
    };

    carregarManobras();

    if (template?.manobras) {
      setManobrasSelecionadas(template.manobras);
    }
  }, [template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.categoria) {
      toast.warning('Preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);

    const dadosCompletos = {
      ...formData,
      manobras: manobrasSelecionadas,
    };

    try {
      await onSubmit(dadosCompletos);
    } finally {
      setLoading(false);
    }
  };

  const toggleManobra = (manobraId: number) => {
    setManobrasSelecionadas((prev) =>
      prev.includes(manobraId) ? prev.filter((id) => id !== manobraId) : [...prev, manobraId],
    );
  };

  const manobrasAgrupadasPorCategoria = manobrasDisponiveis.reduce(
    (acc, manobra) => {
      if (!acc[manobra.categoria]) {
        acc[manobra.categoria] = [];
      }
      acc[manobra.categoria].push(manobra);
      return acc;
    },
    {} as Record<string, Manobra[]>,
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="text-primary" size={24} />
          <h2 className="text-xl font-semibold text-gray-900">
            {template ? 'Editar Modelo' : 'Novo Modelo'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações Básicas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome do Modelo *
              </label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Ex: Modelo IFR Básico"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoria *</label>
              <select
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                required
              >
                <option value="CHECK">Check</option>
                <option value="TREINAMENTO">Treinamento</option>
                <option value="EMERGENCIA">Emergência</option>
                <option value="PROFICIENCIA">Proficiência</option>
                <option value="RECORRENTE">Recorrente</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duração (minutos)
              </label>
              <input
                type="number"
                value={formData.duracao_minutos}
                onChange={(e) =>
                  setFormData({ ...formData, duracao_minutos: parseInt(e.target.value) || 120 })
                }
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                min="30"
                max="480"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nota Mínima</label>
              <input
                type="number"
                step="0.1"
                value={formData.nota_minima}
                onChange={(e) =>
                  setFormData({ ...formData, nota_minima: parseFloat(e.target.value) || 7.0 })
                }
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                min="0"
                max="10"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Equipamento Aplicável
              </label>
              <input
                type="text"
                value={formData.aeronave_aplicavel}
                onChange={(e) => setFormData({ ...formData, aeronave_aplicavel: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Ex: A320, B737, Todas"
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
            <textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              rows={3}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Descreva o objetivo e conteúdo deste modelo..."
            />
          </div>

          {/* Seleção de Manobras */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <label className="text-sm font-medium text-gray-700">Manobras do Modelo</label>
              <span className="text-xs text-gray-500">
                ({manobrasSelecionadas.length} selecionadas)
              </span>
            </div>

            <div className="border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto">
              {Object.entries(manobrasAgrupadasPorCategoria).map(([categoria, manobras]) => (
                <div key={categoria} className="mb-4 last:mb-0">
                  <h4 className="text-sm font-medium text-gray-800 mb-2 bg-gray-50 px-2 py-1 rounded">
                    {categoria}
                  </h4>
                  <div className="space-y-2">
                    {manobras.map((manobra) => (
                      <label
                        key={manobra.id}
                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={manobrasSelecionadas.includes(manobra.id)}
                          onChange={() => toggleManobra(manobra.id)}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {manobra.codigo} - {manobra.nome}
                          </div>
                          <div className="text-xs text-gray-500">
                            Pontuação mínima: {manobra.pontuacao_minima}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {manobrasDisponiveis.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  <FileText size={24} className="mx-auto mb-2 opacity-50" />
                  <p>Nenhuma manobra disponível</p>
                </div>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={loading}
              className="px-6"
            >
              <X size={16} className="mr-2" />
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="px-6">
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
              ) : (
                <Save size={16} className="mr-2" />
              )}
              {template ? 'Atualizar' : 'Criar'} Modelo
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TemplateForm;
