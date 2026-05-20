import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Search, User, CheckCircle, AlertCircle, XCircle, Loader2 } from 'lucide-react';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  cpf?: string;
  funcao: string;
  cargo?: string;
  status: string;
  is_instrutor?: number;
  is_checador?: number;
  codigo_anac?: string;
  foto_url?: string;
  total_qualificacoes?: number;
  qualificacoes_vencidas?: number;
  qualificacoes_vencendo?: number;
  status_compliance?: 'OK' | 'ATENCAO' | 'VENCIDAS';
}

interface Props {
  onSelect: (funcionario: Funcionario | null) => void;
  selected?: Funcionario | null;
  tipo?: 'instrutor' | 'checador' | '';
  placeholder?: string;
  required?: boolean;
}

export function FuncionarioCombobox({ 
  onSelect, 
  selected, 
  tipo = '',
  placeholder = 'Buscar funcionário...',
  required = false
}: Props) {
  const [query, setQuery] = useState('');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (query.length < 2) {
      setFuncionarios([]);
      setShowDropdown(false);
      return;
    }
    
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `${API_BASE_URL}/funcionarios/search/search?q=${encodeURIComponent(query)}${tipo ? `&tipo=${tipo}` : ``}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.success) {
          setFuncionarios(data.data || []);
          setShowDropdown(true);
        }
      } catch (error) {
        console.error('Erro ao buscar funcionários:', error);
      } finally {
        setLoading(false);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [query, tipo]);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleSelect = (func: Funcionario) => {
    onSelect(func);
    setQuery('');
    setFuncionarios([]);
    setShowDropdown(false);
  };
  
  const handleClear = () => {
    onSelect(null);
    setQuery('');
    setFuncionarios([]);
    setShowDropdown(false);
  };
  
  const getBadgeColor = (func: Funcionario) => {
    if (func.is_instrutor) return 'bg-primary/20 text-blue-700 border-blue-300';
    if (func.is_checador) return 'bg-purple-100 text-purple-700 border-purple-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };
  
  const getBadgeText = (func: Funcionario) => {
    if (func.is_instrutor) return 'Instrutor';
    if (func.is_checador) return 'Checador';
    return func.funcao || func.cargo;
  };
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Input de busca ou funcionário selecionado */}
      {selected ? (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
          <User className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{selected.nome}</p>
            <p className="text-sm text-gray-500 truncate">
              {selected.matricula} {selected.codigo_anac && `• ANAC: ${selected.codigo_anac}`}
            </p>
          </div>
          <span className={`px-2 py-1 text-xs font-semibold rounded border ${getBadgeColor(selected)}`}>
            {getBadgeText(selected)}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 hover:bg-gray-200 rounded transition"
            title="Remover seleção"
          >
            <XCircle className="h-5 w-5 text-gray-400" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setShowDropdown(true)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            required={required}
          />
          {loading && (
            <div className="absolute right-3 top-3">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>
      )}
      
      {/* Dropdown de resultados */}
      {showDropdown && funcionarios.length > 0 && !selected && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-auto">
          {funcionarios.map((func) => (
            <button
              key={func.id}
              type="button"
              onClick={() => handleSelect(func)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0 transition"
            >
              <User className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{func.nome}</p>
                <p className="text-sm text-gray-500 truncate">
                  {func.matricula} {func.codigo_anac && `• ANAC: ${func.codigo_anac}`}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs font-semibold rounded border ${getBadgeColor(func)}`}>
                {getBadgeText(func)}
              </span>
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
      
      {/* Mensagem quando não encontra */}
      {showDropdown && query.length >= 2 && funcionarios.length === 0 && !loading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Nenhum funcionário encontrado</p>
          </div>
        </div>
      )}
    </div>
  );
}
