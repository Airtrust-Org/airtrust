import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  habilitacao?: any;
}

/**
 * 📋 MODAL DE EDIÇÃO DE HABILITAÇÕES
 *
 * Filosofia: "Usuário informa o mínimo, sistema calcula o resto"
 *
 * Fluxo:
 * 1. Seleciona Funcionário
 * 2. Seleciona Qualificação → Sistema busca e exibe Validade (read-only)
 * 3. Insere Data de Conclusão → Sistema calcula Data de Vencimento (read-only)
 * 4. Preenche Resultado, Observações
 * 5. Salva → Backend detecta renovação automática
 */
export function ModalHabilitacao({ isOpen, onClose, onSave, habilitacao }: Props) {
  const [form, setForm] = useState({
    funcionario_id: '',
    qualificacao_id: '',
    data_conclusao: '',
    resultado: 'PENDENTE',
    observacoes: '',
    instrutor: '',
  });

  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [qualificacoes, setQualificacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados calculados automaticamente
  const [validadeMeses, setValidadeMeses] = useState<number | null>(null);
  const [dataVencimento, setDataVencimento] = useState<string>('');
  const [userTimezone, setUserTimezone] = useState<string>('');

  /**
   * Ao abrir modal ou mudanças em habilitacao
   */
  useEffect(() => {
    if (isOpen) {
      carregarFuncionarios();
      carregarQualificacoes();

      // Detectar timezone do navegador
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserTimezone(tz);

      if (habilitacao?.id) {
        // Modo edição
        setForm({
          funcionario_id: habilitacao.funcionario_id?.toString() || '',
          qualificacao_id: habilitacao.qualificacao_id?.toString() || '',
          data_conclusao: habilitacao.data_conclusao || '',
          resultado: habilitacao.resultado || 'PENDENTE',
          observacoes: habilitacao.observacoes || '',
          instrutor: habilitacao.instrutor || '',
        });

        // Exibir data de vencimento existente
        if (habilitacao.data_vencimento) {
          setDataVencimento(habilitacao.data_vencimento);
        }

        // Se tem qualificacao_id, buscar a validade dela
        if (habilitacao.qualificacao_id) {
          setTimeout(() => {
            // Note: qualificacao_id pode ser string ou número, comparar como string
            const qual = qualificacoes.find(
              (q) => String(q.id) === String(habilitacao.qualificacao_id),
            );
            if (qual?.validade_meses) {
              console.log('📋 Qualificação carregada em modo edição:', {
                qual,
                validade: qual.validade_meses,
              });
              setValidadeMeses(qual.validade_meses);
            }
          }, 100);
        }
      } else {
        // Modo criação - limpar
        setForm({
          funcionario_id: '',
          qualificacao_id: '',
          data_conclusao: '',
          resultado: 'PENDENTE',
          observacoes: '',
          instrutor: '',
        });
        setValidadeMeses(null);
        setDataVencimento('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, habilitacao?.id]);

  /**
   * Carregar funcionários
   */
  const carregarFuncionarios = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/funcionarios?limit=1000`);
      const data = await response.json();
      if (data.success) setFuncionarios(data.data || []);
    } catch (error) {
      console.error('❌ Erro ao carregar funcionários:', error);
    }
  };

  /**
   * Carregar qualificações
   */
  const carregarQualificacoes = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/qualificacoes`);
      const data = await response.json();
      if (data.data) setQualificacoes(data.data || []);
    } catch (error) {
      console.error('❌ Erro ao carregar qualificações:', error);
    }
  };

  /**
   * Ao selecionar qualificação
   * 1. Buscar validade em meses
   * 2. Exibir como read-only
   * 3. Se data_conclusao existe, recalcular vencimento
   */
  const handleQualificacaoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const qualId = e.target.value;
    setForm({ ...form, qualificacao_id: qualId });

    // Buscar validade da qualificação selecionada
    // Note: q.id pode ser string ou número, então comparar como string
    const qual = qualificacoes.find((q) => String(q.id) === qualId);
    const validade = qual?.validade_meses || null;

    console.log('🔍 Qualificação selecionada:', { qualId, qual, validade });
    setValidadeMeses(validade);

    // Se já tem data de conclusão, recalcular vencimento
    if (form.data_conclusao && validade) {
      const novoVencimento = calcularDataVencimento(form.data_conclusao, validade);
      setDataVencimento(novoVencimento);
    }
  };

  /**
   * Ao mudar data de conclusão
   * Recalcular automaticamente data de vencimento
   */
  const handleDataConclusaoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dataConclusao = e.target.value;
    setForm({ ...form, data_conclusao: dataConclusao });

    if (dataConclusao && validadeMeses) {
      const novoVencimento = calcularDataVencimento(dataConclusao, validadeMeses);
      setDataVencimento(novoVencimento);
    } else {
      setDataVencimento('');
    }
  };

  /**
   * Calcular data de vencimento
   * data_conclusao + validade_meses
   */
  const calcularDataVencimento = (dataConclusao: string, meses: number): string => {
    try {
      const data = new Date(dataConclusao + 'T00:00:00Z');
      data.setMonth(data.getMonth() + meses);
      return data.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  /**
   * Submeter formulário
   *
   * Backend:
   * 1. Detectará timezone do header ou usará a enviada
   * 2. Calculará data_vencimento como validação
   * 3. Detectará renovação automática
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validações obrigatórias
      if (!form.funcionario_id) {
        toast.warning('❌ Selecione um funcionário');
        setLoading(false);
        return;
      }
      if (!form.qualificacao_id) {
        toast.warning('❌ Selecione uma qualificação');
        setLoading(false);
        return;
      }
      if (!form.data_conclusao) {
        toast.warning('❌ Insira a data de conclusão');
        setLoading(false);
        return;
      }
      if (!dataVencimento) {
        toast.warning('❌ Selecione uma qualificação com validade definida');
        setLoading(false);
        return;
      }

      const method = habilitacao?.id ? 'PUT' : 'POST';
      const url = habilitacao?.id
        ? `${API_BASE_URL}/qualificacoes/historico/${habilitacao.id}`
        : `${API_BASE_URL}/qualificacoes/historico`;

      // Preparar dados
      const dados = {
        funcionario_id: parseInt(form.funcionario_id, 10),
        qualificacao_id: parseInt(form.qualificacao_id, 10),
        data_conclusao: form.data_conclusao,
        data_vencimento: dataVencimento, // Calculado automaticamente
        resultado: form.resultado,
        observacoes: form.observacoes || null,
        timezone: userTimezone, // Detectado automaticamente
        instrutor: form.instrutor || null,
        // Removido: eh_renovada e habilitacao_anterior_id (detectados automaticamente no backend)
      };

      console.log('📤 Enviando dados:', dados);

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });

      if (response.ok) {
        onSave?.();
        onClose();
      } else {
        const errorData = await response.json();
        toast.warning(`❌ Erro ao salvar: ${errorData.error || 'Erro desconhecido'}`);
      }
    } catch (err) {
      console.error('❌ Erro:', err);
      toast.warning('❌ Erro ao salvar habilitação');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">
            {habilitacao?.id ? 'Editar Habilitação' : 'Nova Habilitação'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* FUNCIONÁRIO */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Funcionário *</label>
            <select
              value={form.funcionario_id}
              onChange={(e) => setForm({ ...form, funcionario_id: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecione...</option>
              {funcionarios.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>

          {/* QUALIFICAÇÃO E VALIDADE */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qualificação *</label>
              <select
                value={form.qualificacao_id}
                onChange={handleQualificacaoChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione...</option>
                {qualificacoes.map((q) => (
                  <option key={q.id} value={String(q.id)}>
                    {q.nome} ({q.codigo})
                  </option>
                ))}
              </select>
            </div>

            {/* VALIDADE - READ ONLY */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
              <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-primary/10 text-blue-900 font-semibold flex items-center">
                {validadeMeses !== null ? `${validadeMeses} meses` : '—'}
              </div>
            </div>
          </div>

          {/* DATA DE CONCLUSÃO E VENCIMENTO */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Conclusão *
              </label>
              <input
                type="date"
                value={form.data_conclusao}
                onChange={handleDataConclusaoChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* DATA DE VENCIMENTO - READ ONLY */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Vencimento *
              </label>
              <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-green-50 text-green-900 font-semibold flex items-center">
                {dataVencimento ? new Date(dataVencimento).toLocaleDateString('pt-BR') : '—'}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            ⓘ Data de Vencimento é calculada automaticamente (Data de Conclusão + Validade da
            Qualificação)
          </p>

          {/* TIMEZONE - HIDDEN (stored automatically) */}
          <input type="hidden" value={userTimezone} />

          {/* RESULTADO */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resultado</label>
            <select
              value={form.resultado}
              onChange={(e) => setForm({ ...form, resultado: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="PENDENTE">Pendente</option>
              <option value="APROVADO">Aprovado</option>
              <option value="REPROVADO">Reprovado</option>
            </select>
          </div>

          {/* OBSERVAÇÕES */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* INSTRUTOR */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instrutor</label>
            <select
              value={form.instrutor}
              onChange={(e) => setForm({ ...form, instrutor: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Nenhum</option>
              {funcionarios
                .filter((f) => f.is_instrutor === 1 || f.is_instrutor === true)
                .map((f) => (
                  <option key={f.id} value={f.nome}>
                    {f.nome}
                  </option>
                ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Selecione apenas entre os instrutores cadastrados
            </p>
          </div>

          {/* NOTA: Renovação é automática no backend */}
          {habilitacao?.id && habilitacao?.eh_renovada && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                ✅ <strong>Esta é uma habilitação renovada</strong>
              </p>
            </div>
          )}

          {/* BOTÕES */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !form.funcionario_id || !form.qualificacao_id || !dataVencimento}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
