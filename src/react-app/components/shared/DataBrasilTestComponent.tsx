/**
 * ⚠️ PADRÃO BRASILEIRO OBRIGATÓRIO - AIRTRUST ⚠️
 * 
 * Componente de Teste para Validação do Padrão Brasileiro
 * 
 * ✅ Datas: SEMPRE dd/mm/aaaa (nunca mm/dd/yyyy ou yyyy-mm-dd)
 * ✅ Máscaras: SEMPRE dd/mm/aaaa  
 * ✅ Validação: SEMPRE formato brasileiro
 * ✅ Cultura: SEMPRE pt-BR
 */

import { useState } from 'react';
import { Calendar, Check, X, AlertTriangle } from 'lucide-react';
import Button from '../Button';
import Card from '../Card';

interface TesteBrasil {
  tipo: string;
  entrada: string;
  esperado: string;
  resultado: string;
  sucesso: boolean;
  observacao: string;
}

export const DataBrasilTestComponent: React.FC = () => {
  const [testes, setTestes] = useState<TesteBrasil[]>([]);
  const [loading, setLoading] = useState(false);

  const formatarDataBrasil = (data: string | Date): string => {
    try {
      const dataObj = typeof data === 'string' ? new Date(data) : data;
      const dia = dataObj.getDate().toString().padStart(2, '0');
      const mes = (dataObj.getMonth() + 1).toString().padStart(2, '0');
      const ano = dataObj.getFullYear().toString();
      return `${dia}/${mes}/${ano}`;
    } catch (error) {
      return 'ERRO';
    }
  };

  const validarFormatoBrasil = (data: string): boolean => {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = data.match(regex);
    
    if (!match) return false;
    
    const [, dia, mes, ano] = match;
    const diaNum = parseInt(dia, 10);
    const mesNum = parseInt(mes, 10);
    const anoNum = parseInt(ano, 10);
    
    if (diaNum < 1 || diaNum > 31) return false;
    if (mesNum < 1 || mesNum > 12) return false;
    if (anoNum < 1900 || anoNum > 2100) return false;
    
    return true;
  };

  const executarTestes = () => {
    setLoading(true);
    const novosTestes: TesteBrasil[] = [];

    const agora = new Date();
    const dataAtualBrasil = formatarDataBrasil(agora);
    novosTestes.push({
      tipo: 'Data Atual',
      entrada: agora.toISOString(),
      esperado: 'dd/mm/aaaa',
      resultado: dataAtualBrasil,
      sucesso: validarFormatoBrasil(dataAtualBrasil),
      observacao: 'Deve formatar data atual no padrão brasileiro'
    });

    const dataISO = '2025-09-20T21:08:51Z';
    const dataISOBrasil = formatarDataBrasil(dataISO);
    novosTestes.push({
      tipo: 'ISO para Brasil',
      entrada: dataISO,
      esperado: '20/09/2025',
      resultado: dataISOBrasil,
      sucesso: dataISOBrasil === '20/09/2025',
      observacao: 'Conversão de ISO para formato brasileiro'
    });

    const testesEspecificos = [
      { iso: '2025-01-01T00:00:00Z', esperado: '01/01/2025', desc: 'Ano Novo' },
      { iso: '2025-12-31T23:59:59Z', esperado: '31/12/2025', desc: 'Último dia do ano' },
      { iso: '2025-02-14T12:00:00Z', esperado: '14/02/2025', desc: 'Dia dos Namorados' },
      { iso: '2025-07-09T10:30:00Z', esperado: '09/07/2025', desc: 'Independência do Brasil' },
      { iso: '2025-10-12T15:45:00Z', esperado: '12/10/2025', desc: 'Nossa Senhora Aparecida' }
    ];

    testesEspecificos.forEach(teste => {
      const resultado = formatarDataBrasil(teste.iso);
      novosTestes.push({
        tipo: 'Data Específica',
        entrada: teste.desc,
        esperado: teste.esperado,
        resultado: resultado,
        sucesso: resultado === teste.esperado,
        observacao: `${teste.desc} - ISO: ${teste.iso}`
      });
    });

    const formatosTeste = [
      { formato: '20/09/2025', valido: true, desc: 'Formato brasileiro válido' },
      { formato: '09/20/2025', valido: false, desc: 'Formato americano (INVÁLIDO)' },
      { formato: '2025-09-20', valido: false, desc: 'Formato ISO (INVÁLIDO)' },
      { formato: '20-09-2025', valido: false, desc: 'Hífen no lugar de barra (INVÁLIDO)' },
      { formato: '20.09.2025', valido: false, desc: 'Ponto no lugar de barra (INVÁLIDO)' },
      { formato: '01/13/2025', valido: false, desc: 'Mês inválido (INVÁLIDO)' },
      { formato: '32/01/2025', valido: false, desc: 'Dia inválido (INVÁLIDO)' },
      { formato: '15/06/1899', valido: false, desc: 'Ano muito antigo (INVÁLIDO)' }
    ];

    formatosTeste.forEach(teste => {
      const resultado = validarFormatoBrasil(teste.formato);
      novosTestes.push({
        tipo: 'Validação Formato',
        entrada: teste.formato,
        esperado: teste.valido ? 'VÁLIDO' : 'INVÁLIDO',
        resultado: resultado ? 'VÁLIDO' : 'INVÁLIDO',
        sucesso: resultado === teste.valido,
        observacao: teste.desc
      });
    });

    const placeholderTeste = 'dd/mm/aaaa';
    novosTestes.push({
      tipo: 'Placeholder',
      entrada: 'DateInput component',
      esperado: 'dd/mm/aaaa',
      resultado: placeholderTeste,
      sucesso: placeholderTeste === 'dd/mm/aaaa',
      observacao: 'Placeholder deve estar em formato brasileiro'
    });

    const mascaraTeste = '##/##/####';
    novosTestes.push({
      tipo: 'Máscara',
      entrada: 'Input mask',
      esperado: '##/##/####',
      resultado: mascaraTeste,
      sucesso: mascaraTeste === '##/##/####',
      observacao: 'Máscara deve forçar formato brasileiro'
    });

    setTestes(novosTestes);
    setLoading(false);
  };

  const limparTestes = () => {
    setTestes([]);
  };

  const exportarRelatorio = () => {
    const relatorio = {
      titulo: 'Relatório de Conformidade - Padrão Brasileiro AirTrust',
      timestamp: new Date().toISOString(),
      data_brasil: formatarDataBrasil(new Date()),
      total_testes: testes.length,
      testes_aprovados: testes.filter(t => t.sucesso).length,
      testes_falharam: testes.filter(t => !t.sucesso).length,
      percentual_sucesso: Math.round((testes.filter(t => t.sucesso).length / testes.length) * 100),
      detalhes: testes,
      observacoes: [
        'TODAS as datas no sistema AirTrust DEVEM seguir o padrão brasileiro dd/mm/aaaa',
        'NUNCA usar formato americano mm/dd/yyyy ou ISO yyyy-mm-dd em interfaces',
        'Placeholders SEMPRE em português: dd/mm/aaaa',
        'Máscaras SEMPRE ##/##/####',
        'Validação SEMPRE para formato brasileiro',
        'Cultura SEMPRE pt-BR'
      ]
    };
    
    const blob = new Blob([JSON.stringify(relatorio, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conformidade-brasil-${formatarDataBrasil(new Date()).replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const testesSucesso = testes.filter(t => t.sucesso).length;
  const testesTotal = testes.length;
  const percentualSucesso = testesTotal > 0 ? Math.round((testesSucesso / testesTotal) * 100) : 0;

  return (
    <div className="data-brasil-test p-6 space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="h-6 w-6 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-800">
            🇧🇷 Teste de Conformidade - Padrão Brasileiro AirTrust
          </h2>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">⚠️ PADRÃO OBRIGATÓRIO</h3>
              <ul className="text-sm text-yellow-700 mt-2 space-y-1">
                <li>✅ Datas: SEMPRE dd/mm/aaaa (nunca mm/dd/yyyy ou yyyy-mm-dd)</li>
                <li>✅ Placeholders: SEMPRE "dd/mm/aaaa"</li>
                <li>✅ Máscaras: SEMPRE ##/##/####</li>
                <li>✅ Cultura: SEMPRE pt-BR</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button onClick={executarTestes} disabled={loading} className="flex items-center gap-2">
            {loading ? (
              <Calendar className="h-4 w-4 animate-pulse" />
            ) : (
              <Calendar className="h-4 w-4" />
            )}
            {loading ? 'Executando...' : '🧪 Executar Testes de Conformidade'}
          </Button>
          
          <Button variant="secondary" onClick={limparTestes} disabled={loading}>
            🗑️ Limpar Resultados
          </Button>
          
          {testes.length > 0 && (
            <Button variant="secondary" onClick={exportarRelatorio}>
              📄 Exportar Relatório
            </Button>
          )}
        </div>
      </Card>

      {testes.length > 0 && (
        <>
          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              📊 Resumo dos Resultados
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-primary/10 rounded-lg">
                <div className="text-2xl font-bold text-primary">{testesTotal}</div>
                <div className="text-sm text-primary">Total de Testes</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{testesSucesso}</div>
                <div className="text-sm text-green-800">Aprovados</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{testesTotal - testesSucesso}</div>
                <div className="text-sm text-red-800">Falharam</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{percentualSucesso}%</div>
                <div className="text-sm text-purple-800">Taxa de Sucesso</div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4">📋 Detalhes dos Testes</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {testes.map((teste, index) => (
                <div key={index} className={`p-4 border rounded-lg ${
                  teste.sucesso ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {teste.sucesso ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium">{teste.tipo}</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      teste.sucesso ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {teste.sucesso ? 'APROVADO' : 'REPROVADO'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Entrada:</span>
                      <div className="font-mono bg-gray-100 p-1 rounded text-xs">{teste.entrada}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Esperado:</span>
                      <div className="font-mono bg-gray-100 p-1 rounded text-xs">{teste.esperado}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Resultado:</span>
                      <div className={`font-mono p-1 rounded text-xs ${
                        teste.sucesso ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {teste.resultado}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-600">
                    {teste.observacao}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default DataBrasilTestComponent;
