import { useState, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Info,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/react-app/utils/toast';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface ImportarXLSXProps {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'funcionarios' | 'historico' | 'tipos';
  onSuccess?: () => void;
}

export function ImportarXLSX({ isOpen, onClose, tipo, onSuccess }: ImportarXLSXProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'completar' | 'substituir'>('completar');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showConfirmacao, setShowConfirmacao] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getTitulo = () => {
    switch (tipo) {
      case 'funcionarios':
        return 'Importar Funcionários';
      case 'historico':
        return 'Importar Histórico de Qualificações';
      case 'tipos':
        return 'Importar Modelos de Qualificações';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validar extensão
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        showToast.error('Apenas arquivos Excel (.xlsx ou .xls) são permitidos');
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleImportar = async () => {
    if (!file) {
      showToast.error('Selecione um arquivo');
      return;
    }

    // Se modo substituir, mostrar confirmação
    if (mode === 'substituir' && !showConfirmacao) {
      setShowConfirmacao(true);
      return;
    }

    setLoading(true);
    setShowConfirmacao(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);

      const res = await fetch(`${API_BASE_URL}/importacao-xlsx/${tipo}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: formData,
      });

      const data = await res.json();
      setResult(data);

      if (data.success) {
        showToast.success(
          `Importação concluída! ${data.inserted} inseridos, ${data.updated} atualizados${
            data.deleted ? `, ${data.deleted} removidos` : ''
          }`,
        );

        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 2000);
        }
      } else {
        showToast.error(`Importação concluída com ${data.errors?.length || 0} erros`);
      }
    } catch (err) {
      console.error('[IMPORT XLSX] Erro:', err);
      showToast.error('Erro ao importar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const resetar = () => {
    setFile(null);
    setMode('completar');
    setResult(null);
    setShowConfirmacao(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitulo()} size="lg">
      <div className="space-y-4">
        {/* Aviso Template */}
        <div className="rounded-lg bg-blue-50 p-4">
          <div className="flex gap-3">
            <Info className="w-4 h-4 text-blue-600" />
            <div className="flex-1 text-sm text-blue-900">
              <p className="font-medium mb-1">Use o template da exportação</p>
              <p>
                Para garantir compatibilidade, exporte a planilha atual, edite os dados e importe de
                volta. As colunas devem corresponder exatamente ao template exportado.
              </p>
            </div>
          </div>
        </div>

        {/* Seleção de Modo */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Modo de Importação</label>

          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-lg border-2 border-slate-200 p-4 cursor-pointer hover:border-blue-300 transition-colors">
              <input
                type="radio"
                name="mode"
                value="completar"
                checked={mode === 'completar'}
                onChange={(e) => setMode(e.target.value as any)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="font-medium text-slate-900">Completar Dados</div>
                <div className="text-sm text-slate-600 mt-1">
                  Adiciona novos registros e atualiza os existentes (baseado em CPF/Código). Dados
                  atuais são preservados.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-lg border-2 border-slate-200 p-4 cursor-pointer hover:border-red-300 transition-colors">
              <input
                type="radio"
                name="mode"
                value="substituir"
                checked={mode === 'substituir'}
                onChange={(e) => setMode(e.target.value as any)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="font-medium text-red-700 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Substituir Todos os Dados
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  <strong className="text-red-600">ATENÇÃO:</strong> Remove TODOS os registros
                  existentes e insere apenas os da planilha. Use com extremo cuidado!
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Upload de Arquivo */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Arquivo Excel (.xlsx)</label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload size={16} />
              Selecionar Arquivo
            </button>
            {file && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FileText className="w-4 h-4 text-green-600" />
                {file.name}
              </div>
            )}
          </div>
        </div>

        {/* Confirmação de Substituir */}
        {showConfirmacao && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="text-red-600 flex-shrink-0" size={24} />
              <div className="flex-1">
                <h4 className="font-bold text-red-900 mb-2">Confirme a Substituição Total</h4>
                <p className="text-sm text-red-800 mb-4">
                  Você está prestes a <strong>DELETAR PERMANENTEMENTE</strong> todos os registros
                  existentes e substituí-los pelos dados da planilha. Esta ação é irreversível.
                </p>
                <p className="text-sm text-red-800 font-medium">
                  Tem certeza absoluta que deseja continuar?
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setShowConfirmacao(false)}
                    className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleImportar}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Sim, Substituir Tudo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div
            className={`rounded-lg p-4 ${
              result.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle className="text-green-600 flex-shrink-0" size={24} />
              ) : (
                <AlertTriangle className="text-amber-600 flex-shrink-0" size={24} />
              )}
              <div className="flex-1">
                <h4
                  className={`font-bold mb-2 ${result.success ? 'text-green-900' : 'text-amber-900'}`}
                >
                  {result.success
                    ? 'Importação Concluída com Sucesso'
                    : 'Importação Concluída com Erros'}
                </h4>
                <div className="text-sm space-y-1">
                  <p>Total de linhas: {result.totalRows}</p>
                  <p>Registros inseridos: {result.inserted}</p>
                  <p>Registros atualizados: {result.updated}</p>
                  {result.deleted !== undefined && <p>Registros removidos: {result.deleted}</p>}
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="font-medium text-red-700">Erros encontrados:</p>
                      <div className="mt-2 max-h-40 overflow-y-auto space-y-2">
                        {result.errors.slice(0, 10).map((err: any, idx: number) => (
                          <div
                            key={idx}
                            className="text-xs bg-white rounded p-2 border border-red-200"
                          >
                            <p className="font-medium">
                              Linha {err.linha}: {err.erro}
                            </p>
                          </div>
                        ))}
                        {result.errors.length > 10 && (
                          <p className="text-xs text-red-600">
                            ... e mais {result.errors.length - 10} erros
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Botões */}
        {!showConfirmacao && (
          <div className="flex justify-end gap-3 pt-4 border-t">
            {result && (
              <button
                onClick={resetar}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Nova Importação
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
            {!result && (
              <button
                onClick={handleImportar}
                disabled={!file || loading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Importar
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
