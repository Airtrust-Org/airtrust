import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export function MatrizTreinamento() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">Matriz de Treinamentos</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            A matriz é administrada em um único lugar para evitar regras duplicadas ou conflitantes.
          </p>
          <Link
            to="/treinamentos/compliance?tab=configuracao"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
          >
            Abrir matriz de treinamentos <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
