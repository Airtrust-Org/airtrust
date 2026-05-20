import { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, GripVertical } from 'lucide-react';

interface Coluna {
  id: string;
  label: string;
  visivel: boolean;
  ordem: number;
}

interface Props {
  onClose?: () => void;
  onSalvar: (colunas: Coluna[]) => void;
}

const DEFAULT_COLUNAS: Coluna[] = [
  { id: 'nome', label: 'Nome Completo', visivel: true, ordem: 0 },
  { id: 'guerra', label: 'Nome Guerra', visivel: true, ordem: 1 },
  { id: 'funcao', label: 'Função', visivel: true, ordem: 2 },
  { id: 'aeronave', label: 'Equipamento', visivel: true, ordem: 3 },
  { id: 'setor', label: 'Setor', visivel: false, ordem: 4 },
  { id: 'cpf', label: 'CPF', visivel: true, ordem: 5 },
  { id: 'nascimento', label: 'Data Nasc.', visivel: true, ordem: 6 },
  { id: 'codigo_anac', label: 'Código ANAC', visivel: true, ordem: 7 },
  { id: 'sispat', label: 'SISPAT', visivel: false, ordem: 8 },
  { id: 'prestserv', label: 'PrestServ', visivel: false, ordem: 9 },
  { id: 'matricula', label: 'Matrícula', visivel: true, ordem: 10 },
  { id: 'admissao', label: 'Data Admissão', visivel: false, ordem: 11 },
  { id: 'email', label: 'E-mail', visivel: true, ordem: 12 },
  { id: 'telefone', label: 'Telefone', visivel: true, ordem: 13 },
  { id: 'nivel_icao', label: 'Nível ICAO', visivel: false, ordem: 14 },
  { id: 'validade_icao', label: 'Validade ICAO', visivel: false, ordem: 15 },
  { id: 'cma', label: 'CMA', visivel: false, ordem: 16 },
  { id: 'validade_cma', label: 'Validade CMA', visivel: false, ordem: 17 },
  { id: 'aso', label: 'ASO', visivel: false, ordem: 18 },
  { id: 'validade_aso', label: 'Validade ASO', visivel: false, ordem: 19 },
  { id: 'status', label: 'Status', visivel: false, ordem: 20 },
];

export default function ConfigurarColunas({ onClose, onSalvar }: Props) {
  const [colunas, setColunas] = useState<Coluna[]>(DEFAULT_COLUNAS);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('funcionarios_colunas_config');
    if (saved) {
      try {
        const parsed: Coluna[] = JSON.parse(saved);
        // Merge saved config with defaults (add new columns from DEFAULT if missing)
        const merged = DEFAULT_COLUNAS.map((def) => {
          const saved = parsed.find((c) => c.id === def.id);
          return saved ?? def;
        }).sort((a, b) => a.ordem - b.ordem);
        setColunas(merged);
      } catch {
        setColunas(DEFAULT_COLUNAS);
      }
    }
  }, []);

  const toggleVisibilidade = (id: string) => {
    setColunas((prev) =>
      prev.map((col) => (col.id === id ? { ...col, visivel: !col.visivel } : col)),
    );
  };

  const handleDragStart = (index: number) => {
    dragItem.current = index;
    setDraggedIndex(index);
  };

  const handleDragEnter = (index: number) => {
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragItem.current === null || dragItem.current === index) {
      setDragOverIndex(null);
      return;
    }

    const sourceIndex = dragItem.current;

    setColunas((prev) => {
      const next = [...prev];
      const [draggedItem] = next.splice(sourceIndex, 1);
      next.splice(index, 0, draggedItem);
      return next.map((col, i) => ({ ...col, ordem: i }));
    });

    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSalvar = () => {
    const colunasComOrdem = colunas.map((col, i) => ({ ...col, ordem: i }));
    localStorage.setItem('funcionarios_colunas_config', JSON.stringify(colunasComOrdem));
    onSalvar(colunasComOrdem);
    if (onClose) onClose();
  };

  const handleResetar = () => {
    setColunas(DEFAULT_COLUNAS);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">Configurar Colunas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Arraste para reordenar • Clique no olho para mostrar/ocultar
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-1.5 max-h-96 overflow-y-auto">
          {colunas.map((coluna, index) => (
            <div
              key={coluna.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
                draggedIndex === index
                  ? 'bg-blue-50 border-blue-300 shadow-lg scale-105 opacity-90'
                  : dragOverIndex === index
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
              }`}
            >
              <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-sm font-medium text-slate-700">{coluna.label}</span>
              <button
                onClick={() => toggleVisibilidade(coluna.id)}
                title={coluna.visivel ? 'Ocultar coluna' : 'Mostrar coluna'}
                className={`p-1.5 rounded-lg transition ${
                  coluna.visivel
                    ? 'bg-primary/20 text-primary hover:bg-blue-200'
                    : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
                }`}
              >
                {coluna.visivel ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleResetar}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition text-sm"
          >
            Resetar
          </button>
          <button
            onClick={handleSalvar}
            className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition font-medium text-sm"
          >
            Salvar Configuração
          </button>
        </div>
      </div>
    </div>
  );
}
