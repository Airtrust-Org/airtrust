import { Link } from 'react-router-dom';

interface FuncionarioLinkProps {
  funcionarioId?: string | number | null;
  nome: string;
  className?: string;
  stopPropagation?: boolean;
  fallbackToSearch?: boolean;
}

export default function FuncionarioLink({
  funcionarioId,
  nome,
  className,
  stopPropagation = true,
  fallbackToSearch = true,
}: FuncionarioLinkProps) {
  const trimmedName = (nome || '').trim() || 'Funcionario';
  const id = funcionarioId == null ? '' : String(funcionarioId).trim();
  const baseClassName = [
    'relative z-[2] inline-flex cursor-pointer items-center rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (id) {
    return (
      <Link
        to={`/funcionarios/${encodeURIComponent(id)}/ficha`}
        className={baseClassName}
        onClick={
          stopPropagation
            ? (event) => {
                event.stopPropagation();
              }
            : undefined
        }
      >
        {trimmedName}
      </Link>
    );
  }

  if (!fallbackToSearch) {
    return <span className={className}>{trimmedName}</span>;
  }

  return (
    <Link
      to={`/funcionarios?search=${encodeURIComponent(trimmedName)}`}
      className={baseClassName}
      onClick={
        stopPropagation
          ? (event) => {
              event.stopPropagation();
            }
          : undefined
      }
    >
      {trimmedName}
    </Link>
  );
}
