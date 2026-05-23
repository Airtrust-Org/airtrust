// @ts-nocheck
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, Clock, AlertCircle, CheckCircle, Save, ArrowLeft, Loader2 } from 'lucide-react';

const formatTimeInput = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const isValidTimeValue = (value: string): boolean => {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
};
import { FuncionarioCombobox } from '../../components/simuladores/FuncionarioCombobox';
import { ModalAtribuirQualificacao } from '@/react-app/components/modals/ModalAtribuirQualificacao';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  funcao: string;
  status: string;
  status_compliance?: 'OK' | 'ATENCAO' | 'VENCIDAS';
}

interface Simulador {
  id: number;
  nome: string;
  tipo: string;
  localizacao?: string;
}

export default function NovoAgendamento() {
  const navigate = useNavigate();
  const { simuladorId } = useParams();

  const [simulador, setSimulador] = useState<Simulador | null>(null);
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [showQualModal, setShowQualModal] = useState(false);

  const [formData, setFormData] = useState({
    data_agendamento: '',
    hora_inicio: '',
    hora_fim: '',
    tipo_sessao: 'TREINAMENTO',
    observacoes: '',
  });

  const [loading, setLoading] = useState(false);
  const [loadingSimulador, setLoadingSimulador] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (simuladorId) {
      loadSimulador();
    }
  }, [simuladorId]);

  const loadSimulador = async () => {
    setLoadingSimulador(true);
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/${simuladorId}`);
      const data = await res.json();
      if (data.success) {
        setSimulador(data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar simulador:', error);
    } finally {
      setLoadingSimulador(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!funcionario) {
      setError('Selecione um funcionário');
      return;
    }

    if (!isValidTimeValue(formData.hora_inicio) || !isValidTimeValue(formData.hora_fim)) {
      setError('Informe horários válidos no formato HH:mm (00:00 até 23:59).');
      return;
    }

    // Validar horários
    if (formData.hora_inicio >= formData.hora_fim) {
      setError('Hora de início deve ser anterior à hora de término');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/agendamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulador_id: parseInt(simuladorId!),
          funcionario_id: funcionario.id,
          ...formData,
        }),
      });

      const data = await res.json();

      if (data.success) {
        navigate(`/simuladores/${simuladorId}`);
      } else {
        setError(data.error || 'Erro ao criar agendamento');
      }
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      setError('Erro ao criar agendamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingSimulador) {
    return (
      <div className="w-full px-4 md: py-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/simuladores/${simuladorId}`)}
            className="flex items-center gap-2 text-primary hover:text-blue-700 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar para simulador
          </button>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Novo Agendamento</h1>

          {simulador && (
            <p className="text-gray-600">
              Simulador: <span className="font-semibold">{simulador.nome}</span>
              {simulador.localizacao && (
                <span className="text-gray-500"> • {simulador.localizacao}</span>
              )}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-5">
          {/* Erro geral */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-900">Erro</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Seleção de Funcionário */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Funcionário *</label>
            <FuncionarioCombobox selected={funcionario} onSelect={(func) => setFuncionario(func)} />

            {funcionario && (
              <button
                type="button"
                onClick={() => setShowQualModal(true)}
                className="mt-2 text-sm text-primary hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Ver qualificações e validar aptidão
              </button>
            )}
          </div>

          {/* Data e Horários */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Data *
              </label>
              <input
                type="date"
                required
                value={formData.data_agendamento}
                onChange={(e) => setFormData({ ...formData, data_agendamento: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
                className="w-full  py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Hora Início *
              </label>
              <input
                type="text"
                required
                value={formData.hora_inicio}
                onChange={(e) => setFormData({ ...formData, hora_inicio: formatTimeInput(e.target.value) })}
                placeholder="HH:MM"
                maxLength={5}
                inputMode="numeric"
                className="w-full  py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Hora Fim *
              </label>
              <input
                type="text"
                required
                value={formData.hora_fim}
                onChange={(e) => setFormData({ ...formData, hora_fim: formatTimeInput(e.target.value) })}
                placeholder="HH:MM"
                maxLength={5}
                inputMode="numeric"
                className="w-full  py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* Tipo de Sessão */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Tipo de Sessão *
            </label>
            <div className="grid grid-cols-4 gap-3">
              {['TREINAMENTO', 'CHECK', 'AVALIACAO', 'PRATICA'].map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setFormData({ ...formData, tipo_sessao: tipo })}
                  className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                    formData.tipo_sessao === tipo
                      ? 'border-primary bg-primary/10 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Observações</label>
            <textarea
              rows={4}
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Informações adicionais sobre o agendamento..."
              className="w-full  py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all"
            />
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(`/simuladores/${simuladorId}`)}
              disabled={loading}
              className=" py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading || !funcionario}
              className=" py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Confirmar Agendamento
                </>
              )}
            </button>
          </div>
        </form>

        {/* Modal de Qualificações */}
        {funcionario && (
          <ModalAtribuirQualificacao
            isOpen={showQualModal}
            onClose={() => setShowQualModal(false)}
            onSuccess={() => {
              // Após criar, podemos recarregar algo se necessário no futuro
              setShowQualModal(false);
            }}
            defaultFuncionarioId={funcionario.id}
          />
        )}
      </div>
    </div>
  );
}
