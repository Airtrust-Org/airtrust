interface FiltrosRapidosProps {
  onFiltroRapido: (tipo: string) => void;
}

export default function FiltrosRapidos({ onFiltroRapido }: FiltrosRapidosProps) {
  const filtros = [
    { id: 'todos', label: 'Todos', cor: 'bg-gray-100 text-gray-800' },
    { id: 'ativos', label: 'Ativos', cor: 'bg-green-100 text-green-800' },
    { id: 'comandantes', label: 'Comandantes', cor: 'bg-primary/20 text-primary' },
    { id: 'copilotos', label: 'Copilotos', cor: 'bg-purple-100 text-purple-800' },
    { id: 'comissarios', label: 'Comissários', cor: 'bg-pink-100 text-pink-800' }
  ];
  
  return (
    <div className="flex flex-wrap gap-2">
      {filtros.map(filtro => (
        <button
          key={filtro.id}
          onClick={() => onFiltroRapido(filtro.id)}
          className={`px-3 py-1 rounded-full text-sm font-medium ${filtro.cor} hover:opacity-80 transition`}
        >
          {filtro.label}
        </button>
      ))}
    </div>
  );
}
