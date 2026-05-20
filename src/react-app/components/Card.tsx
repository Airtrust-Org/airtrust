import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  gradient?: boolean;
}

export default function Card({ children, className = '', gradient = false }: CardProps) {
  return (
    <div className={`
      ${gradient 
        ? 'bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/50' 
        : 'bg-white/80'
      }
      backdrop-blur-lg rounded-xl border border-blue-200/50 shadow-lg shadow-blue-500/10 
      hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300
      ${className}
    `}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`p-6 border-b border-blue-200/50 ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}
