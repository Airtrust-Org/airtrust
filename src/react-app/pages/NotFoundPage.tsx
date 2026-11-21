import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * Rota coringa: URLs desconhecidas deixavam a tela em branco (sem mensagem nem saída).
 * Página autônoma (sem depender de sessão), com landmark `main`, título e links de saída.
 */
export default function NotFoundPage() {
  const location = useLocation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-slate-800">
          <Compass className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Página não encontrada
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          O endereço <span className="break-all font-mono text-slate-800 dark:text-slate-200">{location.pathname}</span>{' '}
          não existe ou foi movido.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className="at-focus inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Ir para o painel
          </Link>
          <Link
            to="/login"
            className="at-focus inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Entrar com outra conta
          </Link>
        </div>
      </div>
    </main>
  );
}
