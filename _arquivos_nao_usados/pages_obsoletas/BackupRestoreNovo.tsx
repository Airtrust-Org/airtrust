/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PÁGINA DE BACKUP/RESTORE - SISTEMA COMPLETO
 * Integrado com endpoints /api/admin/backup/*
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import {
  Download,
  Upload,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Trash2,
  RefreshCw,
  Shield,
  HardDrive,
  Calendar,
} from 'lucide-react';
import PageHeader from '@/react-app/components/PageHeader';
import StatCard from '@/react-app/components/StatCard';
import ContentCard from '@/react-app/components/ContentCard';
import { API_BASE_URL } from '@/react-app/config/api';

interface Backup {
  id: string;
  data: string;
  tipo: string;
  tamanho: number;
  tamanho_mb: number;
  hash_md5: string;
  status: string;
  duracao_segundos: number;
  descricao: string;
  total_tabelas: number;
  total_registros: number;
  total_arquivos: number;
  criado_por: string;
  criado_em: string;
  verificado: boolean;
  verificado_em: string | null;
}

interface StatusBackup {
  ultimo_backup: {
    id: string;
    data: string;
    tamanho: number;
    tamanho_mb: number;
    sucesso: boolean;
    duracao_segundos: number;
  } | null;
  proximo_agendado: string | null;
  automatico_ativo: boolean;
  hora_execucao: string;
  retencao_dias: number;
  total_backups: number;
  backups_concluidos: number;
  backups_falhos: number;
  espaco_usado_mb: number;
  total_realizados: number;
}

export default function BackupRestoreNovo() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [status, setStatus] = useState<StatusBackup | null>(null);
  const [loading, setLoading] = useState(false);
  const [criandoBackup, setCriandoBackup] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [agendamentoAtivo, setAgendamentoAtivo] = useState(true);
  const [horaExecucao, setHoraExecucao] = useState('03:00');
  const [retencaoDias, setRetencaoDias] = useState(30);


  useEffect(() => {
    carregarStatus();
    carregarBackups();
  }, [page]);

  const carregarStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/status`);
      const data = await response.json();

      if (data.success) {
        setStatus(data.status);
        setAgendamentoAtivo(data.status.automatico_ativo);
        setHoraExecucao(data.status.hora_execucao);
        setRetencaoDias(data.status.retencao_dias);
      }
    } catch (error) {
      console.error('Erro ao carregar status:', error);
    }
  };

  const carregarBackups = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/listar?page=${page}&limit=10`);
      const data = await response.json();

      if (data.success) {
        setBackups(data.backups);
        setTotalPages(data.total_pages);
      }
    } catch (error) {
      console.error('Erro ao carregar backups:', error);
    } finally {
      setLoading(false);
    }
  };

  const criarBackup = async () => {
    if (!confirm('Deseja criar um backup completo do sistema?')) return;

    setCriandoBackup(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/criar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'completo',
          descricao: 'Backup manual criado pelo usuário',
        }),
      });

      const data = await response.json();

      if (data.success) {
        carregarBackups();
        carregarStatus();
      } else {
        toast.warning(`❌ Erro ao criar backup: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao criar backup:', error);
      toast.warning('❌ Erro ao criar backup. Verifique o console.');
    } finally {
      setCriandoBackup(false);
    }
  };

  const downloadBackup = async (backupId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/${backupId}/download`);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${backupId}.backup.gz`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        toast.warning('❌ Erro ao baixar backup');
      }
    } catch (error) {
      console.error('Erro ao baixar backup:', error);
      toast.warning('❌ Erro ao baixar backup');
    }
  };

  const verificarIntegridade = async (backupId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/${backupId}/verificar`);
      const data = await response.json();

      if (data.success) {
        if (data.integro) {
        } else {
          alert(
            `❌ ATENÇÃO: Backup corrompido!\n\nHash esperado: ${data.hash_esperado}\nHash atual: ${data.hash_atual}`,
          );
        }
        carregarBackups();
      } else {
        toast.warning(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao verificar integridade:', error);
      toast.warning('❌ Erro ao verificar integridade');
    }
  };

  const restaurarBackup = async (backupId: string) => {
    if (
      !confirm(
        '⚠️ ATENÇÃO: Restaurar um backup irá SOBRESCREVER todos os dados atuais do sistema!\n\nDeseja continuar?',
      )
    )
      return;
    if (!confirm('⚠️ CONFIRMAÇÃO FINAL: Tem certeza absoluta? Esta ação não pode ser desfeita!'))
      return;

    setRestaurando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/${backupId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmar: true,
          restaurar_arquivos: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast.warning(`❌ Erro ao restaurar: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao restaurar backup:', error);
      toast.warning('❌ Erro ao restaurar backup');
    } finally {
      setRestaurando(false);
    }
  };

  const excluirBackup = async (backupId: string) => {
    if (!confirm('Deseja excluir este backup? Esta ação não pode ser desfeita.')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/${backupId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        carregarBackups();
        carregarStatus();
      } else {
        toast.warning(`❌ Erro ao excluir: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao excluir backup:', error);
      toast.warning('❌ Erro ao excluir backup');
    }
  };

  const salvarAgendamento = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/backup/agendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodicidade: 'diario',
          hora: horaExecucao,
          retencao_dias: retencaoDias,
          ativo: agendamentoAtivo,
        }),
      });

      const data = await response.json();

      if (data.success) {
        carregarStatus();
      } else {
        toast.warning(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Backup & Restore</h1>
        <p className="text-gray-600 mt-1">Sistema completo de backup automático e restauração</p>
      </div>

      {/* Cards de Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Último Backup</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {status?.ultimo_backup ? `${status.ultimo_backup.tamanho_mb} MB` : 'N/A'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {status?.ultimo_backup
                  ? new Date(status.ultimo_backup.data).toLocaleString('pt-BR')
                  : 'Nenhum backup'}
              </p>
            </div>
            <div className="w-14 h-14 bg-primary/20 rounded-xl flex items-center justify-center">
              <Database className="w-7 h-7 text-primary" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Próximo Agendado</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {status?.automatico_ativo ? status.hora_execucao : 'Desativado'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {status?.proximo_agendado
                  ? new Date(status.proximo_agendado).toLocaleDateString('pt-BR')
                  : 'N/A'}
              </p>
            </div>
            <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
              <Clock className="w-7 h-7 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total de Backups</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{status?.total_backups || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                {status?.backups_concluidos || 0} concluídos
              </p>
            </div>
            <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center">
              <FileText className="w-7 h-7 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Espaço Usado</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {status?.espaco_usado_mb.toFixed(1) || 0} MB
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Retenção: {status?.retencao_dias || 30} dias
              </p>
            </div>
            <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
              <HardDrive className="w-7 h-7 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Migração Localhost → Produção */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-xl p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-yellow-400 rounded-xl flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-yellow-900" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-yellow-900 mb-2">
              🚀 Migração Localhost → Produção
            </h2>
            <p className="text-sm text-yellow-800 mb-4">
              Crie e baixe um backup completo para importar no sistema de produção. O arquivo será
              baixado automaticamente após a criação.
            </p>
            <button
              onClick={async () => {
                if (!confirm('Criar backup completo para migração?')) return;
                setCriandoBackup(true);
                try {
                  const response = await fetch(`${API_BASE_URL}/api/admin/backup/criar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      tipo: 'completo',
                      descricao: 'Backup para migração produção',
                    }),
                  });
                  const data = await response.json();
                  if (data.success) {
                    await downloadBackup(data.backup.id);
                    carregarBackups();
                    carregarStatus();
                  } else {
                    toast.warning(`❌ Erro: ${data.error}`);
                  }
                } catch (error) {
                  console.error('Erro:', error);
                  toast.warning('❌ Erro ao criar backup');
                } finally {
                  setCriandoBackup(false);
                }
              }}
              disabled={criandoBackup}
              className="flex items-center gap-2  py-3 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {criandoBackup ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Criando e Baixando...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  📦 Criar e Baixar Backup Completo
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ações Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Criar Backup */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Download className="w-5 h-5 mr-2 text-primary" />
            Criar Backup Manual
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Cria um backup completo do sistema incluindo todas as 18 tabelas do banco de dados.
          </p>
          <button
            onClick={criarBackup}
            disabled={criandoBackup}
            className="w-full flex items-center justify-center gap-2  py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {criandoBackup ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Criando Backup...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Criar Backup Agora
              </>
            )}
          </button>
        </div>

        {/* Configurar Agendamento */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-green-600" />
            Agendamento Automático
          </h2>

          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={agendamentoAtivo}
                onChange={(e) => setAgendamentoAtivo(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Ativar backup automático diário</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora de Execução
              </label>
              <input
                type="time"
                value={horaExecucao}
                onChange={(e) => setHoraExecucao(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Retenção (dias)
              </label>
              <input
                type="number"
                value={retencaoDias}
                onChange={(e) => setRetencaoDias(parseInt(e.target.value))}
                min="1"
                max="365"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <button
              onClick={salvarAgendamento}
              className="w-full flex items-center justify-center gap-2  py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="w-5 h-5" />
              Salvar Configurações
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Backups */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <Database className="w-5 h-5 mr-2 text-gray-600" />
              Backups Disponíveis
            </h2>
            <button
              onClick={carregarBackups}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className=" py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  ID
                </th>
                <th className=" py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Data
                </th>
                <th className=" py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Tamanho
                </th>
                <th className=" py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Status
                </th>
                <th className=" py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Registros
                </th>
                <th className=" py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {backups.map((backup) => (
                <tr key={backup.id} className="hover:bg-gray-50">
                  <td className=" py-4 text-sm text-gray-900 font-mono">
                    {backup.id.substring(0, 20)}...
                  </td>
                  <td className=" py-4 text-sm text-gray-600">
                    {new Date(backup.criado_em).toLocaleString('pt-BR')}
                  </td>
                  <td className=" py-4 text-sm text-gray-600">{backup.tamanho_mb} MB</td>
                  <td className=" py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        backup.status === 'concluido'
                          ? 'bg-green-100 text-green-800'
                          : backup.status === 'falhou'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {backup.status}
                    </span>
                    {backup.verificado && (
                      <Shield
                        className="inline-block w-4 h-4 ml-2 text-green-600"
                        title="Verificado"
                      />
                    )}
                  </td>
                  <td className=" py-4 text-sm text-gray-600">
                    {backup.total_registros} registros
                  </td>
                  <td className=" py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => downloadBackup(backup.id)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => verificarIntegridade(backup.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Verificar Integridade"
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => restaurarBackup(backup.id)}
                        disabled={restaurando}
                        className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Restaurar"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => excluirBackup(backup.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {backups.length === 0 && !loading && (
            <div className="text-center py-12">
              <Database className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Nenhum backup encontrado</p>
              <p className="text-sm text-gray-400 mt-1">Crie seu primeiro backup acima</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Carregando backups...</p>
            </div>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className=" py-4 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className=" py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className=" py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
