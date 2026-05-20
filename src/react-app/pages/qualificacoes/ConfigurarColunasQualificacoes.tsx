import { useState, useEffect } from "react";
import { X, GripVertical } from "lucide-react";
import ModernCheckbox from "../../components/shared/ModernCheckbox";

interface Props {
  onClose: () => void;
  onSave?: (colunas: Coluna[]) => void;
}

export interface Coluna {
  id: string;
  nome: string;
  visivel: boolean;
}

const COLUNAS_DEFAULT: Coluna[] = [
  { id: "acoes", nome: "Ações", visivel: true },
  { id: "funcionario", nome: "Funcionário", visivel: true },
  { id: "tipo", nome: "Tipo", visivel: true },
  { id: "codigo", nome: "Código", visivel: true },
  { id: "nome", nome: "Nome", visivel: true },
  { id: "realizado", nome: "Conclusão", visivel: true },
  { id: "validade", nome: "Validade", visivel: true },
  { id: "vencimento", nome: "Vencimento", visivel: true },
  { id: "status", nome: "Status", visivel: true },
];

const STORAGE_KEY = "qualificacoes_colunas_config";

// Função auxiliar para carregar configuração de colunas
export function carregarConfigColunas(): Coluna[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error("Erro ao carregar configuração de colunas:", error);
  }
  return COLUNAS_DEFAULT;
}

export default function ConfigurarColunasQualificacoes({
  onClose,
  onSave,
}: Props) {
  const [colunas, setColunas] = useState<Coluna[]>(() => {
    // Carregar configuração salva do localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Erro ao carregar configuração de colunas:", error);
    }
    return COLUNAS_DEFAULT;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleToggleVisibilidade = (id: string) => {
    setColunas(
      colunas.map((col) =>
        col.id === id ? { ...col, visivel: !col.visivel } : col,
      ),
    );
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColunas = [...colunas];
    const draggedItem = newColunas[draggedIndex];
    newColunas.splice(draggedIndex, 1);
    newColunas.splice(index, 0, draggedItem);

    setColunas(newColunas);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSalvar = () => {
    // Salvar no localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colunas));
    } catch (error) {
      console.error("Erro ao salvar configuração de colunas:", error);
    }

    // Notificar componente pai
    if (onSave) {
      onSave(colunas);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Configurar Colunas</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Arraste para reordenar as colunas
        </p>

        <div className="space-y-1 mb-6">
          {colunas.map((coluna, index) => (
            <div
              key={coluna.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                flex items-center gap-2 p-3 rounded-lg border-2 transition-all
                ${
                  draggedIndex === index
                    ? "border-blue-400 bg-primary/10 opacity-50"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }
                cursor-move
              `}
            >
              <GripVertical className="h-4 w-4 text-gray-400" />
              <ModernCheckbox
                checked={coluna.visivel}
                onChange={() => handleToggleVisibilidade(coluna.id)}
                label={coluna.nome}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1  py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            className="flex-1  py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
