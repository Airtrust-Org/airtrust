import { Routes, Route, Navigate } from 'react-router';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import MasterDetailLayout from '../components/layouts/MasterDetailLayout';
import AeronavesCRUD from './Aeronaves';

const ConfiguracoesFuncoes = lazyWithRetry(
  () => import('./ConfiguracoesFuncoes'),
  'ConfiguracoesFuncoes',
);
const ConfiguracaoEmpresa = lazyWithRetry(
  () => import('./ConfiguracaoEmpresa'),
  'ConfiguracaoEmpresa',
);
const ConfiguracaoCertificado = lazyWithRetry(
  () => import('./ConfiguracaoCertificado'),
  'ConfiguracaoCertificado',
);
const ManutencaoDados = lazyWithRetry(() => import('./ManutencaoDados'), 'ManutencaoDados');
const LimparDados = lazyWithRetry(() => import('./Configuracoes/LimparDados'), 'LimparDados');
const HardRefresh = lazyWithRetry(() => import('./Configuracoes/HardRefresh'), 'HardRefresh');

const UserManagement = () => (
  <div className="text-center py-12">
    <h2 className="text-xl font-semibold text-text-primary mb-4">Usuários e Permissões</h2>
    <p className="text-text-secondary">Esta funcionalidade estará disponível em breve.</p>
  </div>
);

const AuditLogs = () => (
  <div className="text-center py-12">
    <h2 className="text-xl font-semibold text-text-primary mb-4">Logs de Auditoria</h2>
    <p className="text-text-secondary">Esta funcionalidade estará disponível em breve.</p>
  </div>
);

export default function ConfiguracoesLayout() {
  return (
    <MasterDetailLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/configuracoes/funcoes" replace />} />
        <Route path="/funcoes" element={<ConfiguracoesFuncoes />} />
        <Route path="/empresa" element={<ConfiguracaoEmpresa />} />
        <Route path="/certificado" element={<ConfiguracaoCertificado />} />
        <Route path="/aeronaves" element={<AeronavesCRUD />} />
        <Route path="/manutencao" element={<ManutencaoDados />} />
        <Route path="/limpar-dados" element={<LimparDados />} />
        <Route path="/hard-refresh" element={<HardRefresh />} />
        <Route path="/usuarios" element={<UserManagement />} />
        <Route path="/auditoria" element={<AuditLogs />} />
      </Routes>
    </MasterDetailLayout>
  );
}
