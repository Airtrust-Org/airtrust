import { useEscalaPageCtx } from '../../EscalaPageContext';

const OPCOES = [
  { valor: 'todas' as const, label: 'Todas' },
  { valor: 'q1' as const, label: 'Q1' },
  { valor: 'q2' as const, label: 'Q2' },
];

export default function FiltroQuinzena() {
  const { filtroQuinzena, setFiltroQuinzena } = useEscalaPageCtx();

  return (
    <div
      data-testid="filtro-quinzena"
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
    >
      {OPCOES.map((opcao) => (
        <button
          key={opcao.valor}
          type="button"
          data-testid={`btn-quinzena-${opcao.valor}`}
          onClick={() =>
            filtroQuinzena === opcao.valor && opcao.valor !== 'todas'
              ? setFiltroQuinzena('todas')
              : setFiltroQuinzena(opcao.valor)
          }
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            filtroQuinzena === opcao.valor
              ? 'bg-primary text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {opcao.label}
        </button>
      ))}
    </div>
  );
}
