import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { showToast } from '@/react-app/utils/toast';

type HistoricoQualificacao = {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  funcionario_nome?: string;
  qualificacao_nome?: string;
  codigo?: string;
  tipo_codigo?: string;
  tipo_categoria?: string;
  data_conclusao?: string;
  data_vencimento?: string;
  observacoes?: string;
  validade_meses?: number;
  vencimento_fim_mes?: number;
  renovada?: number | boolean; // Flag de renovação
};

type ModalEditarQualificacaoSimplesProps = {
  aberto: boolean;
  registro: HistoricoQualificacao | null;
  onFechar: () => void;
  onSalvar: () => void;
};

export default function ModalEditarQualificacaoSimples({
  aberto,
  registro,
  onFechar,
  onSalvar,
}: ModalEditarQualificacaoSimplesProps) {
  const [dataRealizacao, setDataRealizacao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataVencimentoPreview, setDataVencimentoPreview] = useState('');
  const [loading, setLoading] = useState(false);

  // Carregar dados do registro quando abrir
  useEffect(() => {
    if (!aberto || !registro) {
      setDataRealizacao('');
      setObservacoes('');
      setDataVencimentoPreview('');
      return;
    }

    console.log('📝 [ModalEditarSimples] Carregando registro completo:', registro);
    console.log('📝 [ModalEditarSimples] Campos importantes:', {
      codigo: registro.codigo,
      tipo_codigo: registro.tipo_codigo,
      categoria: registro.tipo_categoria,
      qualificacao_nome: registro.qualificacao_nome,
    });

    setDataRealizacao(registro.data_conclusao || '');
    setObservacoes(registro.observacoes || '');
    setDataVencimentoPreview(registro.data_vencimento || '');
  }, [aberto, registro]);

  // Calcular data de vencimento quando mudar data de realização
  useEffect(() => {
    if (!dataRealizacao || !registro?.validade_meses) {
      return;
    }

    const calcularVencimento = () => {
      // Criar data em UTC para evitar problemas de timezone
      const [ano, mes, dia] = dataRealizacao.split('-').map(Number);
      const data = new Date(Date.UTC(ano, mes - 1, dia)); // mes é 0-based

      data.setUTCMonth(data.getUTCMonth() + (registro.validade_meses || 0));

      // Se vencimento_fim_mes = 1, ajustar para último dia do mês
      if (registro.vencimento_fim_mes === 1) {
        data.setUTCMonth(data.getUTCMonth() + 1);
        data.setUTCDate(0); // Último dia do mês anterior
      }

      const vencimento = data.toISOString().split('T')[0];
      setDataVencimentoPreview(vencimento);
      console.log('📅 Vencimento calculado (UTC):', vencimento);
    };

    calcularVencimento();
  }, [dataRealizacao, registro]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!registro?.id) {
      showToast.error('Erro: Registro não encontrado');
      return;
    }

    if (!dataRealizacao) {
      showToast.error('Data de realização é obrigatória');
      return;
    }

    try {
      setLoading(true);
      const token = getAccessToken();

      const payload = {
        data_conclusao: dataRealizacao,
        data_vencimento: dataVencimentoPreview,
        observacoes: observacoes || null,
      };

      console.log('💾 Salvando qualificação:', payload);

      const response = await fetch(`${API_BASE_URL}/qualificacoes/historico/${registro.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar');
      }

      showToast.success('Qualificação atualizada com sucesso!');
      onSalvar();
    } catch (err) {
      console.error('❌ Erro ao salvar:', err);
      showToast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  if (!aberto || !registro) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900">Editar Qualificação</h2>
          <button onClick={onFechar} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Caixa Azul - Contexto (readonly) */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-blue-900 mb-3">Contexto da Qualificação</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-blue-700 font-medium">Funcionário:</span>
                <p className="text-blue-900">{registro.funcionario_nome || '-'}</p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Qualificação:</span>
                <p className="text-blue-900">{registro.qualificacao_nome || '-'}</p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Código:</span>
                <p className="text-blue-900 font-mono">
                  {registro.codigo || registro.tipo_codigo || '-'}
                </p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Categoria:</span>
                <p className="text-blue-900">{registro.tipo_categoria || '-'}</p>
              </div>
            </div>
          </div>

          {/* Data de Realização - Campo GRANDE e destacado */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Data de Realização *
            </label>
            <input
              type="date"
              value={dataRealizacao}
              onChange={(e) => setDataRealizacao(e.target.value)}
              className="w-full px-4 py-3 border-2 border-blue-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-blue-500"
              required
            />
          </div>

          {/* Caixa Verde - Preview do Vencimento */}
          {dataVencimentoPreview && (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <h3 className="font-semibold text-green-900 mb-2">
                📅 Vencimento Calculado Automaticamente
              </h3>
              <p className="text-2xl font-bold text-green-700">
                {new Date(dataVencimentoPreview + 'T00:00:00').toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <p className="text-sm text-green-600 mt-1">
                Validade: {registro.validade_meses} meses
                {registro.vencimento_fim_mes === 1 && ' (fim do mês)'}
              </p>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-blue-500"
              placeholder="Informações adicionais (opcional)..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
