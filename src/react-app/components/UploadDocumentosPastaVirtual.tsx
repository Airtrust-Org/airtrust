import React, { useState } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Upload, FileUp, X, Loader, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface UploadDocumentosPastaVirtualProps {
  funcionarioId: number;
  onUploadCompleto?: () => void;
  onClose?: () => void;
}

export function UploadDocumentosPastaVirtual({
  funcionarioId,
  onUploadCompleto,
  onClose,
}: UploadDocumentosPastaVirtualProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const tiposDocumentos = [
    'RG',
    'CPF',
    'CNH',
    'CMA',
    'ASO',
    'ICAO',
    'Contrato',
    'Certificado',
    'Outro',
  ];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      validarArquivo(file);
    }
  };

  const validarArquivo = (file: File) => {
    // Validar tipos de arquivo
    const mimePermitidos = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!mimePermitidos.includes(file.type)) {
      toast.error('Tipo de arquivo não permitido. Use: PDF, JPG, PNG, DOC ou DOCX');
      return;
    }

    // Validar tamanho (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('Arquivo muito grande (máximo 10MB)');
      return;
    }

    setArquivo(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validarArquivo(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!arquivo || !tipoDocumento) {
      toast.error('Selecione um arquivo e o tipo de documento');
      return;
    }

    setUploading(true);

    try {
      const token = getAccessToken();
      if (!token) {
        toast.error('Sessão expirada');
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', arquivo);
      formData.append('tipo', tipoDocumento);
      formData.append('descricao', descricao);

      const response = await fetch(`${API_BASE_URL}/funcionarios/${funcionarioId}/documentos`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Erro ao enviar documento');
      }

      toast.success('Documento enviado com sucesso!');
      setArquivo(null);
      setTipoDocumento('');
      setDescricao('');

      if (onUploadCompleto) {
        onUploadCompleto();
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      toast.error(
        `Erro ao enviar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-5 text-center transition ${
          dragOver ? 'border-orange-500 bg-orange-50' : 'border-gray-300 bg-gray-50'
        }`}
      >
        {arquivo ? (
          <div className="flex items-center justify-center gap-3 p-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <FileUp className="w-8 h-8 text-orange-600" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{arquivo.name}</p>
              <p className="text-sm text-gray-500">{(arquivo.size / 1024).toFixed(2)} KB</p>
            </div>
            <button
              onClick={() => setArquivo(null)}
              className="text-red-600 hover:text-red-800 transition p-2 flex-shrink-0"
              title="Remover arquivo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div>
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-700 font-semibold mb-1">
              Arraste arquivos aqui ou clique para selecionar
            </p>
            <p className="text-sm text-gray-500 mb-3">PDF, JPG, PNG, DOC, DOCX (máx. 10MB)</p>
            <label className="inline-block">
              <span className="cursor-pointer text-orange-600 hover:text-orange-700 font-semibold">
                Selecionar arquivo
              </span>
              <input
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
            </label>
          </div>
        )}
      </div>

      {/* Tipo de Documento */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Tipo de Documento *
        </label>
        <select
          value={tipoDocumento}
          onChange={(e) => setTipoDocumento(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        >
          <option value="">Selecione o tipo...</option>
          {tiposDocumentos.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>
      </div>

      {/* Descrição */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Descrição (opcional)
        </label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          placeholder="Adicione uma descrição..."
        />
      </div>

      {/* Informação */}
      <div className="bg-primary/10 border border-blue-200 rounded-lg p-3 flex gap-3">
        <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-primary">
          <p className="font-semibold mb-1">Limite de tamanho</p>
          <p>Máximo 10MB por arquivo. Formatos: PDF, imagens, documentos</p>
        </div>
      </div>

      {/* Botões */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleUpload}
          disabled={!arquivo || !tipoDocumento || uploading}
          className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Loader className="animate-spin" size={20} />
              Enviando...
            </>
          ) : (
            <>
              <FileUp size={20} />
              Enviar Documento
            </>
          )}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

export default UploadDocumentosPastaVirtual;
