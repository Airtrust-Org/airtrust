/**
 * Página de Importação - Versão Simplificada V2
 *
 * Sistema de importação que usa ModalImportacao comprovadamente funcional.
 * Suporta CSV, XLSX e XLS com parse e validação no backend.
 */

import { Suspense, useState } from 'react';
import AppLayout from '@/react-app/components/AppLayout';
import { Card } from '@/react-app/components/UI/Card';
import { Button } from '@/react-app/components/UI/Button';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';

const ModalImportacao = lazyWithRetry(
  () =>
    import('@/react-app/components/importacao/ModalImportacao').then((module) => ({
      default: module.ModalImportacao,
    })),
  'ImportacaoPageV2ModalImportacao',
);

const modalFallback = <div className="fixed inset-0 z-50 bg-black/30" />;

// Type definition (useImportacaoV2 hook doesn't exist yet)
type EntidadeV2 = 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico';

export default function ImportacaoPageV2() {
  const [entidade, setEntidade] = useState<EntidadeV2>('funcionarios');
  const [showModal, setShowModal] = useState(false);

  const nomeEntidade: Record<EntidadeV2, string> = {
    funcionarios: 'Funcionários',
    qualificacoes_tipos: 'Tipos de Qualificações',
    qualificacoes_historico: 'Histórico de Qualificações',
  };

  const nomeAtual = nomeEntidade[entidade];

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">📥 Importação de Dados</h1>
          <p className="text-gray-600">
            Importe dados em massa via CSV ou Excel com validação automática
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuração */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Configuração da Importação</h2>

              <div className="space-y-6">
                {/* Seleção de Entidade */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Tipo de Dados para Importar
                  </label>
                  <select
                    value={entidade}
                    onChange={(e) => setEntidade(e.target.value as EntidadeV2)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    <option value="funcionarios">👥 Funcionários</option>
                    <option value="qualificacoes_tipos">📜 Tipos de Qualificações</option>
                    <option value="qualificacoes_historico">📅 Histórico de Qualificações</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-500">
                    Selecionado: <span className="font-semibold">{nomeAtual}</span>
                  </p>
                </div>

                {/* Botão Importar */}
                <Button
                  onClick={() => setShowModal(true)}
                  className="w-full py-4 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all"
                >
                  🚀 Iniciar Importação de {nomeAtual}
                </Button>
              </div>
            </Card>
          </div>

          {/* Informações */}
          <div className="space-y-4">
            {/* Formatos Suportados */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <span className="text-lg">📄</span>
                Formatos Suportados
              </h3>
              <ul className="text-sm text-blue-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <div>
                    <strong>CSV (.csv)</strong>
                    <br />
                    <span className="text-xs">Valores separados por vírgula</span>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <div>
                    <strong>Excel 2007+ (.xlsx)</strong>
                    <br />
                    <span className="text-xs">Formato moderno</span>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <div>
                    <strong>Excel 97-2003 (.xls)</strong>
                    <br />
                    <span className="text-xs">Formato legado</span>
                  </div>
                </li>
              </ul>
            </Card>

            {/* Recursos */}
            <Card className="p-4 bg-green-50 border-green-200">
              <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                <span className="text-lg">✨</span>
                Recursos
              </h3>
              <ul className="text-sm text-green-700 space-y-1">
                <li>✅ Validação automática</li>
                <li>✅ Preview antes de importar</li>
                <li>✅ Detecção de duplicatas</li>
                <li>✅ Download de template</li>
                <li>✅ Relatório detalhado</li>
              </ul>
            </Card>

            {/* Dica */}
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <h3 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                <span className="text-lg">💡</span>
                Dica
              </h3>
              <p className="text-sm text-yellow-700">
                Baixe o template para garantir que seu arquivo tenha todos os campos necessários no
                formato correto.
              </p>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal V2 - Comprovadamente Funcional */}
      {showModal && (
        <Suspense fallback={modalFallback}>
          <ModalImportacao
            entidade={entidade}
            onClose={() => setShowModal(false)}
            onSucesso={() => {
              setShowModal(false);
              window.location.reload();
            }}
          />
        </Suspense>
      )}
    </AppLayout>
  );
}
