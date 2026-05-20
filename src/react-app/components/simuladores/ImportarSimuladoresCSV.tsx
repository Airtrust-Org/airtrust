import { useState, useRef } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Upload, Download, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface ImportacaoResultado {
  success: boolean;
  processadas: number;
  criadas: number;
  erros: number;
  detalhes: Array<{
    linha: number;
    erro?: string;
    sucesso?: string;
    dados?: any;
  }>;
  template?: string;
}

interface ImportadorProps {
  tipo: 'manobras' | 'sessoes';
  onImportacaoCompleta?: (resultado: ImportacaoResultado) => void;
}

export const ImportarSimuladoresCSV: React.FC<ImportadorProps> = ({ tipo, onImportacaoCompleta }) => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [validacao, setValidacao] = useState<{valido: boolean; erros: string[]}>({valido: false, erros: []});
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ImportacaoResultado | null>(null);
  const [previewDados, setPreviewDados] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const templates = {
    manobras: `codigo,nome,referencia_qrh
MAN-001,Decolagem Normal,QRH 2.1.1
MAN-002,Subida Inicial,QRH 2.1.2
MAN-003,Aproximação Visual,QRH 3.2.5
MAN-004,Pouso Manual,QRH 4.1.2
MAN-005,Emergência Motor,QRH 8.1.1
MAN-006,Arremetida,QRH 4.2.1`,

    sessoes: `nome,duracao_horas,tipo,descricao,manobras_codigos
Treinamento Básico VFR,2,BASICO,Sessão básica de voo visual,MAN-001|MAN-002|MAN-003
Treinamento Avançado IFR,3,AVANCADO,Sessão avançada por instrumentos,MAN-001|MAN-003|MAN-004
Check de Proficiência,1,CHECK,Avaliação de proficiência tipo,MAN-001|MAN-002|MAN-003|MAN-004|MAN-005
Emergência Completa,4,AVANCADO,Treinamento situações de emergência,MAN-005|MAN-006`
  };

  const validarCSV = (content: string) => {
    const linhas = content.trim().split('\n');
    const erros: string[] = [];

    if (linhas.length < 2) {
      erros.push('Arquivo deve ter cabeçalho + pelo menos 1 linha de dados');
      return { valido: false, erros };
    }

    const cabecalho = linhas[0].split(',').map(h => h.trim());

    let camposEsperados: string[] = [];

    if (tipo === 'manobras') {
      camposEsperados = ['codigo', 'nome', 'referencia_qrh'];
    } else if (tipo === 'sessoes') {
      camposEsperados = ['nome', 'duracao_horas', 'tipo', 'descricao', 'manobras_codigos'];
    }

    const camposFaltando = camposEsperados.filter(campo =>
      !cabecalho.some(h => h.toLowerCase() === campo.toLowerCase())
    );

    if (camposFaltando.length > 0) {
      erros.push(`Campos obrigatórios para ${tipo}: ${camposEsperados.join(', ')}`);
      erros.push(`Campos faltando: ${camposFaltando.join(', ')}`);
    }

    if (tipo === 'manobras') {
      for (let i = 1; i < Math.min(linhas.length, 6); i++) {
        const valores = linhas[i].split(',').map(v => v.trim());

        if (valores.length !== 3) {
          erros.push(`Linha ${i + 1}: esperado 3 campos (codigo,nome,referencia_qrh), encontrado ${valores.length}`);
        }

        const [codigo, nome, referencia_qrh] = valores;

        if (!codigo) erros.push(`Linha ${i + 1}: código é obrigatório`);
        if (!nome) erros.push(`Linha ${i + 1}: nome é obrigatório`);
        if (!referencia_qrh) erros.push(`Linha ${i + 1}: referência QRH é obrigatória`);
      }
    }

    if (tipo === 'sessoes') {
      for (let i = 1; i < Math.min(linhas.length, 6); i++) {
        const valores = linhas[i].split(',').map(v => v.trim());

        if (valores.length !== 5) {
          erros.push(`Linha ${i + 1}: esperado 5 campos (nome,duracao_horas,tipo,descricao,manobras_codigos), encontrado ${valores.length}`);
        }

        const [nome, duracao, tipo, , manobras] = valores;

        if (!nome) erros.push(`Linha ${i + 1}: nome é obrigatório`);
        if (!duracao || isNaN(parseInt(duracao))) erros.push(`Linha ${i + 1}: duração deve ser um número`);
        if (!tipo) erros.push(`Linha ${i + 1}: tipo é obrigatório`);
        if (!manobras) erros.push(`Linha ${i + 1}: códigos das manobras são obrigatórios (separados por |)`);

        if (manobras) {
          const codigosManobras = manobras.split('|').map(c => c.trim());
          if (codigosManobras.length === 0) {
            erros.push(`Linha ${i + 1}: pelo menos um código de manobra é necessário`);
          }

          codigosManobras.forEach((codigo) => {
            if (!codigo.match(/^[A-Z]+-\d+$/)) {
              erros.push(`Linha ${i + 1}: código '${codigo}' inválido (formato esperado: MAN-001)`);
            }
          });
        }
      }
    }

    return { valido: erros.length === 0, erros };
  };

  const gerarPreview = (content: string) => {
    const linhas = content.trim().split('\n');
    if (linhas.length < 2) return;

    const cabecalho = linhas[0].split(',').map(h => h.trim());
    const preview = linhas.slice(1, 6).map((linha, index) => {
      const valores = linha.split(',').map(v => v.trim());
      const obj: any = { '#': index + 2 }; // Linha no CSV
      cabecalho.forEach((campo, i) => {
        obj[campo] = valores[i] || '';
      });
      return obj;
    });

    setPreviewDados(preview);
  };

  const handleArquivoSelecionado = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast.warning('Por favor, selecione um arquivo CSV');
        return;
      }

      setArquivo(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCsvContent(content);
        handleContentChange(content);
      };
      reader.readAsText(file);
    }
  };

  const verificarManobrasExistem = async (csvContent: string) => {
    if (tipo !== 'sessoes') return;

    try {
      const linhas = csvContent.trim().split('\n');
      const todosCodigosManobras = new Set<string>();

      for (let i = 1; i < linhas.length; i++) {
        const valores = linhas[i].split(',').map(v => v.trim());
        const manobras = valores[4]; // Coluna manobras_codigos
        if (manobras && typeof manobras === 'string') {
          const codigos = manobras.split('|').map(c => c.trim().toUpperCase());
          codigos.forEach(codigo => todosCodigosManobras.add(codigo));
        }
      }

      const response = await fetch(`${API_BASE_URL}/simuladores/manobras`);
      const data = await response.json();
      
      if (data.success) {
        const manobrasExistentes = data.data.map((m: any) => m.codigo);
        const manobrasInexistentes = Array.from(todosCodigosManobras)
          .filter(codigo => !manobrasExistentes.includes(codigo));

        if (manobrasInexistentes.length > 0) {
          setValidacao(prev => ({
            ...prev,
            erros: [...prev.erros, `Manobras não encontradas no sistema: ${manobrasInexistentes.join(', ')}`]
          }));
        }
      }
    } catch (error) {
      console.warn('Não foi possível verificar manobras existentes:', error);
    }
  };

  const handleContentChange = (content: string) => {
    const validacaoResult = validarCSV(content);
    setValidacao(validacaoResult);

    if (validacaoResult.valido) {
      gerarPreview(content);
      verificarManobrasExistem(content); // Verificação adicional
    } else {
      setPreviewDados([]);
    }
  };

  const executarImportacao = async () => {
    if (!csvContent.trim() || validacao.erros.length > 0) {
      toast.warning('Corrija os erros antes de importar');
      return;
    }

    setImportando(true);
    setResultado(null);

    try {
      const endpoint = `/api/simuladores/importar-${tipo}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvData: csvContent })
      });

      const data = await response.json();
      setResultado(data);
      
      if (onImportacaoCompleta) {
        onImportacaoCompleta(data);
      }
    } catch (error) {
      console.error('Erro na importação:', error);
      setResultado({
        success: false,
        processadas: 0,
        criadas: 0,
        erros: 1,
        detalhes: [{ linha: 0, erro: 'Erro de comunicação com servidor' }]
      });
    } finally {
      setImportando(false);
    }
  };

  const baixarTemplate = () => {
    const blob = new Blob([templates[tipo]], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${tipo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Importar {tipo.toUpperCase()}</h3>
          <p className="text-sm text-gray-600">Importe múltiplos registros via CSV</p>
        </div>
        <button 
          onClick={baixarTemplate} 
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          Template CSV
        </button>
      </div>

      {/* Upload Zone */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-4 hover:border-blue-400 transition-colors">
        <div className="text-center">
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            Escolher Arquivo CSV
          </button>
          <p className="text-sm text-gray-500 mt-2">ou cole o conteúdo CSV abaixo</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleArquivoSelecionado}
          className="hidden"
        />
      </div>

      {/* Textarea */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Conteúdo CSV
        </label>
        <textarea
          value={csvContent}
          onChange={(e) => {
            setCsvContent(e.target.value);
            handleContentChange(e.target.value);
          }}
          placeholder={
            tipo === 'sessoes' 
              ? `Exemplo:\nnome,duracao_horas,tipo,descricao,manobras_codigos\nTreinamento Básico VFR,2,BASICO,Sessão básica de voo visual,MAN-001|MAN-002|MAN-003\nCheck de Proficiência,1,CHECK,Avaliação de proficiência,MAN-001|MAN-002|MAN-004`
              : `Exemplo:\ncodigo,nome,referencia_qrh\nMAN-001,Decolagem Normal,QRH 2.1.1\nMAN-002,Subida Inicial,QRH 2.1.2`
          }
          className="w-full h-32 p-3 border rounded-lg resize-none font-mono text-sm"
        />
      </div>

      {/* Validação */}
      {validacao.erros.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center mb-2">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <span className="font-medium text-red-800">Erros de Validação</span>
          </div>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
            {validacao.erros.map((erro, index) => (
              <li key={index}>{erro}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {previewDados.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium text-gray-900 mb-2">Preview (primeiras 5 linhas)</h4>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(previewDados[0]).map(header => (
                    <th key={header} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewDados.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    {Object.values(row).map((value: any, i) => (
                      <td key={i} className="px-3 py-2 text-sm text-gray-900 max-w-xs truncate">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Botão Importar */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-xs text-gray-500">
          Arquivo: {arquivo?.name || 'Nenhum arquivo selecionado'}
        </div>
        <button
          onClick={executarImportacao}
          disabled={importando || !csvContent.trim() || validacao.erros.length > 0}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {importando ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Importando...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Importar CSV
            </>
          )}
        </button>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className={`p-4 rounded-lg border ${resultado.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              {resultado.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              )}
              <span className={`font-medium ${resultado.success ? 'text-green-800' : 'text-red-800'}`}>
                {resultado.success ? 'Importação Concluída' : 'Erro na Importação'}
              </span>
            </div>
          </div>

          {resultado.success && (
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="text-center p-2 bg-green-100 rounded">
                <div className="text-lg font-bold text-green-800">{resultado.criadas}</div>
                <div className="text-xs text-green-600">Criados</div>
              </div>
              <div className="text-center p-2 bg-primary/20 rounded">
                <div className="text-lg font-bold text-primary">{resultado.processadas}</div>
                <div className="text-xs text-primary">Processados</div>
              </div>
              <div className="text-center p-2 bg-red-100 rounded">
                <div className="text-lg font-bold text-red-800">{resultado.erros}</div>
                <div className="text-xs text-red-600">Erros</div>
              </div>
            </div>
          )}

          {resultado.detalhes && resultado.detalhes.length > 0 && (
            <details className="cursor-pointer">
              <summary className="text-sm font-medium text-gray-700">
                Detalhes da Importação ({resultado.detalhes.length} itens)
              </summary>
              <div className="mt-2 text-sm max-h-60 overflow-y-auto bg-white p-3 rounded border">
                {resultado.detalhes.slice(0, 50).map((detalhe, index) => (
                  <div key={index} className="mb-2 pb-2 border-b border-gray-100 last:border-b-0">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded mr-2">
                      Linha {detalhe.linha}
                    </span>
                    {detalhe.sucesso ? (
                      <span className="text-green-700 bg-green-50 px-2 py-1 rounded text-xs">
                        ✓ {detalhe.sucesso}
                      </span>
                    ) : (
                      <span className="text-red-700 bg-red-50 px-2 py-1 rounded text-xs">
                        ✗ {detalhe.erro}
                      </span>
                    )}
                  </div>
                ))}
                {resultado.detalhes.length > 50 && (
                  <div className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded">
                    ... e mais {resultado.detalhes.length - 50} itens (mostrando primeiros 50)
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
