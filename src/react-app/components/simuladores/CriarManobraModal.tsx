import { useState, useEffect, useRef } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

interface CriarManobraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (manobra: any) => void;
  manobraEdit?: any;
}

const CriarManobraModal: React.FC<CriarManobraModalProps> = ({
  isOpen,
  onClose,
  onSave,
  manobraEdit
}) => {
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    referencia_qrh: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const codigoRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (manobraEdit) {
        setFormData({
          codigo: manobraEdit.codigo || '',
          nome: manobraEdit.nome || '',
          referencia_qrh: manobraEdit.referencia_qrh || ''
        });
      } else {
        setFormData({
          codigo: '',
          nome: '',
          referencia_qrh: ''
        });
      }
      setErrors({});
      
      setTimeout(() => {
        if (codigoRef.current) {
          codigoRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen, manobraEdit]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'codigo' ? value.toUpperCase() : value
    }));

    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.codigo.trim()) {
      newErrors.codigo = 'Código da manobra é obrigatório';
    } else if (!/^[A-Z]{2,4}-\d{3}[A-Z]?$/i.test(formData.codigo)) {
      newErrors.codigo = 'Formato inválido. Use: MAN-001 ou EMERG-001A';
    }

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome da manobra é obrigatório';
    }

    if (!formData.referencia_qrh.trim()) {
      newErrors.referencia_qrh = 'Referência QRH é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar manobra:', error);
      setErrors({ submit: 'Erro ao salvar manobra. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        className="bg-white rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {manobraEdit ? 'Editar Manobra' : 'Criar Nova Manobra'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="p-6 space-y-4">
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <span className="text-red-800">{errors.submit}</span>
              </div>
            </div>
          )}

          {/* CÓDIGO DA MANOBRA */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código da Manobra *
            </label>
            <input
              ref={codigoRef}
              type="text"
              value={formData.codigo}
              onChange={(e) => handleInputChange('codigo', e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onFocus={(e) => {
                e.target.select();
                e.stopPropagation();
              }}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.codigo ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Ex: MAN-001, EMERG-001A"
              maxLength={20}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.codigo && (
              <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.codigo}</span>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Formato: letras-números (ex: MAN-001)</p>
          </div>

          {/* NOME DA MANOBRA */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome da Manobra *
            </label>
            <input
              type="text"
              value={formData.nome}
              onChange={(e) => handleInputChange('nome', e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.nome ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Ex: Decolagem Normal, Aproximação Visual"
              maxLength={100}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.nome && (
              <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.nome}</span>
              </div>
            )}
          </div>

          {/* REFERÊNCIA QRH */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referência no QRH *
            </label>
            <input
              type="text"
              value={formData.referencia_qrh}
              onChange={(e) => handleInputChange('referencia_qrh', e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.referencia_qrh ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Ex: QRH 2.1.1, QRH 3.2.5"
              maxLength={50}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.referencia_qrh && (
              <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.referencia_qrh}</span>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Referência no Manual QRH</p>
          </div>

          {/* BOTÕES */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Salvando...' : (manobraEdit ? 'Atualizar' : 'Criar Manobra')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CriarManobraModal;
