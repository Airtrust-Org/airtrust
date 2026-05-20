import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle, Download } from 'lucide-react';

export interface ValidationResult {
  linha: number;
  tipo: 'erro' | 'aviso' | 'sucesso';
  campo: string;
  mensagem: string;
  valorOriginal: any;
  valorSugerido?: any;
}

interface ImportValidatorProps {
  dados: any[];
  onValidationComplete: (dadosValidados: any[], continuar: boolean) => void;
  validationRules: (item: any, index: number) => ValidationResult[];
  moduleName: string;
}

export function ImportValidator({ dados, onValidationComplete, validationRules, moduleName }: ImportValidatorProps) {
  const [validacao, setValidacao] = useState<ValidationResult[]>([]);
  const [resumo, setResumo] = useState({ erros: 0, avisos: 0, sucesso: 0 });

  useEffect(() => {
    const resultados: ValidationResult[] = [];
    dados.forEach((item, index) => {
      const regras = validationRules(item, index + 1);
      resultados.push(...regras);
    });

    setValidacao(resultados);
    
    const erros = resultados.filter(r => r.tipo === 'erro').length;
    const avisos = resultados.filter(r => r.tipo === 'aviso').length;
    
    setResumo({
      erros,
      avisos,
      sucesso: dados.length - erros
    });
  }, [dados, validationRules]);

  function exportarRelatorioErros() {
    const csv = [
      ['Linha', 'Tipo', 'Campo', 'Mensagem', 'Valor Original', 'Valor Sugerido'].join(','),
      ...validacao.map(v => [
        v.linha,
        v.tipo.toUpperCase(),
        v.campo,
        `"${v.mensagem}"`,
        `"${v.valorOriginal || ''}"`,
        `"${v.valorSugerido || ''}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `validacao-${moduleName.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* RESUMO VALIDAÇÃO */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">Validação de Dados - {moduleName}</h3>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 text-green-700 mb-2">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Válidos</span>
            </div>
            <p className="text-2xl font-bold text-green-800">{resumo.sucesso}</p>
            <p className="text-sm text-green-600">Registros prontos para importar</p>
          </div>

          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-2 text-yellow-700 mb-2">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Avisos</span>
            </div>
            <p className="text-2xl font-bold text-yellow-800">{resumo.avisos}</p>
            <p className="text-sm text-yellow-600">Podem ser importados com atenção</p>
          </div>

          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 text-red-700 mb-2">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">Erros</span>
            </div>
            <p className="text-2xl font-bold text-red-800">{resumo.erros}</p>
            <p className="text-sm text-red-600">Impedem a importação</p>
          </div>
        </div>

        {resumo.erros > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 font-medium">⚠️ {resumo.erros} erro(s) encontrado(s)</p>
            <p className="text-red-600 text-sm">Corrija os erros no arquivo CSV e faça o upload novamente</p>
          </div>
        )}

        {resumo.erros === 0 && resumo.avisos > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800 font-medium">⚠️ {resumo.avisos} aviso(s) encontrado(s)</p>
            <p className="text-yellow-600 text-sm">Você pode continuar, mas revise os avisos antes de importar</p>
          </div>
        )}

        {resumo.erros === 0 && resumo.avisos === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-800 font-medium">✓ Todos os registros estão válidos!</p>
            <p className="text-green-600 text-sm">{resumo.sucesso} registro(s) pronto(s) para importação</p>
          </div>
        )}

        {/* LISTA DE ERROS/AVISOS */}
        {validacao.length > 0 && (
          <div className="max-h-96 overflow-y-auto border rounded-lg">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Linha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Tipo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Campo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Mensagem</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {validacao.map((v, i) => (
                  <tr key={i} className={`
                    ${v.tipo === 'erro' ? 'bg-red-50' : ''}
                    ${v.tipo === 'aviso' ? 'bg-yellow-50' : ''}
                  `}>
                    <td className="px-4 py-2 font-mono text-sm">{v.linha}</td>
                    <td className="px-4 py-2">
                      {v.tipo === 'erro' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                          <XCircle className="w-3 h-3" /> ERRO
                        </span>
                      )}
                      {v.tipo === 'aviso' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                          <AlertCircle className="w-3 h-3" /> AVISO
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-700">{v.campo}</td>
                    <td className="px-4 py-2 text-gray-600">{v.mensagem}</td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-700">{String(v.valorOriginal || '-')}</span>
                      {v.valorSugerido && (
                        <span className="block text-sm text-green-600 mt-1">
                          → Sugestão: {String(v.valorSugerido)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {validacao.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p className="font-medium">Nenhum problema encontrado!</p>
            <p className="text-sm">Todos os registros estão prontos para importação</p>
          </div>
        )}
      </div>

      {/* AÇÕES */}
      <div className="flex justify-between items-center">
        <button
          onClick={exportarRelatorioErros}
          disabled={validacao.length === 0}
          className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Exportar Relatório de Validação
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => onValidationComplete(dados, false)}
            className="px-6 py-2 border rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancelar
          </button>
          
          {resumo.erros === 0 ? (
            <button
              onClick={() => onValidationComplete(dados, true)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm"
            >
              ✓ Confirmar Importação ({resumo.sucesso} registro{resumo.sucesso !== 1 ? 's' : ''})
            </button>
          ) : (
            <button 
              disabled 
              className="px-6 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed font-medium"
            >
              Corrija os erros para continuar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
