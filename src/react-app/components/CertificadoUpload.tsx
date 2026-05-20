import { useState, useRef } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Upload, File, X, Check, AlertCircle } from 'lucide-react';

interface CertificadoUploadProps {
  qualificacaoId: number;
  funcionarioId: number;
  dataDocumento?: string;
  onUploadSuccess?: (certificado: any) => void;
}

export default function CertificadoUpload({
  qualificacaoId,
  funcionarioId,
  dataDocumento,
  onUploadSuccess,
}: CertificadoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('Apenas arquivos PDF são permitidos');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo: 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSuccess(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];

    if (droppedFile && droppedFile.type === 'application/pdf') {
      if (droppedFile.size <= 10 * 1024 * 1024) {
        setFile(droppedFile);
        setError(null);
        setSuccess(false);
      } else {
        setError('Arquivo muito grande. Máximo: 10MB');
      }
    } else {
      setError('Apenas arquivos PDF são permitidos');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('funcionarioId', funcionarioId.toString());
      formData.append('qualificacaoId', qualificacaoId.toString());

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      // ✅ CORRIGIDO: Usar endpoint correto /historico/:id/certificados/upload
      const response = await fetch(
        `${API_BASE_URL}/certificados/historico/${qualificacaoId}/certificados/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setFile(null);
        if (onUploadSuccess) {
          onUploadSuccess(data.data);
        }
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Erro ao fazer upload');
      }
    } catch (err) {
      setError('Erro ao fazer upload do arquivo');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
    setSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`border-2 border-dashed rounded-lg p-5 text-center transition ${
          file ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        {!file ? (
          <>
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-700 font-medium mb-2">Arraste o arquivo PDF aqui</p>
            <p className="text-gray-500 text-sm mb-4">ou clique para selecionar</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-block px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 cursor-pointer"
            >
              Selecionar PDF
            </label>
            <p className="text-gray-400 text-xs mt-4">Máximo: 10MB</p>
          </>
        ) : (
          <div className="flex items-center justify-between bg-white p-4 rounded border border-blue-200">
            <div className="flex items-center gap-3">
              <File className="h-10 w-10 text-red-600" />
              <div className="text-left">
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              disabled={uploading}
              className="text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Fazendo upload...</span>
            <span className="text-gray-600">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded text-green-700">
          <Check className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">Certificado enviado com sucesso!</span>
        </div>
      )}

      {/* Upload Button */}
      {file && !uploading && !success && (
        <button
          onClick={handleUpload}
          className="w-full px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition"
        >
          Fazer Upload
        </button>
      )}
    </div>
  );
}
