import { useState, useEffect } from 'react';
import { Settings, Save, X, AlertCircle } from 'lucide-react';
import Button from '../Button';
import Card from '../Card';

interface EquipamentoFormProps {
  equipamento?: any;
  onSalvar: (dados: any) => void;
  onCancelar: () => void;
}

const EquipamentoForm: React.FC<EquipamentoFormProps> = ({ equipamento, onSalvar, onCancelar }) => {
  const [dados, setDados] = useState({
    nome: '',
    codigo_identificacao: '',
    tipo_simulador: 'FFS',
    aeronave_base: '',
    empresa_local: '',
    fabricante: '',
    modelo: '',
    status: 'ATIVO',
    configuracao_tecnica: {
      visual_system: '',
      motion_system: '',
      sound_system: '',
    },
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (equipamento) {
      setDados({
        ...equipamento,
        configuracao_tecnica: equipamento.configuracao_tecnica
          ? typeof equipamento.configuracao_tecnica === 'string'
            ? JSON.parse(equipamento.configuracao_tecnica)
            : equipamento.configuracao_tecnica
          : {
              visual_system: '',
              motion_system: '',
              sound_system: '',
            },
      });
    }
  }, [equipamento]);

  const validarDados = () => {
    const novosErrors: Record<string, string> = {};

    if (!dados.nome.trim()) {
      novosErrors.nome = 'Nome é obrigatório';
    }

    if (!dados.codigo_identificacao.trim()) {
      novosErrors.codigo_identificacao = 'Código de identificação é obrigatório';
    }

    if (!dados.tipo_simulador) {
      novosErrors.tipo_simulador = 'Tipo de simulador é obrigatório';
    }

    if (!dados.aeronave_base.trim()) {
      novosErrors.aeronave_base = 'Aeronave base é obrigatória';
    }

    setErrors(novosErrors);
    return Object.keys(novosErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validarDados()) return;

    setLoading(true);
    try {
      await onSalvar(dados);
    } catch (error) {
      console.error('Erro ao salvar equipamento:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setDados((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleConfigChange = (field: string, value: string) => {
    setDados((prev) => ({
      ...prev,
      configuracao_tecnica: {
        ...prev.configuracao_tecnica,
        [field]: value,
      },
    }));
  };

  const tiposSimulador = [
    { value: 'FFS', label: 'FFS - Full Flight Simulator' },
    { value: 'FNPT-I', label: 'FNPT-I - Flight and Navigation Procedures Trainer I' },
    { value: 'FNPT-II', label: 'FNPT-II - Flight and Navigation Procedures Trainer II' },
    { value: 'BITD', label: 'BITD - Basic Instrument Training Device' },
  ];

  const statusOptions = [
    { value: 'ATIVO', label: 'Ativo' },
    { value: 'MANUTENCAO', label: 'Em Manutenção' },
    { value: 'INATIVO', label: 'Inativo' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Settings className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {equipamento ? 'Editar Simulador' : 'Novo Simulador'}
              </h2>
              <p className="text-gray-600">
                {equipamento
                  ? 'Atualize os dados do simulador'
                  : 'Cadastre um novo simulador no sistema'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações Básicas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome do Simulador *
              </label>
              <input
                type="text"
                value={dados.nome}
                onChange={(e) => handleInputChange('nome', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
                  errors.nome ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Ex: Simulador A320-001"
              />
              {errors.nome && (
                <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.nome}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Código de Identificação *
              </label>
              <input
                type="text"
                value={dados.codigo_identificacao}
                onChange={(e) => handleInputChange('codigo_identificacao', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
                  errors.codigo_identificacao ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Ex: SIM-A320-001"
              />
              {errors.codigo_identificacao && (
                <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.codigo_identificacao}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Simulador *
              </label>
              <select
                value={dados.tipo_simulador}
                onChange={(e) => handleInputChange('tipo_simulador', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
                  errors.tipo_simulador ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                {tiposSimulador.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
              {errors.tipo_simulador && (
                <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.tipo_simulador}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Equipamento Base *
              </label>
              <input
                type="text"
                value={dados.aeronave_base}
                onChange={(e) => handleInputChange('aeronave_base', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
                  errors.aeronave_base ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Ex: A320, B737, A350"
              />
              {errors.aeronave_base && (
                <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.aeronave_base}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Empresa/Local</label>
              <input
                type="text"
                value={dados.empresa_local}
                onChange={(e) => handleInputChange('empresa_local', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Ex: CAE Training Center"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fabricante</label>
              <input
                type="text"
                value={dados.fabricante}
                onChange={(e) => handleInputChange('fabricante', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Ex: CAE, FlightSafety, TRU"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
              <input
                type="text"
                value={dados.modelo}
                onChange={(e) => handleInputChange('modelo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Ex: Series 7000, FS1000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={dados.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Configuração Técnica */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Configuração Técnica</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sistema Visual
                </label>
                <input
                  type="text"
                  value={dados.configuracao_tecnica.visual_system}
                  onChange={(e) => handleConfigChange('visual_system', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ex: 360° LED, 180° LCD"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sistema de Movimento
                </label>
                <input
                  type="text"
                  value={dados.configuracao_tecnica.motion_system}
                  onChange={(e) => handleConfigChange('motion_system', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ex: 6DOF, Fixed Base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sistema de Som
                </label>
                <input
                  type="text"
                  value={dados.configuracao_tecnica.sound_system}
                  onChange={(e) => handleConfigChange('sound_system', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ex: Surround 7.1, Stereo"
                />
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
            <Button type="button" variant="secondary" onClick={onCancelar} disabled={loading}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Salvando...' : equipamento ? 'Atualizar' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default EquipamentoForm;
