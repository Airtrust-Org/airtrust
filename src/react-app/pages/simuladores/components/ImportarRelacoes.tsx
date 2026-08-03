import React, { useState } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { getAccessToken } from '@/react-app/config/api';
import { Upload, CheckCircle, XCircle, AlertCircle, FileSpreadsheet, Download } from 'lucide-react';
import { importWithRetry } from '@/react-app/utils/lazyWithRetry';
import { parseSpreadsheetFile } from '@/react-app/utils/parseSpreadsheetFile';
// 🚀 LAZY LOADING: XLSX carregado dinamicamente apenas quando necessário

interface ResultadoImportacao {
  sucesso: boolean;
  resumo: {
    total_linhas: number;
    relacoes_criadas: number;
    modelos_auto_criados: number;
    manobras_auto_criadas: number;
    erros: number;
  };
  detalhes: {
    modelos_criados: Array<{ codigo: string; nome: string; linha: number }>;
    manobras_criadas: Array<{ codigo: string; nome: string; linha: number }>;
    erros: Array<{ linha: number; motivo: string }>;
  };
}

interface ImportarRelacoesInteligenteProps {
  endpoint?: string;
  title?: string;
  description?: string;
  onBack?: () => void;
  onImportSuccess?: (resultado: ResultadoImportacao) => void;
}

export default function ImportarRelacoesInteligente({
  endpoint = '/relacoes/importar-inteligente',
  title = 'Importação Inteligente de Relações',
  description = 'Importe relações modelo-manobra com criação automática de modelos e manobras que não existem',
  onBack,
  onImportSuccess,
}: ImportarRelacoesInteligenteProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [autoCriar, setAutoCriar] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const apiEndpoint = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setArquivo(e.target.files[0]);
      setResultado(null);
    }
  };

  const baixarTemplate = async () => {
    // 🚀 LAZY LOADING: Carrega XLSX apenas quando baixar template
    const XLSX = await importWithRetry(() => import('xlsx'), 'ImportarRelacoes_xlsx_template', {
      reloadOnChunkError: false,
      maxAttempts: 2,
    });

    const template = [
      {
        modelo_codigo: 'SESS-001',
        manobra_codigo: 'MAN-001',
        ordem: 1,
        modelo_nome: 'Sessão VFR Básica',
        modelo_duracao: 60,
        modelo_tipo: 'VFR',
        manobra_nome: 'Decolagem Normal',
        manobra_tipo: 'NORMAL',
        manobra_categoria: 'DECOLAGEM',
        obrigatoria: 'SIM',
        tempo_estimado_min: 5,
      },
      {
        modelo_codigo: 'SESS-001',
        manobra_codigo: 'MAN-002',
        ordem: 2,
        modelo_nome: '',
        modelo_duracao: '',
        modelo_tipo: '',
        manobra_nome: 'Navegação VOR',
        manobra_tipo: 'NORMAL',
        manobra_categoria: 'NAVEGACAO',
        obrigatoria: 'SIM',
        tempo_estimado_min: 10,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relações');
    XLSX.writeFile(wb, 'template_relacoes_completas.xlsx');
  };

  const processarImportacao = async () => {
    if (!arquivo) return;

    setProcessando(true);
    setResultado(null);

    try {
      const { rows: jsonData } = await parseSpreadsheetFile(arquivo);

      // Enviar para API
      const token = getAccessToken();
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          dados: jsonData,
          auto_criar: autoCriar,
        }),
      });

      const resultado = await response.json();
      setResultado(resultado);
      if (resultado?.sucesso) {
        onImportSuccess?.(resultado);
      }
    } catch (error) {
      console.error('Erro ao importar:', error);
      setResultado({
        sucesso: false,
        resumo: {
          total_linhas: 0,
          relacoes_criadas: 0,
          modelos_auto_criados: 0,
          manobras_auto_criadas: 0,
          erros: 1,
        },
        detalhes: {
          modelos_criados: [],
          manobras_criadas: [],
          erros: [{ linha: 0, motivo: 'Erro ao processar arquivo' }],
        },
      });
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600">{description}</p>
      </div>

      {/* Card de Upload */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="mb-4">
          <button
            onClick={baixarTemplate}
            className="flex items-center gap-2  py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Download className="w-4 h-4" />
            Baixar Template Excel
          </button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center mb-4">
          <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer text-primary hover:text-blue-700 font-medium"
          >
            Clique para selecionar arquivo Excel
          </label>
          {arquivo && (
            <p className="mt-2 text-sm text-gray-600">
              Arquivo selecionado: <span className="font-medium">{arquivo.name}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4 p-4 bg-primary/10 rounded-lg">
          <input
            type="checkbox"
            id="auto-criar"
            checked={autoCriar}
            onChange={(e) => setAutoCriar(e.target.checked)}
            className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
          />
          <label htmlFor="auto-criar" className="text-sm text-gray-700 cursor-pointer">
            <span className="font-medium">Criar automaticamente</span> modelos e manobras que não
            existem
            <p className="text-xs text-gray-500 mt-1">
              Se desmarcado, apenas relações com modelos e manobras existentes serão criadas
            </p>
          </label>
        </div>

        <button
          onClick={processarImportacao}
          disabled={!arquivo || processando}
          className="w-full flex items-center justify-center gap-2  py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <Upload className="w-5 h-5" />
          {processando ? 'Processando...' : 'Importar Relações'}
        </button>
      </div>

      {/* Resultado da Importação */}
      {resultado && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-6">
            {resultado.sucesso ? (
              <CheckCircle className="w-8 h-8 text-green-600" />
            ) : (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
            <h2 className="text-xl font-bold text-gray-900">
              {resultado.sucesso ? 'Importação Concluída' : 'Importação com Erros'}
            </h2>
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total de Linhas</p>
              <p className="text-2xl font-bold text-gray-900">{resultado.resumo.total_linhas}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-600">Relações Criadas</p>
              <p className="text-2xl font-bold text-green-700">
                {resultado.resumo.relacoes_criadas}
              </p>
            </div>
            <div className="bg-primary/10 p-4 rounded-lg">
              <p className="text-sm text-primary">Modelos Criados</p>
              <p className="text-2xl font-bold text-blue-700">
                {resultado.resumo.modelos_auto_criados}
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-purple-600">Manobras Criadas</p>
              <p className="text-2xl font-bold text-purple-700">
                {resultado.resumo.manobras_auto_criadas}
              </p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-red-600">Erros</p>
              <p className="text-2xl font-bold text-red-700">{resultado.resumo.erros}</p>
            </div>
          </div>

          {/* Modelos Criados */}
          {resultado.detalhes.modelos_criados.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                Modelos Criados Automaticamente
              </h3>
              <div className="bg-primary/10 rounded-lg p-4">
                <ul className="space-y-2">
                  {resultado.detalhes.modelos_criados.map((modelo, idx) => (
                    <li key={idx} className="text-sm text-gray-700">
                      <span className="font-mono font-medium text-blue-700">{modelo.codigo}</span>
                      {' - '}
                      <span>{modelo.nome}</span>{' '}
                      <span className="text-gray-500">(linha {modelo.linha})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Manobras Criadas */}
          {resultado.detalhes.manobras_criadas.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                Manobras Criadas Automaticamente
              </h3>
              <div className="bg-purple-50 rounded-lg p-4">
                <ul className="space-y-2">
                  {resultado.detalhes.manobras_criadas.map((manobra, idx) => (
                    <li key={idx} className="text-sm text-gray-700">
                      <span className="font-mono font-medium text-purple-700">
                        {manobra.codigo}
                      </span>
                      {' - '}
                      <span>{manobra.nome}</span>{' '}
                      <span className="text-gray-500">(linha {manobra.linha})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Erros */}
          {resultado.detalhes.erros.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Erros Encontrados
              </h3>
              <div className="bg-red-50 rounded-lg p-4">
                <ul className="space-y-2">
                  {resultado.detalhes.erros.map((erro, idx) => (
                    <li key={idx} className="text-sm text-gray-700">
                      <span className="font-medium text-red-700">Linha {erro.linha}:</span>{' '}
                      <span>{erro.motivo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instruções */}
      <div className="mt-6 bg-primary/10 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">📋 Como Usar</h3>
        <ol className="space-y-2 text-sm text-primary">
          <li>
            <strong>1.</strong> Baixe o template Excel clicando no botão acima
          </li>
          <li>
            <strong>2.</strong> Preencha as colunas obrigatórias:{' '}
            <code className="bg-primary/20 px-1 rounded">modelo_codigo</code>,{' '}
            <code className="bg-primary/20 px-1 rounded">manobra_codigo</code>,{' '}
            <code className="bg-primary/20 px-1 rounded">ordem</code>
          </li>
          <li>
            <strong>3.</strong> Para criar modelos automaticamente, preencha:{' '}
            <code className="bg-primary/20 px-1 rounded">modelo_nome</code>,{' '}
            <code className="bg-primary/20 px-1 rounded">modelo_duracao</code>,{' '}
            <code className="bg-primary/20 px-1 rounded">modelo_tipo</code>
          </li>
          <li>
            <strong>4.</strong> Para criar manobras automaticamente, preencha:{' '}
            <code className="bg-primary/20 px-1 rounded">manobra_nome</code>,{' '}
            <code className="bg-primary/20 px-1 rounded">manobra_tipo</code>,{' '}
            <code className="bg-primary/20 px-1 rounded">manobra_categoria</code>
          </li>
          <li>
            <strong>5.</strong> Marque a opção "Criar automaticamente" e faça o upload
          </li>
        </ol>
      </div>
    </div>
  );
}
