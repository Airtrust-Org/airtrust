import { useState, useEffect } from 'react';
import { X, Filter } from 'lucide-react';

interface FiltroConfig {
  id: string;
  label: string;
  tipo: 'select' | 'text' | 'date';
  opcoes?: { value: string; label: string }[];
}

const FILTROS_DISPONIVEIS: FiltroConfig[] = [
  {
    id: 'funcao',
    label: 'Função',
    tipo: 'select',
    opcoes: [
      { value: 'TODOS', label: 'Todas as Funções' },
      { value: 'Piloto', label: 'Piloto' },
      { value: 'Copiloto', label: 'Copiloto' },
      { value: 'INSTRUTOR', label: 'Instrutor' },
      { value: 'CHECADOR', label: 'Checador' },
    ],
  },
  {
    id: 'aeronave',
    label: 'Equipamento',
    tipo: 'select',
    opcoes: [{ value: 'TODOS', label: 'Todos os Equipamentos' }],
  },
  {
    id: 'sispat',
    label: 'SISPAT',
    tipo: 'select',
    opcoes: [
      { value: 'TODOS', label: 'Todos' },
      { value: 'SIM', label: 'Sim' },
      { value: 'NAO', label: 'Não' },
    ],
  },
  {
    id: 'prestserv',
    label: 'Prestador de Serviço',
    tipo: 'select',
    opcoes: [
      { value: 'TODOS', label: 'Todos' },
      { value: 'SIM', label: 'Sim' },
      { value: 'NAO', label: 'Não' },
    ],
  },
  {
    id: 'nome',
    label: 'Nome',
    tipo: 'text',
  },
  {
    id: 'cpf',
    label: 'CPF',
    tipo: 'text',
  },
  {
    id: 'email',
    label: 'Email',
    tipo: 'text',
  },
  {
    id: 'admissao',
    label: 'Data de Admissão',
    tipo: 'date',
  },
];

interface ConfigurarFiltrosProps {
  onAtualizarFiltros: (filtrosAtivos: string[]) => void;
  onValorAlterado?: (campo: string, valor: any) => void;
  funcionarios?: any[];
  renderMode?: 'button' | 'filters' | 'both'; // Controla o que renderizar
}

export default function ConfigurarFiltros({
  onAtualizarFiltros,
  onValorAlterado,
  funcionarios = [],
  renderMode = 'both',
}: ConfigurarFiltrosProps) {
  const [modalAberto, setModalAberto] = useState(false);
  const [filtrosAtivos, setFiltrosAtivos] = useState<string[]>([]);
  const [valores, setValores] = useState<Record<string, any>>({});

  useEffect(() => {
    if (modalAberto) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [modalAberto]);

  useEffect(() => {
    const configSalva = localStorage.getItem('funcionarios_filtros_config');
    if (configSalva) {
      const filtros = JSON.parse(configSalva);
      setFiltrosAtivos(filtros);
      onAtualizarFiltros(filtros);
    } else {
      const padroes = ['funcao', 'aeronave', 'sispat', 'prestserv'];
      setFiltrosAtivos(padroes);
      onAtualizarFiltros(padroes);
    }
  }, []);

  const adicionarFiltro = (filtroId: string) => {
    if (!filtrosAtivos.includes(filtroId)) {
      const novos = [...filtrosAtivos, filtroId];
      setFiltrosAtivos(novos);
      localStorage.setItem('funcionarios_filtros_config', JSON.stringify(novos));
      onAtualizarFiltros(novos);
    }
    setModalAberto(false);
  };

  const removerFiltro = (filtroId: string) => {
    const novos = filtrosAtivos.filter((id) => id !== filtroId);
    setFiltrosAtivos(novos);
    localStorage.setItem('funcionarios_filtros_config', JSON.stringify(novos));
    onAtualizarFiltros(novos);

    const novosValores = { ...valores };
    delete novosValores[filtroId];
    setValores(novosValores);
    onValorAlterado?.(filtroId, '');
  };

  const handleValorChange = (filtroId: string, valor: any) => {
    setValores((prev) => ({ ...prev, [filtroId]: valor }));
    onValorAlterado?.(filtroId, valor);
  };

  const filtrosDisponiveis = FILTROS_DISPONIVEIS.filter((f) => !filtrosAtivos.includes(f.id));

  return (
    <>
      {/* Renderizar botão se mode for 'button' ou 'both' */}
      {(renderMode === 'button' || renderMode === 'both') && (
        <button
          onClick={() => setModalAberto(true)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition flex items-center gap-1.5 whitespace-nowrap"
        >
          Adicionar Filtro
        </button>
      )}

      {/* Renderizar filtros se mode for 'filters' ou 'both' */}
      {(renderMode === 'filters' || renderMode === 'both') && filtrosAtivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filtrosAtivos.map((filtroId) => {
            const config = FILTROS_DISPONIVEIS.find((f) => f.id === filtroId);
            if (!config) return null;

            const opcoesUnicas =
              config.id === 'funcao' || config.id === 'aeronave'
                ? [...new Set(funcionarios.map((f) => f[config.id]).filter(Boolean))]
                : [];

            return (
              <div key={filtroId} className="flex items-center gap-1">
                {config.tipo === 'select' && (
                  <select
                    value={valores[filtroId] || ''}
                    onChange={(e) => handleValorChange(filtroId, e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/30 focus:border-transparent"
                  >
                    <option value="">{config.label} - Todos</option>
                    {config.opcoes
                      ? config.opcoes.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))
                      : opcoesUnicas.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                  </select>
                )}

                {config.tipo === 'text' && (
                  <input
                    type="text"
                    placeholder={config.label}
                    value={valores[filtroId] || ''}
                    onChange={(e) => handleValorChange(filtroId, e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/30 focus:border-transparent w-40"
                  />
                )}

                {config.tipo === 'date' && (
                  <input
                    type="date"
                    value={valores[filtroId] || ''}
                    onChange={(e) => handleValorChange(filtroId, e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/30 focus:border-transparent"
                  />
                )}

                {/* Botão X discreto */}
                <button
                  onClick={() => removerFiltro(filtroId)}
                  className="p-0.5 text-gray-400 hover:text-red-600 transition"
                  title="Remover filtro"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Seleção */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">Adicionar Filtro</h2>
              <button
                onClick={() => setModalAberto(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {filtrosDisponiveis.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Todos os filtros já estão ativos</p>
              ) : (
                <div className="space-y-2">
                  {filtrosDisponiveis.map((filtro) => (
                    <button
                      key={filtro.id}
                      onClick={() => adicionarFiltro(filtro.id)}
                      className="w-full flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition"
                    >
                      <Filter className="w-5 h-5 text-gray-400" />
                      <div className="text-left">
                        <p className="font-medium">{filtro.label}</p>
                        <p className="text-sm text-gray-500">
                          Tipo:{' '}
                          {filtro.tipo === 'select'
                            ? 'Seleção'
                            : filtro.tipo === 'text'
                              ? 'Texto'
                              : 'Data'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end p-6 border-t bg-gray-50">
              <button
                onClick={() => setModalAberto(false)}
                className=" py-2 border rounded-lg hover:bg-gray-100"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
