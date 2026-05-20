import { useState, useEffect } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Save, Loader2, Plus, Trash2 } from 'lucide-react';

interface Manobra {
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
  ordem: number;
  obrigatoria: number;
}

interface ReordenarManobrasProps {
  modeloId: number;
  modeloNome?: string;
}

function SortableItem({ manobra }: { manobra: Manobra }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: manobra.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 mb-2 bg-white border rounded-lg hover:shadow-md transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-5 w-5 text-gray-400 hover:text-gray-600" />
      </button>

      <span className="font-mono text-sm font-semibold text-primary w-10">#{manobra.ordem}</span>

      <span className="font-medium text-gray-900 w-32">{manobra.codigo}</span>

      <span className="text-sm text-gray-600 flex-1">{manobra.nome}</span>

      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
        {manobra.categoria}
      </span>

      {manobra.obrigatoria === 1 && (
        <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded font-medium">
          Obrigatória
        </span>
      )}
    </div>
  );
}

export default function ReordenarManobras({ modeloId, modeloNome }: ReordenarManobrasProps) {
  const [manobras, setManobras] = useState<Manobra[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    carregarManobras();
  }, [modeloId]);

  const carregarManobras = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${modeloId}/manobras`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();

      if (data.success) {
        setManobras(
          (data.data || []).map((item: any) => ({
            id: Number(item.id),
            codigo: String(item.manobra_codigo || item.codigo || ''),
            nome: String(item.manobra_nome || item.manobra_descricao || item.nome || ''),
            categoria: String(item.manobra_categoria || item.categoria || ''),
            ordem: Number(item.ordem || 0),
            obrigatoria: Number(item.obrigatoria || 0),
          })),
        );
      } else {
        setError(data.error || 'Erro ao carregar manobras');
      }
    } catch (err) {
      setError('Erro ao carregar manobras');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setManobras((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        const updated = newItems.map((item, index) => ({
          ...item,
          ordem: index + 1,
        }));

        setHasChanges(true);
        return updated;
      });
    }
  };

  const salvarOrdem = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = manobras.map((m) => ({ id: m.id, ordem: m.ordem }));
      const token = getAccessToken();

      const res = await fetch(
        `${API_BASE_URL}/simuladores/modelos-sessao/${modeloId}/manobras/reordenar`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ manobras: payload }),
        },
      );

      const data = await res.json();

      if (data.success) {
        setHasChanges(false);
        const successMsg = document.createElement('div');
        successMsg.className =
          'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        successMsg.textContent = '✓ Ordem salva com sucesso!';
        document.body.appendChild(successMsg);
        setTimeout(() => successMsg.remove(), 3000);
      } else {
        setError(data.error || 'Erro ao salvar ordem');
      }
    } catch (err) {
      setError('Erro ao salvar ordem');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const cancelarAlteracoes = () => {
    carregarManobras();
    setHasChanges(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-gray-600">Carregando manobras...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">❌ {error}</p>
        <button
          onClick={carregarManobras}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (manobras.length === 0) {
    return (
      <div className="p-8 text-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-600 mb-4">Nenhuma manobra vinculada a este modelo</p>
        <button className="flex items-center gap-2 mx-auto px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Adicionar Manobras
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 rounded-lg">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Reordenar Manobras</h3>
          {modeloNome && <p className="text-sm text-gray-600 mt-1">Modelo: {modeloNome}</p>}
          <p className="text-sm text-gray-500 mt-1">
            {manobras.length} manobra{manobras.length !== 1 ? 's' : ''} cadastrada
            {manobras.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex gap-2">
          {hasChanges && (
            <button
              onClick={cancelarAlteracoes}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}

          <button
            onClick={salvarOrdem}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {hasChanges ? 'Salvar Alterações' : 'Salvar Ordem'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Aviso de alterações não salvas */}
      {hasChanges && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            ⚠️ Você tem alterações não salvas. Clique em "Salvar Alterações" para confirmar.
          </p>
        </div>
      )}

      {/* Lista de Manobras com Drag & Drop */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={manobras.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {manobras.map((manobra) => (
              <SortableItem key={manobra.id} manobra={manobra} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Instruções */}
      <div className="mt-6 p-4 bg-primary/10 border border-blue-200 rounded-lg">
        <p className="text-sm text-primary">
          💡 <strong>Dica:</strong> Arraste as manobras usando o ícone{' '}
          <GripVertical className="inline h-4 w-4" /> para reordenar. A nova ordem será salva quando
          você clicar em "Salvar Alterações".
        </p>
      </div>
    </div>
  );
}
