/**
 * 🔍 PÁGINA DE AUDITORIA DE DATAS BRASILEIRAS
 *
 * Interface para executar auditoria completa do sistema
 * e verificar conformidade com padrão brasileiro dd/mm/aaaa
 */

import { useState } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Play, CheckCircle, AlertCircle, Download } from 'lucide-react';
import Button from '../components/Button';
import { PageLayout, PageSection } from '@/react-app/components/layout/PageLayout';

interface EstatisticasAuditoria {
  totalCampos: number;
  camposCorretos: number;
  camposProblematicos: number;
  modulosAfetados: string[];
  porcentagem_conformidade: number;
}

interface ProblemaData {
  modulo: string;
  endpoint: string;
  campo: string;
  valor: string | number | null;
  formato: string;
  correcaoSugerida?: string;
}

const AuditoriaDatas: React.FC = () => {
  const [auditando, setAuditando] = useState(false);
  const [resultados, setResultados] = useState<{
    estatisticas: EstatisticasAuditoria;
    problemas: ProblemaData[];
    relatorio_markdown: string;
  } | null>(null);
  const [erro, setErro] = useState<string>('');

  const executarAuditoria = async () => {
    setAuditando(true);
    setErro('');
    setResultados(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auditoria-datas/executar`);
      const data = await response.json();

      if (data.success) {
        setResultados(data.data);
      } else {
        setErro(data.error || 'Erro desconhecido na auditoria');
      }
    } catch (error) {
      console.error('Erro na auditoria:', error);
      setErro('Erro de conexão ao executar auditoria');
    } finally {
      setAuditando(false);
    }
  };

  const baixarRelatorio = () => {
    if (!resultados?.relatorio_markdown) return;

    const blob = new Blob([resultados.relatorio_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-datas-airtrust-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageLayout
      title="Auditoria de Datas"
      subtitle="Verificação de conformidade com padrão brasileiro dd/mm/aaaa"
    >
      <PageSection>
        <div className="bg-primary/10 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-primary font-medium mb-1">Objetivo da Auditoria:</p>
              <p className="text-blue-700">
                Identificar todos os campos de data no sistema que não estão no formato brasileiro
                obrigatório (dd/mm/aaaa). A auditoria analisa formulários, APIs, banco de dados e
                interfaces para garantir 100% de conformidade.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Executar Auditoria Completa
              </h3>
              <p className="text-gray-600 text-sm">
                Analisa todos os módulos: Simulador, Certificações, Treinamentos, Funcionários e
                Sistema
              </p>
            </div>
            <Button onClick={executarAuditoria} disabled={auditando} className="flex items-center">
              {auditando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Auditando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Iniciar Auditoria
                </>
              )}
            </Button>
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
              <div>
                <p className="text-red-800 font-medium">Erro na Auditoria</p>
                <p className="text-red-700 text-sm mt-1">{erro}</p>
              </div>
            </div>
          </div>
        )}
      </PageSection>

      {resultados && (
        <>
          <PageSection>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  📊 Estatísticas da Auditoria
                </h3>
                <Button
                  variant="secondary"
                  onClick={baixarRelatorio}
                  className="flex items-center text-sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Relatório
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gray-50 rounded-lg p-6 text-center border border-gray-200">
                  <div className="text-2xl font-bold text-gray-900 mb-2">
                    {resultados.estatisticas.totalCampos}
                  </div>
                  <p className="text-gray-600 text-sm">Campos Auditados</p>
                </div>

                <div className="bg-green-50 rounded-lg p-6 text-center border border-green-200">
                  <div className="text-2xl font-bold text-green-800 mb-2">
                    {resultados.estatisticas.camposCorretos}
                  </div>
                  <p className="text-green-700 text-sm">✅ Formato Brasileiro</p>
                </div>

                <div className="bg-red-50 rounded-lg p-6 text-center border border-red-200">
                  <div className="text-2xl font-bold text-red-800 mb-2">
                    {resultados.estatisticas.camposProblematicos}
                  </div>
                  <p className="text-red-700 text-sm">❌ Precisam Correção</p>
                </div>

                <div className="bg-primary/10 rounded-lg p-6 text-center border border-blue-200">
                  <div className="text-2xl font-bold text-primary mb-2">
                    {resultados.estatisticas.porcentagem_conformidade}%
                  </div>
                  <p className="text-blue-700 text-sm">Conformidade</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Progresso da Padronização</span>
                  <span className="font-medium text-gray-900">
                    {resultados.estatisticas.porcentagem_conformidade}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${resultados.estatisticas.porcentagem_conformidade}%` }}
                  />
                </div>
              </div>
            </div>
          </PageSection>

          <PageSection>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">🏗️ Módulos Analisados</h3>
              <div className="flex flex-wrap gap-2">
                {resultados.estatisticas.modulosAfetados.map((modulo, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary"
                  >
                    {modulo}
                  </span>
                ))}
              </div>
            </div>
          </PageSection>

          {resultados.problemas.length > 0 && (
            <PageSection>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  🚨 Problemas Identificados ({resultados.problemas.length})
                </h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {resultados.problemas.map((problema, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">
                              {problema.modulo}
                            </span>
                            <span className="text-sm text-gray-500">{problema.endpoint}</span>
                          </div>
                          <div className="text-sm">
                            <p className="text-gray-900 font-medium">
                              Campo:{' '}
                              <code className="bg-gray-100 px-2 py-1 rounded">
                                {problema.campo}
                              </code>
                            </p>
                            <p className="text-gray-600 mt-1">
                              Valor atual:{' '}
                              <code className="bg-gray-100 px-2 py-1 rounded">
                                "{problema.valor}"
                              </code>
                            </p>
                            <p className="text-gray-600">
                              Formato: <span className="font-medium">{problema.formato}</span>
                            </p>
                          </div>
                        </div>
                        {problema.correcaoSugerida && (
                          <div className="ml-4 text-right">
                            <p className="text-xs text-gray-500 mb-1">💡 Sugestão:</p>
                            <code className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              "{problema.correcaoSugerida}"
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PageSection>
          )}

          <PageSection>
            {resultados.estatisticas.porcentagem_conformidade === 100 ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-green-600 mr-4" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-900">
                      🎉 Parabéns! Sistema 100% Brasileiro!
                    </h3>
                    <p className="text-green-700 mt-1">
                      Todos os campos de data estão no formato brasileiro obrigatório dd/mm/aaaa. O
                      sistema está totalmente conforme com os padrões nacionais.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="flex items-center">
                  <AlertCircle className="w-8 h-8 text-yellow-600 mr-4" />
                  <div>
                    <h3 className="text-lg font-semibold text-yellow-900">
                      🔧 Trabalho em Andamento
                    </h3>
                    <p className="text-yellow-700 mt-1">
                      {resultados.estatisticas.camposProblematicos} campos ainda precisam ser
                      convertidos para o formato brasileiro. Continue aplicando as correções
                      sugeridas para alcançar 100% de conformidade.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </PageSection>
        </>
      )}
    </PageLayout>
  );
};

export default AuditoriaDatas;
