import { useState } from 'react';
import { useApi } from '@/react-app/hooks/useApi';
import { X } from 'lucide-react';

interface Aeronave {
  id: number;
  codigo: string;
  nome: string;
  fabricante?: string;
}

interface AeronaveMultiSelectProps {
  value: number[];
  onChange: (value: number[]) => void;
  className?: string;
  placeholder?: string;
}

export default function AeronaveMultiSelect({ 
  value, 
  onChange, 
  className 
}: AeronaveMultiSelectProps) {
  const { data: aeronaves } = useApi<Aeronave[]>('/api/aeronaves');
  const [isOpen, setIsOpen] = useState(false);

  const selectedAeronaves = aeronaves?.filter(a => value.includes(a.id)) || [];
  const availableAeronaves = aeronaves?.filter(a => !value.includes(a.id)) || [];

  const handleSelect = (aeronaveId: number) => {
    onChange([...value, aeronaveId]);
    setIsOpen(false);
  };

  const handleRemove = (aeronaveId: number) => {
    onChange(value.filter(id => id !== aeronaveId));
  };

  return (
    <div className={`relative ${className}`}>
      {/* Selected aeronaves as tags */}
      <div className="mb-2 min-h-[2rem] flex flex-wrap gap-1">
        {selectedAeronaves.map((aeronave) => (
          <span
            key={aeronave.id}
            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/20 text-primary border border-blue-200 max-w-full"
          >
            <span className="font-medium truncate">{aeronave.codigo}</span>
            <button
              type="button"
              onClick={() => handleRemove(aeronave.id)}
              className="ml-1 text-primary hover:text-primary transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Dropdown button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-sm"
      >
        {selectedAeronaves.length === 0 ? (
          <span className="text-gray-500 truncate block">Selecione aeronaves qualificadas</span>
        ) : (
          <span className="text-gray-700 truncate block">
            {selectedAeronaves.length} aeronave{selectedAeronaves.length > 1 ? 's' : ''} selecionada{selectedAeronaves.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Dropdown options */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {availableAeronaves.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">
              {aeronaves?.length === 0 ? 'Carregando aeronaves...' : 'Todas selecionadas'}
            </div>
          ) : (
            availableAeronaves.map((aeronave) => (
              <button
                key={aeronave.id}
                type="button"
                onClick={() => handleSelect(aeronave.id)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
              >
                <div className="font-medium text-gray-900 truncate">{aeronave.codigo}</div>
                {aeronave.nome && (
                  <div className="text-sm text-gray-600 truncate">{aeronave.nome}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
