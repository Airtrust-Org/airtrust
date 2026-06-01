import { API_BASE_URL } from '@/react-app/config/api';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import TimeInput from '@/react-app/components/TimeInput';
import { normalizeTimeInput } from '@/react-app/lib/time-input';

import { X, Save } from 'lucide-react';

const isValidTimeValue = (value: string | null): boolean => {
  if (!value) return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FormSessao({ isOpen, onClose, onSuccess }: Props) {
  const [simuladores, setSimuladores] = useState([]);
  const [instrutores, setInstrutores] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [manobras, setManobras] = useState([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    simulador_id: '',
    data: '',
    hora_inicio: '',
    hora_fim: '',
    instrutor_id: '',
    aluno_ids: [] as string[],
    aeronave_simulada: '',
    manobras_planejadas: [] as string[],
    objetivos: '',
  });

  useEffect(() => {
    if (isOpen) {
      carregarDados();
    }
  }, [isOpen]);

  const carregarDados = async () => {
    try {
      const [simResp, funcResp, manResp] = await Promise.all([
        fetch(`${API_BASE_URL}/simuladores`),
        fetch(`${API_BASE_URL}/funcionarios`),
        fetch(`${API_BASE_URL}/simuladores/manobras`),
      ]);

      const simData = await simResp.json();
      const funcData = await funcResp.json();
      const manData = await manResp.json();

      setSimuladores(simData.simuladores || []);
      setInstrutores(funcData.data?.filter((f: any) => f.is_instrutor) || []);
      setAlunos(funcData.data || []);
      setManobras(manData.manobras || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const horaInicio = normalizeTimeInput(formData.hora_inicio);
    const horaFim = normalizeTimeInput(formData.hora_fim);

    if (!isValidTimeValue(horaInicio) || !isValidTimeValue(horaFim)) {
      toast.warning('Informe horários válidos no formato HH:mm (00:00 até 23:59).');
      return;
    }

    if (horaInicio >= horaFim) {
      toast.warning('Hora de início deve ser anterior à hora de término.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, hora_inicio: horaInicio, hora_fim: horaFim }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess?.();
        onClose();
      } else {
        toast.warning(`Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao agendar sessão:', error);
      toast.warning('Erro ao agendar sessão');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Agendar Nova Sessão</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Simulador */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Simulador *</label>
              <select
                required
                value={formData.simulador_id}
                onChange={(e) => setFormData({ ...formData, simulador_id: e.target.value })}
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Selecione...</option>
                {simuladores.map((sim: any) => (
                  <option key={sim.id} value={String(sim.id)}>
                    {sim.nome} - {sim.modelo}
                  </option>
                ))}
              </select>
            </div>

            {/* Data */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data *</label>
              <input
                type="date"
                required
                value={formData.data}
                onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Hora Início */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hora Início *</label>
              <TimeInput
                required
                value={formData.hora_inicio}
                onChange={(value) => setFormData({ ...formData, hora_inicio: value })}
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Hora Fim */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hora Fim *</label>
              <TimeInput
                required
                value={formData.hora_fim}
                onChange={(value) => setFormData({ ...formData, hora_fim: value })}
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Instrutor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Instrutor *</label>
              <select
                required
                value={formData.instrutor_id}
                onChange={(e) => setFormData({ ...formData, instrutor_id: e.target.value })}
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Selecione...</option>
                {instrutores.map((inst: any) => (
                  <option key={inst.id} value={String(inst.id)}>
                    {inst.nome} - {inst.matricula}
                  </option>
                ))}
              </select>
            </div>

            {/* Equipamento Simulado */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Equipamento Simulado
              </label>
              <input
                type="text"
                value={formData.aeronave_simulada}
                onChange={(e) => setFormData({ ...formData, aeronave_simulada: e.target.value })}
                placeholder="Ex: EC135, Bell 407"
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Alunos */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Alunos</label>
            <select
              multiple
              value={formData.aluno_ids}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                setFormData({ ...formData, aluno_ids: selected });
              }}
              className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary h-32"
            >
              {alunos.map((aluno: any) => (
                <option key={aluno.id} value={String(aluno.id)}>
                  {aluno.nome} - {aluno.matricula}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Segure Ctrl/Cmd para selecionar múltiplos</p>
          </div>

          {/* Manobras Planejadas */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Manobras Planejadas
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-4 border border-gray-300 rounded-lg">
              {manobras.map((man: any) => (
                <label key={man.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.manobras_planejadas.includes(man.id.toString())}
                    onChange={(e) => {
                      const id = man.id.toString();
                      setFormData({
                        ...formData,
                        manobras_planejadas: e.target.checked
                          ? [...formData.manobras_planejadas, id]
                          : formData.manobras_planejadas.filter((m) => m !== id),
                      });
                    }}
                    className="w-4 h-4 text-primary rounded"
                  />
                  <span className="text-sm text-gray-700">{man.nome}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Objetivos */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Objetivos da Sessão
            </label>
            <textarea
              value={formData.objetivos}
              onChange={(e) => setFormData({ ...formData, objetivos: e.target.value })}
              rows={4}
              placeholder="Descreva os objetivos desta sessão de treinamento..."
              className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className=" py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className=" py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Agendando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Agendar Sessão
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
