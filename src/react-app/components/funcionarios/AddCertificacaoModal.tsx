import { useState } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Calendar, User, FileText } from 'lucide-react';
import { BaseModal as Modal } from '../modals/BaseModal';
import Button from '../Button';

interface CatalogoTreinamento {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string;
  categoria: string;
  periodicidade_meses?: number;
  ativo: boolean;
}

interface AddCertificacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  funcionarioId: number;
  catalogoTreinamentos: CatalogoTreinamento[];
}

interface FormData {
  treinamento_id: number | '';
  data_conclusao: string;
  data_vencimento: string;
  instrutor: string;
  nota: number | '';
  observacoes: string;
}

export default function AddCertificacaoModal({
  isOpen,
  onClose,
  onSuccess,
  funcionarioId,
  catalogoTreinamentos,
}: AddCertificacaoModalProps) {
  const [formData, setFormData] = useState<FormData>({
    treinamento_id: '',
    data_conclusao: '',
    data_vencimento: '',
    instrutor: '',
    nota: '',
    observacoes: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'treinamento_id' || name === 'nota' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleSave = async (dados: any) => {
    setUploading(true);
    setError(null);

    try {
      const certResponse = await fetch(`${API_BASE_URL}/treinamentos/historico-certificacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });

      const certData = await certResponse.json();

      if (!certResponse.ok) {
        throw new Error(
          certData.error || `Erro HTTP ${certResponse.status}: Falha ao salvar certificação`,
        );
      }

      if (!certData.success || !certData.data?.id) {
        throw new Error('Resposta inválida do servidor: ID da certificação não encontrado');
      }

      const historicoId = certData.data.id;

      if (selectedFile) {
        const formData = new FormData();
        formData.append('arquivo', selectedFile);
        formData.append('historico_id', historicoId.toString());

        const uploadResponse = await fetch(`${API_BASE_URL}/certificados-upload`, {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok) {
          throw new Error(`Erro no upload: ${uploadData.error || 'Falha desconhecida'}`);
        }

        if (!uploadData.success) {
          throw new Error(`Upload falhou: ${uploadData.error || 'Erro desconhecido'}`);
        }
      }

      setFormData({
        treinamento_id: '',
        data_conclusao: '',
        data_vencimento: '',
        instrutor: '',
        nota: '',
        observacoes: '',
      });
      setSelectedFile(null);

      onClose();
      onSuccess?.();
    } catch (error: any) {
      console.error('❌ ERRO CAPTURADO:', error);

      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);

      const modalElement = document.querySelector('[data-testid="add-certificacao-modal"]');
      if (modalElement) {
        modalElement.scrollTop = 0;
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.treinamento_id || !formData.data_conclusao) {
      setError('Treinamento e data de conclusão são obrigatórios');
      return;
    }

    const dados = {
      funcionario_id: Number(funcionarioId),
      treinamento_id: Number(formData.treinamento_id),
      data_conclusao: formData.data_conclusao?.trim() || null,
      data_vencimento: formData.data_vencimento?.trim() || null,
      instrutor: formData.instrutor?.trim() || null,
      nota: formData.nota ? Number(formData.nota) : null,
      observacoes: formData.observacoes?.trim() || null,
      status: 'ATIVO',
    };

    await handleSave(dados);
  };

  const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!validTypes.includes(file.type)) {
        toast.warning('Apenas PDF, JPG ou PNG permitidos');
        event.target.value = '';
        return;
      }
      if (file.size <= 10 * 1024 * 1024) {
        setSelectedFile(file);
        setError(null);
      } else {
        toast.warning('Arquivo deve ter no máximo 10MB');
        event.target.value = '';
      }
    }
  };

  const handleCancel = () => {
    setFormData({
      treinamento_id: '',
      data_conclusao: '',
      data_vencimento: '',
      instrutor: '',
      nota: '',
      observacoes: '',
    });
    setSelectedFile(null);
    setError(null);
    onClose();
  };

  const treinamentosAtivos = catalogoTreinamentos.filter((t) => t.ativo);

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Adicionar Certificação Manual">
      <form onSubmit={handleSubmit} className="p-6 space-y-6" data-testid="add-certificacao-modal">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4" data-testid="form-error">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Seleção de Treinamento */}
        <div>
          <label
            htmlFor="treinamento-select"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Treinamento *
          </label>
          <select
            id="treinamento-select"
            name="treinamento_id"
            value={formData.treinamento_id}
            onChange={handleInputChange}
            required
            data-testid="treinamento-select"
            aria-describedby="treinamento-help"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">Selecione um treinamento</option>
            {treinamentosAtivos.map((treinamento) => (
              <option key={treinamento.id} value={String(treinamento.id)}>
                {treinamento.codigo} - {treinamento.nome} ({treinamento.categoria})
              </option>
            ))}
          </select>
          {treinamentosAtivos.length === 0 && (
            <p className="text-sm text-amber-600 mt-1">
              ⚠️ Nenhum treinamento ativo encontrado no catálogo
            </p>
          )}
        </div>

        {/* Data de Conclusão */}
        <div>
          <label htmlFor="data-conclusao" className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="w-4 h-4 inline mr-2" />
            Data de Conclusão *
          </label>
          <input
            id="data-conclusao"
            type="date"
            name="data_conclusao"
            value={formData.data_conclusao}
            onChange={handleInputChange}
            required
            data-testid="data-conclusao-input"
            aria-describedby="data-conclusao-help"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        {/* Data de Vencimento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="w-4 h-4 inline mr-2" />
            Data de Vencimento
          </label>
          <input
            type="date"
            name="data_vencimento"
            value={formData.data_vencimento}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Deixe em branco se o treinamento não possui vencimento
          </p>
        </div>

        {/* Instrutor */}
        <div>
          <label htmlFor="instrutor-input" className="block text-sm font-medium text-gray-700 mb-2">
            <User className="w-4 h-4 inline mr-2" />
            Instrutor
          </label>
          <input
            id="instrutor-input"
            type="text"
            name="instrutor"
            value={formData.instrutor}
            onChange={handleInputChange}
            placeholder="Nome do instrutor"
            data-testid="instrutor-input"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        {/* Instrutor removido como obrigatório, Nota Final removida conforme especificação */}

        {/* Observações */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
          <textarea
            name="observacoes"
            value={formData.observacoes}
            onChange={handleInputChange}
            rows={3}
            placeholder="Observações adicionais sobre a certificação"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        {/* Upload de Certificado */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Anexar Certificado (PDF/JPG)
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-blue-700 hover:file:bg-primary/20"
          />
          {selectedFile && (
            <p className="mt-2 text-sm text-green-600">Arquivo: {selectedFile.name}</p>
          )}
          {uploading && (
            <div className="mt-2 text-sm text-primary flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              {selectedFile ? 'Enviando arquivo...' : 'Salvando...'}
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={uploading}
            data-testid="cancel-certificacao-btn"
          >
            Cancelar
          </Button>
          <button
            type="submit"
            disabled={uploading}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50"
            data-testid="save-certificacao-btn"
          >
            {uploading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
