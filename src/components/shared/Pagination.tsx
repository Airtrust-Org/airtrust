interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
  total?: number;
  limit?: number;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  hasNext,
  hasPrev,
  total,
  limit,
  onLimitChange,
  limitOptions = [50, 100],
}: PaginationProps) {
  const pages: number[] = [];
  const maxButtons = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  const handleLimitChange = (value: string) => {
    const next = Number.parseInt(value, 10);
    if (!Number.isNaN(next)) onLimitChange?.(next);
  };

  return (
    <div className="at-surface flex items-center justify-between border-t px-4 py-3 sm:px-6">
      {/* Mobile */}
      <div className="flex w-full items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev}
          className="at-surface at-focus at-interactive relative inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>

        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => handleLimitChange(e.target.value)}
            className="at-field at-focus min-h-11 min-w-0 flex-1 rounded-md border px-2 py-2 text-sm"
            aria-label="Itens por página"
          >
            {limitOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}/p
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext}
          className="at-surface at-focus at-interactive relative inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Próxima
        </button>
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="at-muted text-sm">
            Página <span className="font-medium">{currentPage}</span> de{' '}
            <span className="font-medium">{totalPages}</span>
            {total !== undefined && limit !== undefined && (
              <>
                {' '}
                • Mostrando <span className="font-medium">{Math.min(limit, total)}</span> de{' '}
                <span className="font-medium">{total}</span> registros
              </>
            )}
          </p>
        </div>

        {onLimitChange && (
          <div className="flex items-center gap-2">
            <span className="at-muted text-sm">Itens por página:</span>
            <select
              value={limit}
              onChange={(e) => handleLimitChange(e.target.value)}
              className="at-field at-focus min-h-11 rounded-md border px-2 py-1.5 text-sm"
              aria-label="Itens por página"
            >
              {limitOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <nav
            className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm"
            aria-label="Paginação"
          >
            {/* Botão Anterior */}
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!hasPrev}
              className="at-surface at-focus at-interactive relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-l-md border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Página anterior"
            >
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Números de Página */}
            {pages.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={`at-focus relative inline-flex min-h-11 min-w-11 items-center justify-center border px-3 py-2 text-sm font-medium ${
                  page === currentPage
                    ? 'at-selected z-10 border-primary text-primary'
                    : 'at-surface at-interactive at-muted'
                }`}
                aria-label={`Página ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            ))}

            {/* Botão Próxima */}
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!hasNext}
              className="at-surface at-focus at-interactive relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-md border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Próxima página"
            >
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
