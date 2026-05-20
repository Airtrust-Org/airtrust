import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface BuscaGlobalProps {
  onBuscar: (termo: string) => void;
}

export default function BuscaGlobal({ onBuscar }: BuscaGlobalProps) {
  const [termo, setTermo] = useState('');
  
  const handleBuscar = (valor: string) => {
    setTermo(valor);
    onBuscar(valor);
  };
  
  const limparBusca = () => {
    setTermo('');
    onBuscar('');
  };
  
  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar por nome, matrícula, CPF..."
          value={termo}
          onChange={e => handleBuscar(e.target.value)}
          className="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-primary/30"
        />
        {termo && (
          <button
            onClick={limparBusca}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      
      {termo && (
        <div className="absolute top-full mt-1 text-sm text-gray-600">
          Buscando por: <strong>{termo}</strong>
        </div>
      )}
    </div>
  );
}
