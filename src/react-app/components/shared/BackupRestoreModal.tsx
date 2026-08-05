import { useState } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { apiJson, frontendErrorMessage } from '@/react-app/lib/api-contract';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import Button from '../Button';
import { BaseModal as Modal } from '../modals/BaseModal';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BackupStats {
  funcionarios_importados?: number;
  treinamentos_importados?: number;
  certificacoes_importadas?: number;
  total_funcionarios?: number;
  total_treinamentos?: number;
  total_certificacoes?: number;
  total_arquivos?: number;
}

interface BackupPayload extends Record<string, unknown> {
  metadata?: BackupStats;
}

interface BackupOperationResult {
  success: boolean;
  message?: string;
  error?: string;
  stats?: BackupStats;
}

const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({ isOpen, onClose }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<BackupOperationResult | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setResult(null);

    try {
      const data = await apiJson<BackupPayload>(`${API_BASE_URL}/system/export-data`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `airtrust-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setResult({
        success: true,
        message: 'Backup criado e baixado com sucesso!',
        stats: data.metadata,
      });
    } catch (error) {
      setResult({
        success: false,
        error: frontendErrorMessage(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get('backup_file');

    if (!(file instanceof File)) {
      toast.warning('Selecione um arquivo de backup');
      return;
    }

    setIsImporting(true);
    setResult(null);

    try {
      const fileContent = await file.text();
      const backupData: unknown = JSON.parse(fileContent);
      setResult(
        await apiJson<BackupOperationResult>(`${API_BASE_URL}/system/import-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backupData),
        }),
      );
    } catch (error) {
      setResult({
        success: false,
        error: frontendErrorMessage(error),
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Backup e Restore do Sistema">
      <div className="p-6 space-y-6">
        <div className="border-b pb-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
            <Download className="w-5 h-5 mr-2 text-primary" />
            Exportar Dados
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Cria um backup completo de todos os dados do sistema (funcionários, treinamentos,
            certificações e arquivos).
          </p>
          <Button
            onClick={handleExport}
            loading={isExporting}
            variant="primary"
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Criando Backup...' : 'Baixar Backup Completo'}
          </Button>
        </div>

        <div className="border-b pb-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
            <Upload className="w-5 h-5 mr-2 text-red-600" />
            Importar Dados
          </h3>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-sm text-red-800 font-medium">
                ATENÇÃO: Esta operação irá substituir dados existentes!
              </p>
            </div>
            <p className="text-xs text-red-700 mt-1">
              Certifique-se de ter um backup atual antes de prosseguir.
            </p>
          </div>

          <form onSubmit={handleImportSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Arquivo de Backup (JSON)
              </label>
              <input
                type="file"
                name="backup_file"
                accept=".json"
                required
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
              />
            </div>
            <Button
              type="submit"
              loading={isImporting}
              variant="danger"
              className="bg-red-600 hover:bg-red-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isImporting ? 'Importando...' : 'Restaurar Dados'}
            </Button>
          </form>
        </div>

        {result && (
          <div
            className={`p-4 rounded-lg ${
              result.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <p className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? '✅ Operação realizada com sucesso!' : '❌ Erro na operação'}
            </p>

            {result.message && (
              <p className={`text-sm mt-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </p>
            )}

            {result.error && <p className="text-sm mt-1 text-red-700">{result.error}</p>}

            {result.stats && (
              <div className="text-sm mt-3 space-y-1">
                <p className="font-medium text-green-800">Estatísticas:</p>
                {result.stats.funcionarios_importados !== undefined && (
                  <p className="text-green-700">
                    • Funcionários: {result.stats.funcionarios_importados}
                  </p>
                )}
                {result.stats.treinamentos_importados !== undefined && (
                  <p className="text-green-700">
                    • Treinamentos: {result.stats.treinamentos_importados}
                  </p>
                )}
                {result.stats.certificacoes_importadas !== undefined && (
                  <p className="text-green-700">
                    • Certificações: {result.stats.certificacoes_importadas}
                  </p>
                )}
                {result.stats.total_funcionarios !== undefined && (
                  <div className="mt-2 pt-2 border-t border-green-200">
                    <p className="text-green-700">Total no backup:</p>
                    <p className="text-green-600 text-xs">
                      • {result.stats.total_funcionarios} funcionários •{' '}
                      {result.stats.total_treinamentos ?? 0} treinamentos •{' '}
                      {result.stats.total_certificacoes ?? 0} certificações •{' '}
                      {result.stats.total_arquivos ?? 0} arquivos
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="bg-primary/10 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">💡 Dicas importantes:</h4>
          <ul className="text-sm text-primary space-y-1">
            <li>• Exporte dados regularmente para ter backups atualizados</li>
            <li>• Arquivos de certificados são preservados via URLs do Cloudflare R2</li>
            <li>• O restore funciona por matrícula (funcionários) e código (treinamentos)</li>
            <li>• Use este sistema ao migrar entre contas ou ambientes</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};

export default BackupRestoreModal;
