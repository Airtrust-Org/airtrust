import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { toast } from 'sonner';

interface ExportButtonProps {
  /**
   * Tipo de exportação
   */
  type: 'funcionarios' | 'qualificacoes-historico' | 'qualificacoes-tipos';

  /**
   * Texto do botão (opcional)
   */
  label?: string;

  /**
   * Variante de cor do botão
   */
  variant?: 'primary' | 'secondary' | 'emerald' | 'amber';

  /**
   * Classe CSS adicional
   */
  className?: string;
}

/**
 * Mapeamento de tipos para endpoints e labels
 */
const EXPORT_CONFIG = {
  funcionarios: {
    endpoint: '/exportacao/funcionarios',
    defaultLabel: 'Exportar Funcionários',
    fileName: 'funcionarios',
  },
  'qualificacoes-historico': {
    endpoint: '/exportacao/qualificacoes-historico',
    defaultLabel: 'Exportar Histórico',
    fileName: 'qualificacoes_historico',
  },
  'qualificacoes-tipos': {
    endpoint: '/exportacao/qualificacoes-tipos',
    defaultLabel: 'Exportar Modelos',
    fileName: 'qualificacoes_tipos',
  },
};

/**
 * Variantes de estilo do botão
 */
const BUTTON_VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary/90 border-primary',
  secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
  emerald: 'bg-white text-emerald-700 border-emerald-600 hover:bg-emerald-50',
  amber: 'bg-white text-amber-700 border-amber-600 hover:bg-amber-50',
};

/**
 * Botão de Exportação para Excel/CSV
 *
 * Exporta dados do sistema em formato CSV para download
 *
 * @example
 * ```tsx
 * <ExportButton type="funcionarios" variant="emerald" />
 * <ExportButton type="qualificacoes-historico" label="Download CSV" />
 * ```
 */
export const ExportButton: React.FC<ExportButtonProps> = ({
  type,
  label,
  variant = 'emerald',
  className = '',
}) => {
  const { token } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  const config = EXPORT_CONFIG[type];
  const buttonLabel = label || config.defaultLabel;
  const buttonClass = BUTTON_VARIANTS[variant];

  const handleExport = async () => {
    if (!token) {
      toast.error('Você precisa estar autenticado para exportar');
      return;
    }

    setIsExporting(true);
    const loadingToast = toast.loading('Preparando exportação...');

    try {
      const response = await fetch(`${API_BASE_URL}${config.endpoint}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || `Erro HTTP ${response.status}`);
      }

      // Verificar se é CSV ou JSON de erro
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // Resposta JSON (erro)
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao exportar');
      }

      // Resposta CSV (sucesso)
      const blob = await response.blob();

      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Nome do arquivo com timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `${config.fileName}_${timestamp}.csv`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Exportação concluída com sucesso!', { id: loadingToast });
    } catch (error: any) {
      console.error('[EXPORT] Erro ao exportar:', error);
      toast.error(error.message || 'Erro ao exportar dados', { id: loadingToast });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonClass} ${className}`}
      title={`Exportar dados em formato CSV`}
    >
      <Download size={18} className={isExporting ? 'animate-pulse' : ''} />
      {isExporting ? 'Exportando...' : buttonLabel}
    </button>
  );
};

export default ExportButton;
