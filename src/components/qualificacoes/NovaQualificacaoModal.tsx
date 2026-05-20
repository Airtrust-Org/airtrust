import { useState, useEffect, useCallback } from 'react';
import { X, Calendar } from 'lucide-react';
import { getDataHojeHTML } from '@/react-app/utils/dateUtils';

interface NovaQualificacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  funcionarioCpf?: string;
}

interface Funcionario {
  cpf: string;
  nome: string;
  matricula: string;
}

interface TipoQualificacao {
  codigo: string;
  nome: string;
  categoria: string;
  validade: number | null;
  vencimento_fim_mes: number;
}

export function NovaQualificacaoModal({
  isOpen,
  onClose,
  onSuccess,
  funcionarioCpf,
}: NovaQualificacaoModalProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [tipos, setTipos] = useState<TipoQualificacao[]>([]);

  const [formData, setFormData] = useState({
    funcionario_cpf: funcionarioCpf || '',
    qualificacao_codigo: '',
    data_conclusao: getDataHojeHTML(),
    nota: 5.0,
    instrutor: '',
    local: '',
    modalidade: 'PRESENCIAL',
    observacoes: '',
  });

  const [previewVencimento, setPreviewVencimento] = useState<string | null>(null);

  // Carregar funcionários e tipos
  useEffect(() => {
    if (isOpen) {
      carregarOpcoes();
    }
  }, [isOpen]);

  const calcularPreview = useCallback(async () => {
    const tipo = tipos.find((t) => t.codigo === formData.qualificacao_codigo);
    if (!tipo) return;

    if (!tipo.validade) {
      setPreviewVencimento('Vitalício (sem vencimento)');
      return;
    }

    // Calcular localmente
    const conclusao = new Date(formData.data_conclusao);
    const vencimento = new Date(conclusao);
    vencimento.setMonth(vencimento.getMonth() + tipo.validade);

    if (tipo.vencimento_fim_mes === 1) {
      // Ajustar para fim do mês
      vencimento.setMonth(vencimento.getMonth() + 1);
      vencimento.setDate(0);
    }

    const vencimentoFormatado = vencimento.toLocaleDateString('pt-BR');
    const tipoVenc = tipo.vencimento_fim_mes === 1 ? 'fim do mês' : 'dia exato';
    setPreviewVencimento(`${vencimentoFormatado} (${tipoVenc})`);
  }, [tipos, formData.qualificacao_codigo, formData.data_conclusao]);

  // Calcular preview de vencimento
  useEffect(() => {
    if (formData.qualificacao_codigo && formData.data_conclusao) {
      calcularPreview();
    }
  }, [formData.qualificacao_codigo, formData.data_conclusao, calcularPreview]);

  const carregarOpcoes = async () => {
    try {
      const token = localStorage.getItem('authToken');

      const [funcRes, tiposRes] = await Promise.all([
        fetch(
          'https://airtrust-api.airtrust.workers.dev/api/funcionarios?status=ativos&orderBy=nome&order=ASC',
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
        fetch('https://airtrust-api.airtrust.workers.dev/api/qualificacoes/tipos', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (funcRes.ok) {
        const data = await funcRes.json();
        setFuncionarios(data.data || []);
      }

      if (tiposRes.ok) {
        const data = await tiposRes.json();
        setTipos(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar opções:', error);
    }
  };

  const validarFormulario = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.funcionario_cpf) {
      newErrors.funcionario_cpf = 'Funcionário é obrigatório';
    }

    if (!formData.qualificacao_codigo) {
      newErrors.qualificacao_codigo = 'Tipo de qualificação é obrigatório';
    }

    if (!formData.data_conclusao) {
      newErrors.data_conclusao = 'Data de conclusão é obrigatória';
    }

    if (formData.nota !== undefined && (formData.nota < 1 || formData.nota > 5)) {
      newErrors.nota = 'Nota deve estar entre 1 e 5';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validarFormulario()) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');

      const payload = {
        funcionario_cpf: formData.funcionario_cpf?.trim() || null,
        qualificacao_codigo: formData.qualificacao_codigo?.trim() || null,
        data_conclusao: formData.data_conclusao?.trim() || null,
        nota: formData.nota ? Number(formData.nota) : null,
        instrutor: formData.instrutor?.trim() || null,
        local: formData.local?.trim() || null,
        modalidade: formData.modalidade?.trim() || null,
        observacoes: formData.observacoes?.trim() || null,
      };

      const response = await fetch(
        'https://airtrust-api.airtrust.workers.dev/api/qualificacoes/historico',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setErrors({ submit: data.error || 'Erro ao salvar' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar';
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Nova Qualificação</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Erro geral */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {/* Funcionário */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Funcionário <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.funcionario_cpf}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, funcionario_cpf: e.target.value }))
              }
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.funcionario_cpf ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading || !!funcionarioCpf}
            >
              <option value="">Selecione um funcionário</option>
              {funcionarios.map((func) => (
                <option key={func.cpf} value={func.cpf}>
                  {func.nome} (Mat: {func.matricula})
                </option>
              ))}
            </select>
            {errors.funcionario_cpf && (
              <p className="text-xs text-red-600 mt-1">{errors.funcionario_cpf}</p>
            )}
          </div>

          {/* Tipo de Qualificação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Qualificação <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.qualificacao_codigo}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, qualificacao_codigo: e.target.value }))
              }
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.qualificacao_codigo ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading}
            >
              <option value="">Selecione um tipo</option>
              {tipos.map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nome} ({tipo.categoria})
                </option>
              ))}
            </select>
            {errors.qualificacao_codigo && (
              <p className="text-xs text-red-600 mt-1">{errors.qualificacao_codigo}</p>
            )}
          </div>

          {/* Data de Conclusão */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de Conclusão <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.data_conclusao}
              onChange={(e) => setFormData((prev) => ({ ...prev, data_conclusao: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.data_conclusao ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.data_conclusao && (
              <p className="text-xs text-red-600 mt-1">{errors.data_conclusao}</p>
            )}
          </div>

          {/* Preview de Vencimento */}
          {previewVencimento && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={16} className="text-blue-600" />
                <span className="font-medium text-blue-900">Vencimento calculado:</span>
                <span className="text-blue-700">{previewVencimento}</span>
              </div>
            </div>
          )}

          {/* Grid de campos adicionais */}
          <div className="grid grid-cols-2 gap-4">
            {/* Nota */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nota (1-5)</label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={formData.nota}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, nota: parseFloat(e.target.value) }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={loading}
              />
            </div>

            {/* Modalidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modalidade</label>
              <select
                value={formData.modalidade}
                onChange={(e) => setFormData((prev) => ({ ...prev, modalidade: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={loading}
              >
                <option value="PRESENCIAL">Presencial</option>
                <option value="EAD">EAD</option>
                <option value="HIBRIDO">Híbrido</option>
              </select>
            </div>
          </div>

          {/* Instrutor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instrutor/Examinador
            </label>
            <input
              type="text"
              value={formData.instrutor}
              onChange={(e) => setFormData((prev) => ({ ...prev, instrutor: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Nome do instrutor"
              disabled={loading}
            />
          </div>

          {/* Local */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
            <input
              type="text"
              value={formData.local}
              onChange={(e) => setFormData((prev) => ({ ...prev, local: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Ex: São Paulo, SBGR"
              disabled={loading}
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={formData.observacoes}
              onChange={(e) => setFormData((prev) => ({ ...prev, observacoes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              rows={3}
              placeholder="Observações adicionais..."
              disabled={loading}
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              disabled={loading}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
