import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  qualificacaoId: number;
  onSuccess: () => void;
  onClose: () => void;
}

export default function UploadCertificado({ qualificacaoId, onSuccess, onClose }: Props) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();

    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile: File) => {
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

    setFile(selectedFile);

    if (selectedFile.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('qualificacaoId', qualificacaoId.toString());

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      // ✅ CORRIGIDO: Usar endpoint correto /historico/:id/certificados/upload
      const res = await fetch(
        `${API_BASE_URL}/certificados/historico/${qualificacaoId}/certificados/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      clearInterval(progressInterval);
      setProgress(100);

      const data = await res.json();

      if (data.success) {
        toast.success('Certificado enviado com sucesso!');
        onSuccess();
        setTimeout(() => onClose(), 1500);
      } else {
        toast.error(data.error || 'Erro ao fazer upload');
      }
    } catch (error) {
      console.error('Erro upload:', error);
      toast.error('Erro ao fazer upload do certificado');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">Upload de Certificado</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={uploading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Drag & Drop Area */}
          <div
            className={`
              border-2 border-dashed rounded-lg p-8
              ${dragActive ? 'border-primary bg-primary/10' : 'border-gray-300'}
              ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              transition-all
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById('cert-input')?.click()}
          >
            <input
              id="cert-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleChange}
              className="hidden"
              disabled={uploading}
            />

            {file ? (
              <div className="text-center">
                {/* Ícone do arquivo */}
                <div className="flex justify-center mb-4">
                  {file.type === 'application/pdf' ? (
                    <FileText className="h-16 w-16 text-red-500" />
                  ) : (
                    <FileText className="h-16 w-16 text-blue-500" />
                  )}
                </div>

                {/* Info do arquivo */}
                <p className="font-medium text-gray-900 mb-1">{file.name}</p>
                <p className="text-sm text-gray-500 mb-4">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>

                {/* Preview PDF */}
                {preview && file.type === 'application/pdf' && (
                  <div className="mt-4 border rounded-lg overflow-hidden">
                    <iframe src={preview} className="w-full h-48" title="Preview PDF" />
                  </div>
                )}

                {/* Progress */}
                {uploading && (
                  <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-2">Enviando... {progress}%</p>
                  </div>
                )}

                {!uploading && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPreview(null);
                    }}
                    className="mt-4 text-sm text-red-600 hover:underline"
                  >
                    Remover arquivo
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-sm text-gray-600 mb-2">
                  {dragActive
                    ? 'Solte o arquivo aqui'
                    : 'Arraste um arquivo ou clique para selecionar'}
                </p>
                <p className="text-xs text-gray-500">PDF, DOC, DOCX, JPG ou PNG (máx. 10MB)</p>
              </div>
            )}
          </div>

          {/* Alertas */}
          <div className="mt-4 space-y-2">
            <div className="flex gap-2 p-3 bg-primary/10 rounded-lg">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0" />
              <p className="text-xs text-primary">
                O certificado será armazenado de forma segura no Cloudflare R2
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={uploading}
          >
            Cancelar
          </button>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Fazer Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
