/**
 * ========================================
 * PÁGINA: Manutenção de Dados
 * /configuracoes/manutencao
 * ========================================
 */

import { FixRenovadasButton } from '../components/FixRenovadasButton';

export default function ManutencaoDados() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">🔧 Manutenção de Dados</h1>
        <p className="text-sm text-gray-600">
          Ferramentas para corrigir e otimizar dados após importações ou migrações
        </p>
      </div>

      {/* Fix Renovadas */}
      <FixRenovadasButton />

      {/* Placeholder para futuras ferramentas */}
      <div className="bg-gray-50 rounded-lg p-6 border border-dashed border-gray-300">
        <h3 className="text-lg font-semibold text-gray-400 mb-2">🚧 Mais ferramentas em breve</h3>
        <p className="text-sm text-gray-500">
          Outras funcionalidades de manutenção serão adicionadas aqui conforme necessário
        </p>
      </div>
    </div>
  );
}
