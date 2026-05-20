/**
 * Formulário de Agendamento de Sessão de Simulador
 * Design moderno seguindo padrão do site
 * Mantém TODOS os endpoints e funcionalidades originais
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { useNavigate } from 'react-router-dom';
import { X, Calendar, Clock, User, Users } from 'lucide-react';

interface Participante {
  colaborador_id: string;
  funcao_na_sessao: 'PIC' | 'SIC' | 'DUAL';
  template_id: string;
}

export default function FormularioAgendamento({
  onCancelar,
  onSucesso,
}: {
  onCancelar?: () => void;
  onSucesso?: () => void;
}) {
  const navigate = useNavigate();

  const [simuladores, setSimuladores] = useState<any[]>([]);
  const [instrutores, setInstrutores] = useState<any[]>([]);
  const [tripulantes, setTripulantes] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [dadosGerais, setDadosGerais] = useState({
    simulador_id: '',
    instrutor_id: '',
    data_inicio: '',
    hora_inicio: '',
    hora_fim: '',
    tipo_sessao: 'PC',
    observacoes: '',
  });

  const [participantes, setParticipantes] = useState<Participante[]>([
    { colaborador_id: '', funcao_na_sessao: 'PIC', template_id: '' },
    { colaborador_id: '', funcao_na_sessao: 'SIC', template_id: '' },
  ]);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);

      const resSimuladores = await fetch(`${API_BASE_URL}/simuladores-consolidado/equipamentos`);
      const dataSimuladores = await resSimuladores.json();
      if (dataSimuladores.success) {
        setSimuladores(dataSimuladores.data || []);
      }

      const resFuncionarios = await fetch(`${API_BASE_URL}/funcionarios`);
      const dataFuncionarios = await resFuncionarios.json();
      if (dataFuncionarios.success) {
        const todos = dataFuncionarios.data || [];
        setTripulantes(todos);
        try {
          const resInstrutores = await fetch(`${API_BASE_URL}/funcionarios/instrutores`);
          const dataInstrutores = await resInstrutores.json();
          if (resInstrutores.ok && dataInstrutores.success) {
            setInstrutores(dataInstrutores.data || []);
          } else {
            setInstrutores(todos.filter((f: any) => f.is_instrutor || f.funcao === 'INSTRUTOR'));
          }
        } catch (_) {
          setInstrutores(todos.filter((f: any) => f.is_instrutor || f.funcao === 'INSTRUTOR'));
        }
      }

      const resTemplates = await fetch(`${API_BASE_URL}/simuladores-consolidado/templates`);
      const dataTemplates = await resTemplates.json();
      if (dataTemplates.success) {
        setTemplates(dataTemplates.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularHoraFim = (horaInicio: string) => {
    if (!horaInicio) return '';
    const [h, m] = horaInicio.split(':').map(Number);
    const novaHora = h + 2;
    return `${String(novaHora).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const handleHoraInicioChange = (valor: string) => {
    setDadosGerais({
      ...dadosGerais,
      hora_inicio: valor,
      hora_fim: calcularHoraFim(valor),
    });
  };

  const validarFormulario = () => {
    if (!dadosGerais.simulador_id) {
      toast.warning('Selecione um simulador');
      return false;
    }

    if (!dadosGerais.instrutor_id) {
      toast.warning('Selecione um instrutor');
      return false;
    }

    if (!dadosGerais.data_inicio || !dadosGerais.hora_inicio || !dadosGerais.hora_fim) {
      toast.warning('Preencha data e horários');
      return false;
    }

    for (let i = 0; i < participantes.length; i++) {
      if (!participantes[i].colaborador_id) {
        toast.warning(`Selecione o participante ${i + 1}`);
        return false;
      }
      if (!participantes[i].template_id) {
        toast.warning(`Selecione o template para o participante ${i + 1}`);
        return false;
      }
    }

    return true;
  };

  const handleSalvar = async () => {
    if (!validarFormulario()) {
      return;
    }

    try {
      setSalvando(true);

      const payload = {
        dados_gerais: {
          simulador_id: parseInt(dadosGerais.simulador_id),
          instrutor_id: parseInt(dadosGerais.instrutor_id),
          treinamento_sessao_id: null, // MANTIDO: sempre null (sem vínculo a treinamento)
          data_inicio: dadosGerais.data_inicio,
          hora_inicio: dadosGerais.hora_inicio,
          hora_fim: dadosGerais.hora_fim,
          tipo_sessao: dadosGerais.tipo_sessao,
          observacoes: dadosGerais.observacoes,
        },
        participantes: participantes.map((p) => ({
          colaborador_id: parseInt(p.colaborador_id),
          funcao_na_sessao: p.funcao_na_sessao,
          template_id: parseInt(p.template_id), // MANTIDO: template por participante
        })),
      };

      const response = await fetch('https://airtrust.airtrust.workers.dev/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();

        if (onSucesso) {
          onSucesso();
        } else if (onCancelar) {
          onCancelar();
        } else {
          navigate('/simuladores');
        }
      } else {
        const error = await response.json();
        console.error('Erro:', error);
        toast.warning(`Erro ao agendar: ${error.error}`);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Agendar Sessão de Simulador</h2>
          <p className="mt-1 text-sm text-gray-500">
            Preencha os dados para criar um novo agendamento
          </p>
        </div>
        {onCancelar && (
          <button
            onClick={onCancelar}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="p-6 space-y-8">
        {/* Dados Gerais */}
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Dados Gerais</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Simulador */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Simulador <span className="text-red-500">*</span>
              </label>
              <select
                value={dadosGerais.simulador_id}
                onChange={(e) => setDadosGerais({ ...dadosGerais, simulador_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              >
                <option value="">Selecione um simulador</option>
                {simuladores.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nome} ({s.codigo})
                  </option>
                ))}
              </select>
            </div>

            {/* Instrutor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instrutor <span className="text-red-500">*</span>
              </label>
              <select
                value={dadosGerais.instrutor_id}
                onChange={(e) => setDadosGerais({ ...dadosGerais, instrutor_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              >
                <option value="">Selecione um instrutor</option>
                {instrutores.map((i) => (
                  <option key={i.id} value={String(i.id)}>
                    {i.nome} {i.codigo_anac ? `(${i.codigo_anac})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Data */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dadosGerais.data_inicio}
                onChange={(e) => setDadosGerais({ ...dadosGerais, data_inicio: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
            </div>

            {/* Tipo de Sessão */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Sessão</label>
              <select
                value={dadosGerais.tipo_sessao}
                onChange={(e) => setDadosGerais({ ...dadosGerais, tipo_sessao: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="PC">PC - Proficiency Check</option>
                <option value="PF">PF - Proficiency Flight</option>
                <option value="TREINAMENTO">Treinamento</option>
                <option value="REQUALIFICACAO">Requalificação</option>
              </select>
            </div>

            {/* Hora Início */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora Início <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={dadosGerais.hora_inicio}
                onChange={(e) => handleHoraInicioChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
            </div>

            {/* Hora Fim */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora Fim <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 ml-2">(calculado automaticamente +2h)</span>
              </label>
              <input
                type="time"
                value={dadosGerais.hora_fim}
                onChange={(e) => setDadosGerais({ ...dadosGerais, hora_fim: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
            </div>
          </div>
        </div>

        {/* Participantes */}
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Participantes</h3>

          <div className="space-y-4">
            {participantes.map((p, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Participante {index + 1}</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Tripulante */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tripulante <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={p.colaborador_id}
                      onChange={(e) => {
                        const novos = [...participantes];
                        novos[index].colaborador_id = e.target.value;
                        setParticipantes(novos);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                      required
                    >
                      <option value="">Selecione</option>
                      {tripulantes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome} {t.codigo_anac ? `(${t.codigo_anac})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Função */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Função <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={p.funcao_na_sessao}
                      onChange={(e) => {
                        const novos = [...participantes];
                        novos[index].funcao_na_sessao = e.target.value as 'PIC' | 'SIC' | 'DUAL';
                        setParticipantes(novos);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                      required
                    >
                      <option value="PIC">PIC - Pilot in Command</option>
                      <option value="SIC">SIC - Second in Command</option>
                      <option value="DUAL">DUAL - Dual Control</option>
                    </select>
                  </div>

                  {/* Template */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={p.template_id}
                      onChange={(e) => {
                        const novos = [...participantes];
                        novos[index].template_id = e.target.value;
                        setParticipantes(novos);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                      required
                    >
                      <option value="">Selecione</option>
                      {templates.map((t) => (
                        <option key={t.id} value={String(t.id)}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
          <textarea
            value={dadosGerais.observacoes}
            onChange={(e) => setDadosGerais({ ...dadosGerais, observacoes: e.target.value })}
            placeholder="Observações gerais sobre a sessão..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Footer com Botões */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <button
          type="button"
          onClick={() => {
            if (onCancelar) {
              onCancelar();
            } else {
              navigate('/simuladores');
            }
          }}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          disabled={salvando}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:bg-primary/50 disabled:cursor-not-allowed"
        >
          {salvando ? 'Agendando...' : 'Agendar Sessão'}
        </button>
      </div>
    </div>
  );
}
