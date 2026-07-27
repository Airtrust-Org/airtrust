/**
 * MODAL DE SESSÃO
 *
 * Modal reutilizável para criar e editar sessões de simulador
 * Usado em: módulo de simuladores
 *
 * Stack: React 19 + TypeScript + Tailwind CSS
 * Data: 2025-11-20
 */

import { useState, useEffect } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import TimeInput from '@/react-app/components/TimeInput';
import { normalizeTimeInput } from '@/react-app/lib/time-input';
import { showAlertDialog } from '@/react-app/utils/confirmDialog';

interface Simulador {
  id: number;
  codigo: string;
  tipo_aeronave?: string;
}

interface Modelo {
  id: number;
  codigo: string;
  codigo_canonico?: string | null;
  nome: string;
}

interface Instrutor {
  id: number;
  nome: string;
}

interface Funcionario {
  id: number;
  nome: string;
}

interface SessaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSalvar: () => void;
  sessaoId?: number;
}

export default function SessaoModal({ isOpen, onClose, onSalvar, sessaoId }: SessaoModalProps) {
  const [salvando, setSalvando] = useState(false);
  const [simuladores, setSimuladores] = useState<Simulador[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [instrutores, setInstrutores] = useState<Instrutor[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

  const [formData, setFormData] = useState({
    simulador_id: '',
    modelo_id: '',
    data_inicio: '',
    hora_inicio: '',
    duracao_minutos: 120,
    instrutor_id: '',
    participantes: [{ funcionario_id: '', funcao: 'PIC' as 'PIC' | 'SIC' | 'OBS' }],
  });

  useEffect(() => {
    if (isOpen) {
      carregarDados();
      if (sessaoId) {
        carregarSessao();
      } else {
        resetarFormulario();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessaoId]);

  const carregarDados = async () => {
    try {
      const [resSimuladores, resModelos, resInstrutores, resFuncionarios] = await Promise.all([
        fetch(`${API_BASE_URL}/simuladores`),
        fetch(`${API_BASE_URL}/simuladores/modelos-sessao`),
        fetch(`${API_BASE_URL}/simuladores/instrutores`),
        fetch(`${API_BASE_URL}/funcionarios`),
      ]);

      if (resSimuladores.ok) {
        const data = await resSimuladores.json();
        if (data.success) setSimuladores(data.data || []);
      }

      if (resModelos.ok) {
        const data = await resModelos.json();
        if (data.success) setModelos(data.data || []);
      }

      if (resInstrutores.ok) {
        const data = await resInstrutores.json();
        if (data.success) setInstrutores(data.data || []);
      }

      if (resFuncionarios.ok) {
        const data = await resFuncionarios.json();
        if (data.success) setFuncionarios(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const carregarSessao = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessaoId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const sessao = data.data;
          setFormData({
            simulador_id: sessao.simulador_id?.toString() || '',
            modelo_id: sessao.modelo_id?.toString() || '',
            data_inicio: sessao.data_inicio?.split('T')[0] || '',
            hora_inicio: sessao.data_inicio?.split('T')[1]?.slice(0, 5) || '',
            duracao_minutos: sessao.duracao_minutos || 120,
            instrutor_id: sessao.instrutor_id?.toString() || '',
            participantes: sessao.participantes || [{ funcionario_id: '', funcao: 'PIC' }],
          });
        }
      }
    } catch (error) {
      console.error('Erro ao carregar sessão:', error);
    }
  };

  const resetarFormulario = () => {
    setFormData({
      simulador_id: '',
      modelo_id: '',
      data_inicio: '',
      hora_inicio: '',
      duracao_minutos: 120,
      instrutor_id: '',
      participantes: [{ funcionario_id: '', funcao: 'PIC' }],
    });
  };

  const adicionarParticipante = () => {
    setFormData({
      ...formData,
      participantes: [...formData.participantes, { funcionario_id: '', funcao: 'SIC' }],
    });
  };

  const removerParticipante = (index: number) => {
    if (formData.participantes.length > 1) {
      setFormData({
        ...formData,
        participantes: formData.participantes.filter((_, i) => i !== index),
      });
    }
  };

  const atualizarParticipante = (
    index: number,
    campo: 'funcionario_id' | 'funcao',
    valor: string,
  ) => {
    const novosParticipantes = [...formData.participantes];
    novosParticipantes[index] = { ...novosParticipantes[index], [campo]: valor };
    setFormData({ ...formData, participantes: novosParticipantes });
  };

  const salvar = async () => {
    if (
      !formData.simulador_id ||
      !formData.modelo_id ||
      !formData.data_inicio ||
      !formData.hora_inicio ||
      !formData.instrutor_id
    ) {
      toast.warning('Por favor, preencha todos os campos obrigatórios');
      return;
    }
    const horaInicioNormalizada = normalizeTimeInput(formData.hora_inicio);
    if (!horaInicioNormalizada) {
      toast.warning('Informe um horário válido no formato HH:mm.');
      return;
    }

    if (formData.participantes.some((p) => !p.funcionario_id)) {
      toast.warning('Por favor, selecione todos os participantes');
      return;
    }

    try {
      setSalvando(true);
      const method = sessaoId ? 'PUT' : 'POST';
      const url = sessaoId
        ? `${API_BASE_URL}/simuladores/sessoes/${sessaoId}`
        : `${API_BASE_URL}/simuladores/sessoes`;

      const payload = {
        ...formData,
        simulador_id: parseInt(formData.simulador_id),
        modelo_id: parseInt(formData.modelo_id),
        instrutor_id: parseInt(formData.instrutor_id),
        data_inicio: `${formData.data_inicio}T${horaInicioNormalizada}:00`,
        participantes: formData.participantes.map((p) => ({
          funcionario_id: parseInt(p.funcionario_id),
          funcao: p.funcao,
        })),
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSalvar();
        onClose();
      } else {
        const data = await response.json();
        showAlertDialog(data.error || 'Erro ao salvar sessão');
      }
    } catch (error) {
      console.error('Erro ao salvar sessão:', error);
      toast.warning('Erro ao salvar sessão');
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {sessaoId ? 'Editar Sessão' : 'Nova Sessão'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Simulador e Modelo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Simulador *
              </label>
              <select
                value={formData.simulador_id}
                onChange={(e) => setFormData({ ...formData, simulador_id: e.target.value })}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Selecione...</option>
                {simuladores.map((sim) => (
                  <option key={sim.id} value={sim.id}>
                    {sim.codigo} {sim.tipo_aeronave && `- ${sim.tipo_aeronave}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Modelo de Sessão *
              </label>
              <select
                value={formData.modelo_id}
                onChange={(e) => setFormData({ ...formData, modelo_id: e.target.value })}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Selecione...</option>
                {modelos.map((modelo) => (
                  <option key={modelo.id} value={modelo.id}>
                    {modelo.codigo_canonico || modelo.codigo} - {modelo.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Data, Hora e Duração */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data *
              </label>
              <input
                type="date"
                value={formData.data_inicio}
                onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Hora *
              </label>
              <TimeInput
                value={formData.hora_inicio}
                onChange={(value) => setFormData({ ...formData, hora_inicio: value })}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Duração (min)
              </label>
              <input
                type="number"
                value={formData.duracao_minutos}
                onChange={(e) =>
                  setFormData({ ...formData, duracao_minutos: parseInt(e.target.value) })
                }
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Instrutor */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Instrutor *
            </label>
            <select
              value={formData.instrutor_id}
              onChange={(e) => setFormData({ ...formData, instrutor_id: e.target.value })}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Selecione...</option>
              {instrutores.map((instrutor) => (
                <option key={instrutor.id} value={instrutor.id}>
                  {instrutor.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Participantes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Participantes *
              </label>
              <button
                type="button"
                onClick={adicionarParticipante}
                className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </div>

            <div className="space-y-2">
              {formData.participantes.map((participante, index) => (
                <div key={index} className="flex gap-2">
                  <select
                    value={participante.funcionario_id}
                    onChange={(e) => atualizarParticipante(index, 'funcionario_id', e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Selecione o funcionário...</option>
                    {funcionarios.map((func) => (
                      <option key={func.id} value={func.id}>
                        {func.nome}
                      </option>
                    ))}
                  </select>

                  <select
                    value={participante.funcao}
                    onChange={(e) => atualizarParticipante(index, 'funcao', e.target.value)}
                    className="w-32 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="PIC">PIC</option>
                    <option value="SIC">SIC</option>
                    <option value="OBS">Observador</option>
                  </select>

                  {formData.participantes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removerParticipante(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
          <button
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {salvando ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                {sessaoId ? 'Atualizar' : 'Criar Sessão'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
