import { X, Plus } from 'lucide-react';

interface Props {
  onClose: () => void;
  filtrosAtivos: string[];
  onAdicionar: (filtroId: string) => void;
}

const FILTROS_DISPONIVEIS = [
  { id: 'funcao', label: 'Função', tipo: 'select' },
  { id: 'aeronave', label: 'Equipamento', tipo: 'select' },
  { id: 'setor', label: 'Setor', tipo: 'select' },
  { id: 'status', label: 'Status', tipo: 'select' },
  { id: 'cpf', label: 'CPF', tipo: 'text' },
  { id: 'email', label: 'E-mail', tipo: 'text' },
  { id: 'telefone', label: 'Telefone', tipo: 'text' },
  { id: 'admissao', label: 'Data Admissão', tipo: 'date' },
];

export default function AdicionarFiltro({ onClose, filtrosAtivos, onAdicionar }: Props) {
  const filtrosDisponiveis = FILTROS_DISPONIVEIS.filter((f) => !filtrosAtivos.includes(f.id));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">Adicionar Filtro</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-2 max-h-96 overflow-y-auto">
          {filtrosDisponiveis.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Todos os filtros já estão adicionados</p>
          ) : (
            filtrosDisponiveis.map((filtro) => (
              <button
                key={filtro.id}
                onClick={() => {
                  onAdicionar(filtro.id);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border transition"
              >
                <span className="font-medium">{filtro.label}</span>
                <Plus className="w-5 h-5 text-primary" />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full  py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
