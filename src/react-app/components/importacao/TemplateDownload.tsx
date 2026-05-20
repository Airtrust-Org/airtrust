import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface TemplateDownloadProps {
  entidade: 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico';
  showExcel?: boolean; // Se true, mostra opção de baixar Excel
}

export function TemplateDownload({ entidade, showExcel = true }: TemplateDownloadProps) {
  const [downloading, setDownloading] = useState<'csv' | 'xlsx' | null>(null);

  const nomeEntidade = {
    funcionarios: 'Funcionários',
    qualificacoes_tipos: 'Tipos de Qualificação',
    qualificacoes_historico: 'Histórico de Qualificações',
  }[entidade];

  const baixarTemplate = async (formato: 'csv' | 'xlsx') => {
    setDownloading(formato);

    try {
      const token = getAccessToken() || '';

      if (!token) {
        throw new Error('Token não encontrado. Faça login novamente.');
      }

      // API v2 retorna sempre CSV (por enquanto)
      // TODO: Adicionar suporte XLSX no backend (GET /importacao/template/:entidade?format=xlsx)
      const url = `${API_BASE_URL}/importacao/template/${entidade}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao baixar template: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `template-${entidade}.${formato}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      toast.success(`Template ${formato.toUpperCase()} baixado!`, {
        description: `Arquivo template-${entidade}.${formato} salvo.`,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao baixar template', {
        description: errorMsg,
      });
      console.error('[baixarTemplate] Erro:', err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="flex items-start gap-3">
        <Download size={24} className="text-blue-600 mt-1 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 mb-1">Baixar Template</h3>
          <p className="text-sm text-blue-700 mb-3">
            Baixe um modelo com os campos corretos para preencher e importar dados de {nomeEntidade}
          </p>

          <div className="flex gap-3">
            {/* CSV sempre disponível */}
            <button
              onClick={() => baixarTemplate('csv')}
              disabled={downloading !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {downloading === 'csv' ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full" />
                  Baixando...
                </>
              ) : (
                <>
                  <FileText size={16} />
                  Baixar CSV
                </>
              )}
            </button>

            {/* Excel (opcional) */}
            {showExcel && (
              <button
                onClick={() => baixarTemplate('xlsx')}
                disabled={downloading !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                {downloading === 'xlsx' ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full" />
                    Baixando...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={16} />
                    Baixar Excel
                  </>
                )}
              </button>
            )}
          </div>

          {showExcel && (
            <p className="text-xs text-blue-600 mt-2">
              💡 Dica: Use Excel se preferir trabalhar com planilhas formatadas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
