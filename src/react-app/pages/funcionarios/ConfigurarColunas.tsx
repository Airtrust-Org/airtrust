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

export const FUNCIONARIOS_COLUNAS_STORAGE_KEY = 'funcionarios_colunas_config_v2';

/**
 * A lista de funcionários é uma superfície operacional, não um cadastro completo.
 * Dados pessoais e identificadores ficam ocultos por padrão e só aparecem quando
 * o usuário decide explicitamente adicioná-los à visualização.
 */
export const DEFAULT_COLUNAS: Coluna[] = [
  { id: 'nome', label: 'Nome', visivel: true, ordem: 0 },
  { id: 'guerra', label: 'Nome de guerra', visivel: true, ordem: 1 },
  { id: 'funcao', label: 'Função / Cargo', visivel: true, ordem: 2 },
  { id: 'setor', label: 'Setor', visivel: true, ordem: 3 },
  { id: 'aeronave', label: 'Equipamento', visivel: true, ordem: 4 },
  { id: 'status', label: 'Status', visivel: true, ordem: 5 },
  { id: 'licenca', label: 'Licença', visivel: false, ordem: 6 },
  { id: 'codigo_anac', label: 'CANAC', visivel: false, ordem: 7 },
  { id: 'matricula', label: 'Matrícula', visivel: false, ordem: 8 },
  { id: 'cpf', label: 'CPF', visivel: false, ordem: 9 },
  { id: 'nascimento', label: 'Data de nascimento', visivel: false, ordem: 10 },
  { id: 'email', label: 'E-mail', visivel: false, ordem: 11 },
  { id: 'telefone', label: 'Telefone', visivel: false, ordem: 12 },
  { id: 'admissao', label: 'Admissão', visivel: false, ordem: 13 },
  { id: 'sispat', label: 'SISPAT', visivel: false, ordem: 14 },
  { id: 'prestserv', label: 'PrestServ', visivel: false, ordem: 15 },
];

export default function ConfigurarColunas({ onClose, onSalvar }: Props) {
  const [colunas, setColunas] = useState<Coluna[]>(DEFAULT_COLUNAS);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(FUNCIONARIOS_COLUNAS_STORAGE_KEY);
    if (saved) {
      try {
        const parsed: Coluna[] = JSON.parse(saved);
        const merged = DEFAULT_COLUNAS.map((def) => {
          const savedColumn = parsed.find((c) => c.id === def.id);
          return savedColumn ?? def;
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
    localStorage.setItem(FUNCIONARIOS_COLUNAS_STORAGE_KEY, JSON.stringify(colunasComOrdem));
    onSalvar(colunasComOrdem);
    onClose?.();
  };

  const handleResetar = () => {
    setColunas(DEFAULT_COLUNAS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold">Configurar colunas</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Dados pessoais ficam ocultos por padrão. Arraste para reordenar e escolha apenas o que precisa visualizar.
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Fechar configuração de colunas"
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>

        <div className="max-h-96 space-y-1.5 overflow-y-auto p-6">
          {colunas.map((coluna, index) => (
            <div
              key={coluna.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`flex cursor-grab select-none items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:cursor-grabbing ${
                draggedIndex === index
                  ? 'scale-105 border-blue-300 bg-blue-50 opacity-90 shadow-lg dark:border-blue-700 dark:bg-blue-950/30'
                  : dragOverIndex === index
                    ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700'
              }`}
            >
              <GripVertical className="h-5 w-5 flex-shrink-0 text-slate-400" />
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                {coluna.label}
              </span>
              <button
                onClick={() => toggleVisibilidade(coluna.id)}
                aria-label={`${coluna.visivel ? 'Ocultar' : 'Mostrar'} coluna ${coluna.label}`}
                title={coluna.visivel ? 'Ocultar coluna' : 'Mostrar coluna'}
                className={`rounded-lg p-1.5 transition ${
                  coluna.visivel
                    ? 'bg-primary/20 text-primary hover:bg-blue-200 dark:hover:bg-blue-900/50'
                    : 'bg-slate-200 text-slate-400 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600'
                }`}
              >
                {coluna.visivel ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-3 border-t border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-950/40">
          <button
            onClick={handleResetar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Restaurar padrão seguro
          </button>
          <button
            onClick={handleSalvar}
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            Salvar configuração
          </button>
        </div>
      </div>
    </div>
  );
}
