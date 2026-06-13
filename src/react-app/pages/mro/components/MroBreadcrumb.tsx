import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface Crumb {
  label: string;
  to?: string;
}

export default function MroBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="mb-3 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />}
          {item.to ? (
            <Link to={item.to} className="hover:text-blue-600 hover:underline dark:hover:text-blue-400">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
