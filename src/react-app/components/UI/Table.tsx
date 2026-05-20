import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/react-app/lib/utils';

export function Table({ children, className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-200">
      <div className="w-full overflow-x-auto">
        <table className={cn('w-full text-sm', className)} {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-slate-50 border-b border-slate-200', className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-slate-200 bg-white', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('hover:bg-slate-50 transition-colors', className)} {...props}>
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-6 py-4 whitespace-nowrap text-slate-800', className)} {...props}>
      {children}
    </td>
  );
}

// Utility types for Table sub-components
Table.Header = TableHeader;
Table.Body = TableBody;
Table.Row = TableRow;
Table.Head = TableHead;
Table.Cell = TableCell;
