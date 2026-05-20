import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Search, User, X } from 'lucide-react';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  cargo?: string;
  email?: string;
}

interface SeletorFuncionarioProps {
  value: number | string;
  onChange: (funcionarioId: number) => void;
  required?: boolean;
  error?: string;
}

export default function SeletorFuncionario({ value, onChange, required = false, error }: SeletorFuncionarioProps) {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedFuncionario, setSelectedFuncionario] = useState<Funcionario | null>(null);

  useEffect(() => {
    carregarFuncionarios();
  }, []);

  useEffect(() => {
    if (value && funcionarios.length > 0) {
      const func = funcionarios.find(f => f.id === Number(value));
      setSelectedFuncionario(func || null);
    }
  }, [value, funcionarios]);

  const carregarFuncionarios = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/funcionarios?limit=100&ativo=true`);
      const data = await response.json();
      
      if (data.success) {
        const funcionariosData = data.funcionarios || data.data || [];
        const funcionariosOrdenados = funcionariosData.sort((a: Funcionario, b: Funcionario) => 
          a.nome.localeCompare(b.nome, 'pt-BR')
        );
        setFuncionarios(funcionariosOrdenados);
      }
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
    } finally {
      setLoading(false);
    }
  };

  const funcionariosFiltrados = funcionarios
    .filter(f => {
      const searchLower = search.toLowerCase();
      return (
        f.nome.toLowerCase().includes(searchLower) ||
        f.matricula.toLowerCase().includes(searchLower) ||
        f.email?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const handleSelect = (funcionario: Funcionario) => {
    setSelectedFuncionario(funcionario);
    onChange(funcionario.id);
    setShowDropdown(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedFuncionario(null);
    onChange(0);
    setSearch('');
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Funcionário {required && <span className="text-red-500">*</span>}
      </label>

      {selectedFuncionario ? (
        <div className="flex items-center gap-2 p-3 bg-primary/10 border border-blue-200 rounded-lg">
          <User className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="font-medium text-gray-900">{selectedFuncionario.nome}</p>
            <p className="text-sm text-gray-600">
              Matrícula: {selectedFuncionario.matricula}
              {selectedFuncionario.cargo && ` | ${selectedFuncionario.cargo}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 hover:bg-primary/20 rounded"
            title="Remover seleção"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search || ''}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Buscar por nome, matrícula ou email..."
              className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                error ? 'border-red-500' : 'border-gray-300'
              }`}
              required={required}
            />
          </div>

          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowDropdown(false)}
              />
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center text-gray-500">
                    Carregando...
                  </div>
                ) : funcionariosFiltrados.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    {search ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário disponível'}
                  </div>
                ) : (
                  funcionariosFiltrados.map((funcionario) => (
                    <button
                      key={funcionario.id}
                      type="button"
                      onClick={() => handleSelect(funcionario)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-gray-400" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{funcionario.nome}</p>
                          <p className="text-sm text-gray-600">
                            Matrícula: {funcionario.matricula}
                            {funcionario.cargo && ` | ${funcionario.cargo}`}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
