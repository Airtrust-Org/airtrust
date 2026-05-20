import { useState, useRef } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import Button from '@/react-app/components/Button';
import type { TipoDocumento } from '@/react-app/hooks/usePastaVirtual';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface UploadDocumentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  funcionarioId: number;
  tipoInicial?: TipoDocumento;
}

// Tipos de documento conforme nomenclatura padronizada
const TIPOS_DOCUMENTO = [
  { value: 'CERTIFICADO_QUALIFICACAO', label: 'Certificado de Qualificação ANAC' },
  { value: 'EXAME_MEDICO', label: 'Exame Médico' },
  { value: 'DOCUMENTO_PESSOAL', label: 'Documento Pessoal' },
  { value: 'CERTIFICADO_PROFISSIONAL', label: 'Certificado Profissional' },
  { value: 'CONTRATO', label: 'Contrato / Licença' },
  { value: 'OUTROS', label: 'Outros Documentos' },
] as const;

// Códigos ANAC para certificados de qualificação
const CODIGOS_ANAC = [
  { value: 'PP', label: 'PP - Piloto Privado' },
  { value: 'PC', label: 'PC - Piloto Comercial' },
  { value: 'PLA', label: 'PLA - Piloto de Linha Aérea' },
  { value: 'IFR', label: 'IFR - Voo por Instrumentos' },
  { value: 'INVA', label: 'INVA - Instrutor de Voo (Avião)' },
  { value: 'INVH', label: 'INVH - Instrutor de Voo (Helicóptero)' },
  { value: 'MLTE', label: 'MLTE - Multimotor Terrestre' },
  { value: 'MHPA', label: 'MHPA - Habilitação de Tipo' },
  { value: 'PAGA', label: 'PAGA - Piloto Agrícola' },
  { value: 'CHE', label: 'CHE - Comissário de Voo' },
];

// Tipos de exame médico
const TIPOS_EXAME = [
  { value: 'ASO', label: 'ASO - Admissional/Periódico' },
  { value: 'CCF', label: 'CCF - Certificado de Capacidade Física' },
  { value: 'TOXICOLOGICO', label: 'Exame Toxicológico' },
  { value: 'PCMSO', label: 'PCMSO - Programa de Controle Médico' },
];

// Tipos de documento pessoal
const TIPOS_DOC_PESSOAL = [
  { value: 'RG', label: 'RG - Registro Geral' },
  { value: 'CPF', label: 'CPF - Cadastro de Pessoa Física' },
  { value: 'CNH', label: 'CNH - Carteira Nacional de Habilitação' },
  { value: 'CTPS', label: 'CTPS - Carteira de Trabalho' },
  { value: 'TITULO', label: 'Título de Eleitor' },
  { value: 'PASSAPORTE', label: 'Passaporte' },
  { value: 'RESERVISTA', label: 'Certificado de Reservista' },
];

export default function UploadDocumentoModal({
  isOpen,
  onClose,
  onSuccess,
  funcionarioId,
  tipoInicial,
}: UploadDocumentoModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<string>(
    tipoInicial || 'CERTIFICADO_QUALIFICACAO',
  );
  const [subTipo, setSubTipo] = useState<string>('');
  const [descricao, setDescricao] = useState('');
  const [dataRealizacao, setDataRealizacao] = useState<string>(''); // Data de realização da qualificação
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validacao, setValidacao] = useState<{ valido: boolean; erro?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validação de PDF
  const validarPDF = (arquivo: File): { valido: boolean; erro?: string } => {
    // Extensão
    if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
      return { valido: false, erro: 'Arquivo deve ter extensão .pdf' };
    }

    // MIME type
    if (arquivo.type !== 'application/pdf') {
      return { valido: false, erro: 'Arquivo deve ser do tipo application/pdf' };
    }

    // Tamanho (1KB a 10MB)
    const MIN_SIZE = 1024; // 1KB
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (arquivo.size < MIN_SIZE || arquivo.size > MAX_SIZE) {
      return { valido: false, erro: 'Arquivo deve ter entre 1KB e 10MB' };
    }

    return { valido: true };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const resultado = validarPDF(selectedFile);
      setValidacao(resultado);

      if (resultado.valido) {
        setFile(selectedFile);
        setError(null);
      } else {
        setFile(null);
        setError(resultado.erro || 'Arquivo inválido');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Selecione um arquivo PDF');
      return;
    }

    if (!validacao?.valido) {
      setError(validacao?.erro || 'Arquivo inválido');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('funcionario_id', funcionarioId.toString());
      formData.append('tipo_documento', tipoDocumento);

      if (subTipo) {
        formData.append('sub_tipo', subTipo);
      }

      if (descricao) {
        formData.append('descricao', descricao);
      }

      if (dataRealizacao) {
        formData.append('data_realizacao', dataRealizacao);
      }

      const token = getAccessToken();
      if (!token) {
        throw new Error('Token não encontrado. Faça login novamente.');
      }

      const response = await fetch(`${API_BASE_URL}/pasta-virtual/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao fazer upload do documento');
      }

      // Sucesso
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setTipoDocumento(tipoInicial || 'CERTIFICADO_QUALIFICACAO');
    setSubTipo('');
    setDescricao('');
    setError(null);
    setValidacao(null);
    setUploading(false);
    onClose();
  };

  // Determinar opções de subtipo baseado no tipo selecionado
  const getOpcoesSubTipo = () => {
    switch (tipoDocumento) {
      case 'CERTIFICADO_QUALIFICACAO':
        return CODIGOS_ANAC;
      case 'EXAME_MEDICO':
        return TIPOS_EXAME;
      case 'DOCUMENTO_PESSOAL':
        return TIPOS_DOC_PESSOAL;
      default:
        return [];
    }
  };

  const opcoesSubTipo = getOpcoesSubTipo();
  const mostraSubTipo = opcoesSubTipo.length > 0;

  // Gerar preview do nome padronizado
  const getNomePadronizado = () => {
    if (!file) return '';

    const dataAtual = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const nomeFuncionario = 'NOME_FUNCIONARIO'; // Placeholder - será preenchido pelo backend

    switch (tipoDocumento) {
      case 'CERTIFICADO_QUALIFICACAO':
        return subTipo
          ? `CERT-${nomeFuncionario}-${subTipo}-${dataAtual}.pdf`
          : `CERT-${nomeFuncionario}-[CODIGO]-${dataAtual}.pdf`;
      case 'EXAME_MEDICO':
        return subTipo
          ? `EXAME-${subTipo}-${nomeFuncionario}-${dataAtual}.pdf`
          : `EXAME-[TIPO]-${nomeFuncionario}-${dataAtual}.pdf`;
      default:
        return `DOC-${tipoDocumento}-${nomeFuncionario}-${dataAtual}-[UUID].pdf`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Upload de Documento</h2>
              <p className="text-sm text-gray-500">Apenas arquivos PDF (1KB - 10MB)</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            disabled={uploading}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Tipo de Documento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Documento <span className="text-red-500">*</span>
            </label>
            <select
              value={tipoDocumento}
              onChange={(e) => {
                setTipoDocumento(e.target.value);
                setSubTipo(''); // Reset subtipo ao mudar tipo
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={uploading}
            >
              {TIPOS_DOCUMENTO.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </div>

          {/* Subtipo (condicional) */}
          {mostraSubTipo && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tipoDocumento === 'CERTIFICADO_QUALIFICACAO' && 'Tipo de Licença'}
                {tipoDocumento === 'EXAME_MEDICO' && 'Tipo de Exame'}
                {tipoDocumento === 'DOCUMENTO_PESSOAL' && 'Tipo de Documento'}
                {subTipo && <span className="text-red-500"> *</span>}
              </label>
              <select
                value={subTipo}
                onChange={(e) => setSubTipo(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                disabled={uploading}
              >
                <option value="">Selecione...</option>
                {opcoesSubTipo.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Arquivo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Arquivo PDF <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition ${
                file
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 hover:border-primary hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading}
              />

              {file ? (
                <div className="space-y-2">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                  {validacao?.valido && <p className="text-xs text-green-600">✓ Arquivo válido</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto" />
                  <p className="text-gray-600">Clique para selecionar um arquivo PDF</p>
                  <p className="text-xs text-gray-400">Máximo 10MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Preview do Nome Padronizado */}
          {file && validacao?.valido && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-900 mb-1">Nome padronizado do arquivo:</p>
              <code className="text-sm text-blue-700 font-mono break-all">
                {getNomePadronizado()}
              </code>
              <p className="text-xs text-blue-600 mt-2">
                ℹ️ O arquivo original será preservado. Apenas o nome será padronizado.
              </p>
            </div>
          )}

          {/* Data de Realização */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data de Realização <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <input
              type="date"
              value={dataRealizacao}
              onChange={(e) => setDataRealizacao(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={uploading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Data em que a qualificação ou documento foi realizado/emitido. Se não informada, usa a
              data atual.
            </p>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descrição (opcional)
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Adicione uma descrição ou observação sobre este documento..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              rows={3}
              disabled={uploading}
            />
          </div>

          {/* Erro */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Erro no upload</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <Button variant="secondary" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={!file || !validacao?.valido || uploading}
            className="min-w-[120px]"
          >
            {uploading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Enviar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
