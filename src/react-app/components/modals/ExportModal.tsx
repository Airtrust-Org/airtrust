import { useState } from 'react';
import { toast } from 'sonner';

import { BaseModal } from './BaseModal';
import { Download, FileText, Table } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onExport?: (format: string) => void;
}

export function ExportModal({ isOpen, onClose, title = "Exportar Dados", onExport }: ExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv');

  const handleExport = () => {
    if (onExport) {
      onExport(format);
    } else {
      toast.warning(`Dados serão exportados em formato ${format.toUpperCase()}!\n(Implementar lógica de exportação real)`);
    }
    onClose();
  };

  const formats = [
    {
      id: 'csv' as const,
      name: 'CSV',
      description: 'Arquivo de valores separados por vírgula',
      icon: FileText,
      color: 'green'
    },
    {
      id: 'xlsx' as const,
      name: 'Excel',
      description: 'Planilha do Microsoft Excel',
      icon: Table,
      color: 'blue'
    },
    {
      id: 'pdf' as const,
      name: 'PDF',
      description: 'Documento portátil (somente leitura)',
      icon: FileText,
      color: 'red'
    }
  ];

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Seleção de Formato */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Selecione o formato de exportação:
          </label>
          <div className="space-y-2">
            {formats.map((fmt) => {
              const Icon = fmt.icon;
              const isSelected = format === fmt.id;
              
              return (
                <button
                  key={fmt.id}
                  onClick={() => setFormat(fmt.id)}
                  className={`
                    w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all
                    ${isSelected
                      ? `border-${fmt.color}-500 bg-${fmt.color}-50`
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                >
                  <div className={`
                    w-12 h-12 rounded-lg flex items-center justify-center
                    ${isSelected ? `bg-${fmt.color}-100` : 'bg-gray-100'}
                  `}>
                    <Icon className={`w-6 h-6 ${isSelected ? `text-${fmt.color}-600` : 'text-gray-600'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`font-medium ${isSelected ? `text-${fmt.color}-900` : 'text-gray-900'}`}>
                      {fmt.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {fmt.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className={`w-5 h-5 rounded-full bg-${fmt.color}-600 flex items-center justify-center`}>
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Informações */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Nota:</span> O arquivo será baixado automaticamente após a exportação.
          </p>
        </div>

        {/* Botões */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar {format.toUpperCase()}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
