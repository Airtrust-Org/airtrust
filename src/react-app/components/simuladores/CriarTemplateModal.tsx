import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { X, Check } from 'lucide-react';
import { TemplateSessao, TemplateSessionManobra } from '../../../shared/types';

interface CriarTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  templateEdit?: TemplateSessao | null;
}

export const CriarTemplateModal: React.FC<CriarTemplateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  templateEdit,
}) => {
  const [formData, setFormData] = useState<TemplateSessao>({
    nome: '',
    duracao_horas: 2,
    tipo: 'BASICO',
    descricao: '',
    manobras: [],
    ativo: true,
  });

  const [manobrasDisponiveis, setManobrasDisponiveis] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const buildCodigoModelo = () => {
    const base = formData.nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);

    return base || 'MODELO';
  };

  useEffect(() => {
    if (isOpen) {
      carregarManobrasDisponiveis();

      if (templateEdit) {
        setFormData(templateEdit);
      } else {
        setFormData({
          nome: '',
          duracao_horas: 2,
          tipo: 'BASICO',
          descricao: '',
          manobras: [],
          ativo: true,
        });
      }
    }
  }, [isOpen, templateEdit]);

  const carregarManobrasDisponiveis = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/manobras`);
      const data = await response.json();

      if (data.success) {
        setManobrasDisponiveis(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar manobras:', error);
    }
  };

  const toggleManobra = (manobra: any) => {
    const jaIncluida = formData.manobras.find((m) => m.manobra_id === manobra.id);

    if (jaIncluida) {
      setFormData((prev) => ({
        ...prev,
        manobras: prev.manobras.filter((m) => m.manobra_id !== manobra.id),
      }));
    } else {
      const novaManobra: TemplateSessionManobra = {
        manobra_id: manobra.id,
        manobra_codigo: manobra.codigo,
        manobra_nome: manobra.nome,
        obrigatoria: true,
      };

      setFormData((prev) => ({
        ...prev,
        manobras: [...prev.manobras, novaManobra],
      }));
    }
  };

  const alternarObrigatoria = (manobraId: number) => {
    setFormData((prev) => ({
      ...prev,
      manobras: prev.manobras.map((m) =>
        m.manobra_id === manobraId ? { ...m, obrigatoria: !m.obrigatoria } : m,
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.nome.trim()) {
        toast.warning('Nome é obrigatório');
        return;
      }

      if (formData.manobras.length === 0) {
        toast.warning('Selecione pelo menos uma manobra');
        return;
      }

      const endpoint = templateEdit
        ? `${API_BASE_URL}/simuladores/modelos-sessao/${templateEdit.id}`
        : `${API_BASE_URL}/simuladores/modelos-sessao`;

      const method = templateEdit ? 'PUT' : 'POST';

      const payload = {
        codigo: buildCodigoModelo(),
        nome: formData.nome?.trim() || null,
        duracao_estimada: formData.duracao_horas ? Number(formData.duracao_horas) * 60 : 120,
        descricao: formData.descricao?.trim() || null,
        manobras: (formData.manobras || []).map((manobra, index) => ({
          manobra_id: manobra.manobra_id,
          ordem: index + 1,
          obrigatoria: manobra.obrigatoria ? 1 : 0,
        })),
      };

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess();
        onClose();
      } else {
      }
    } catch (error) {
      toast.warning('Erro de comunicação com servidor');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-screen overflow-y-auto m-4">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">
            {templateEdit ? 'Editar Modelo' : 'Criar Modelo de Sessão'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* DADOS BÁSICOS */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Informações do Modelo</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Modelo *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Modelo Básico VFR"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duração (horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={formData.duracao_horas}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        duracao_horas: parseInt(e.target.value) || 2,
                      }))
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                  <select
                    value={formData.tipo}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, tipo: e.target.value as any }))
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  >
                    <option value="BASICO">Básico</option>
                    <option value="AVANCADO">Avançado</option>
                    <option value="CHECK">Check/Avaliação</option>
                    <option value="RECORRENTE">Recorrente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData((prev) => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descreva o objetivo desta sessão..."
                  rows={4}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            {/* SELEÇÃO DE MANOBRAS */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Manobras do Modelo ({formData.manobras.length})
                </h3>
              </div>

              <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                <div className="p-3 bg-gray-50 border-b text-sm font-medium text-gray-700">
                  Clique para incluir/remover manobras
                </div>

                {manobrasDisponiveis.map((manobra) => {
                  const incluida = formData.manobras.find((m) => m.manobra_id === manobra.id);

                  return (
                    <div key={manobra.id} className="border-b border-gray-100 last:border-b-0">
                      <div
                        onClick={() => toggleManobra(manobra)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                          incluida ? 'bg-primary/10 border-l-4 border-primary' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                                incluida
                                  ? 'bg-primary/100 border-primary text-white'
                                  : 'border-gray-300'
                              }`}
                            >
                              {incluida && <Check className="h-4 w-4" />}
                            </div>

                            <div>
                              <div className="font-medium text-gray-900">{manobra.codigo}</div>
                              <div className="text-sm text-gray-600">{manobra.nome}</div>
                            </div>
                          </div>

                          {incluida && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                alternarObrigatoria(manobra.id);
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                incluida.obrigatoria
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {incluida.obrigatoria ? 'OBRIGATÓRIA' : 'OPCIONAL'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {formData.manobras.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">
                    <strong>{formData.manobras.length}</strong> manobras selecionadas
                    <br />
                    <strong>{formData.manobras.filter((m) => m.obrigatoria).length}</strong>{' '}
                    obrigatórias,
                    <strong> {formData.manobras.filter((m) => !m.obrigatoria).length}</strong>{' '}
                    opcionais
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : templateEdit ? 'Atualizar' : 'Criar Modelo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CriarTemplateModal;
