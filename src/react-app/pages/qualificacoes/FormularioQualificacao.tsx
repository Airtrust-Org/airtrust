import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Upload, FileText, X } from 'lucide-react';
import SeletorFuncionario from '../../components/SeletorFuncionario';
import { toast } from 'sonner';
import { showAlertDialog } from '@/react-app/utils/confirmDialog';

interface FormularioQualificacaoProps {
  qualificacao?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
}

const FormularioQualificacao = ({
  qualificacao,
  onSave,
  onCancel,
}: FormularioQualificacaoProps) => {
  const [formData, setFormData] = useState({
    funcionario_id: 0,
    tipo: 'TREINAMENTO',
    codigo: '',
    categoria: '',
    data_conclusao: '',
    data_vencimento: '',
    validade_meses: 12,
    vencimento_tipo: 'DIA_EXATO' as 'DIA_EXATO' | 'FIM_DO_MES',
    observacoes: '',
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewArquivo, setPreviewArquivo] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (qualificacao) {
      setFormData(qualificacao);
    }
  }, [qualificacao]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const calcularVencimento = (
    dataConclusao: string,
    validadeMeses: number,
    vencimentoTipo: 'DIA_EXATO' | 'FIM_DO_MES',
  ): string => {
    const data = new Date(dataConclusao + 'T00:00:00Z');
    data.setUTCMonth(data.getUTCMonth() + validadeMeses);

    if (vencimentoTipo === 'FIM_DO_MES') {
      const ano = data.getUTCFullYear();
      const mes = data.getUTCMonth();
      const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0));
      return ultimoDia.toISOString().split('T')[0];
    }

    return data.toISOString().split('T')[0];
  };

  const handleDataConclusaoChange = (dataConclusao: string) => {
    const newFormData = { ...formData, data_conclusao: dataConclusao };

    // Calcular vencimento automaticamente se tiver data de conclusão
    if (dataConclusao && formData.validade_meses) {
      newFormData.data_vencimento = calcularVencimento(
        dataConclusao,
        formData.validade_meses,
        formData.vencimento_tipo,
      );
    }

    setFormData(newFormData);
    if (errors.data_conclusao) {
      setErrors({ ...errors, data_conclusao: '' });
    }
  };

  const handleFuncionarioChange = (funcionarioId: number) => {
    setFormData({ ...formData, funcionario_id: funcionarioId });
    if (errors.funcionario_id) {
      setErrors({ ...errors, funcionario_id: '' });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileChange(e.target.files[0]);
    }
  };

  const handleFileChange = (selectedFile: File) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(selectedFile.type)) {
      toast.error('Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou DOC/DOCX');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (selectedFile.size > maxSize) {
      toast.error('Arquivo muito grande. Limite: 10MB');
      return;
    }

    setArquivo(selectedFile);

    if (selectedFile.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewArquivo(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreviewArquivo(null);
    }
  };

  const removerArquivo = () => {
    setArquivo(null);
    setPreviewArquivo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.funcionario_id) {
      newErrors.funcionario_id = 'Selecione um funcionário';
    }
    if (!formData.categoria) {
      newErrors.categoria = 'Categoria é obrigatória';
    }
    if (!formData.data_conclusao) {
      newErrors.data_conclusao = 'Data de conclusão é obrigatória';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      let arquivoUrl = qualificacao?.arquivo_url || '';

      // Se há um novo arquivo para upload
      if (arquivo) {
        const formDataUpload = new FormData();
        formDataUpload.append('file', arquivo);
        formDataUpload.append('funcionarioId', String(formData.funcionario_id));
        formDataUpload.append('tipo', 'QUALIFICACAO');

        // ✅ CORRIGIDO: Usar endpoint correto de certificados
        // Nota: Este upload requer historicoId, que só existe DEPOIS de criar a qualificação
        // Nota: Upload ocorre antes da criação do historicoId; o path é salvo e vinculado na criação
        const uploadResponse = await fetch(`${API_BASE_URL}/qualificacoes/upload-certificado`, {
          method: 'POST',
          body: formDataUpload,
        });

        if (!uploadResponse.ok) {
          throw new Error('Falha ao fazer upload do arquivo');
        }

        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          arquivoUrl = uploadData.path; // Usar o caminho retornado
          toast.success('Arquivo enviado com sucesso!');
        } else {
          throw new Error(uploadData.error || 'Erro ao enviar arquivo');
        }
      }

      const method = qualificacao ? 'PUT' : 'POST';
      const API_URL = API_BASE_URL.replace('/api', '');
      const url = qualificacao
        ? `${API_URL}/api/qualificacoes/${qualificacao.id}`
        : `${API_URL}/api/qualificacoes`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, arquivo_url: arquivoUrl }),
      });

      const data = await response.json();
      if (data.success) {
        onSave(data);
      } else {
        const errorMsg = data.error || 'Erro desconhecido';
        if (errorMsg.includes('Funcionário não encontrado')) {
          setErrors({ funcionario_id: errorMsg });
        } else {
          showAlertDialog('Erro: ' + errorMsg);
        }
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tipo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo *</label>
        <select
          name="tipo"
          value={formData.tipo}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
        >
          <option value="TREINAMENTO">Treinamento</option>
          <option value="CHECK">Check</option>
          <option value="EXAME">Exame</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <SeletorFuncionario
            value={formData.funcionario_id}
            onChange={handleFuncionarioChange}
            required
            error={errors.funcionario_id}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
          <select
            name="categoria"
            value={formData.categoria}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
          >
            <option value="">Selecione...</option>
            <option value="CMA">CMA - Certificado Médico</option>
            <option value="ASO">ASO - Atestado Saúde</option>
            <option value="ICAO">ICAO - Proficiência Inglês</option>
            <option value="NR35">NR35 - Trabalho em Altura</option>
            <option value="NR10">NR10 - Segurança Elétrica</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Conclusão *</label>
          <input
            type="date"
            name="data_conclusao"
            value={formData.data_conclusao}
            onChange={(e) => handleDataConclusaoChange(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
          />
          {errors.data_conclusao && (
            <p className="text-red-500 text-xs mt-1">{errors.data_conclusao}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Data Vencimento (automática)
          </label>
          <input
            type="date"
            name="data_vencimento"
            value={formData.data_vencimento}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">
            Calculada automaticamente com base na data de conclusão
          </p>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Anexar Certificado</label>

          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !arquivo && document.getElementById('certificado-upload')?.click()}
          >
            <input
              id="certificado-upload"
              type="file"
              className="hidden"
              onChange={handleFileInputChange}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />

            {arquivo ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-blue-500" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                        {arquivo.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(arquivo.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removerArquivo();
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {previewArquivo && arquivo.type === 'application/pdf' && (
                  <div className="mt-4 border rounded-lg overflow-hidden">
                    <iframe
                      src={previewArquivo}
                      className="w-full h-64"
                      title="Pré-visualização do PDF"
                    />
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => document.getElementById('certificado-upload')?.click()}
                    className="text-sm text-primary hover:text-primary font-medium"
                  >
                    Trocar arquivo
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-center">
                  <Upload className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-primary">Clique para fazer upload</span> ou
                  arraste e solte
                </p>
                <p className="text-xs text-gray-500">PDF, DOC, DOCX, JPG ou PNG (máx. 10MB)</p>
              </div>
            )}
          </div>

          {qualificacao?.arquivo_url && !arquivo && (
            <div className="mt-2 text-sm text-gray-600">
              <p>
                Arquivo atual:
                <a
                  href={`/api/certificados/download?path=${encodeURIComponent(
                    qualificacao.arquivo_url,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {qualificacao.arquivo_url.split('/').pop()}
                </a>
              </p>
            </div>
          )}
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
          <textarea
            name="observacoes"
            value={formData.observacoes}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className=" py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className=" py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Salvando...' : qualificacao ? 'Atualizar' : 'Salvar'}
        </button>
      </div>
    </form>
  );
};

export default FormularioQualificacao;
