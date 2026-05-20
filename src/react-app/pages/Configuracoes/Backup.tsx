/**
 * Página de Backup & Restore
 *
 * Interface para gerenciar backups do sistema AirTrust:
 * - Lista de backups com filtros e busca
 * - Criação de backups manuais com seleção de módulos
 * - Restauração de backups com confirmação obrigatória
 * - Visualização de logs em timeline
 * - Informações de agendamento automático
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';

/** apiFetch com header de autenticação injetado automaticamente */
function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  return apiFetch(input, {
    ...init,
    headers: { ...authHeaders, ...(init?.headers as Record<string, string> | undefined) },
  });
}

function authFetchNoStore(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const noStoreHeaders = {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-AirTrust-Bypass-Cache': '1',
  };
  return authFetch(input, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}
import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import {
  Database,
  Shield,
  Clock,
  Download,
  RefreshCw,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  HardDrive,
  Activity,
  Info,
  Package,
  FileText,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { SettingsSectionIntro } from './components/SettingsSectionIntro';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Backup {
  id: number;
  uuid: string;
  tipo: 'COMPLETO' | 'MODULAR' | 'INCREMENTAL';
  escopo: string;
  status: 'EM_PROGRESSO' | 'CONCLUIDO' | 'FALHOU';
  triggered_by: string;
  total_registros: number;
  total_tabelas: number;
  tamanho_bytes: number;
  duracao_segundos: number;
  retention_policy: string;
  created_at: string;
  expires_at: string;
  descricao?: string;
  modulos_incluidos?: string;
}

interface Log {
  nivel: string;
  mensagem: string;
  created_at?: string;
  timestamp?: string;
  tabela_afetada?: string;
  registros_processados?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODULOS = [
  { id: 'PESSOAS', label: 'Pessoas', icon: '👤' },
  { id: 'QUALIFICACOES', label: 'Qualificações', icon: '🎓' },
  { id: 'HABILITACOES', label: 'Habilitações', icon: '📋' },
  { id: 'SIMULADORES', label: 'Simuladores', icon: '✈️' },
  { id: 'DOCUMENTOS', label: 'Documentos', icon: '📁' },
  { id: 'COMPLIANCE', label: 'Compliance', icon: '✅' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTriggeredBy(tb: string): string {
  if (tb === 'MANUAL_API') return 'Manual';
  if (tb === 'CRON_DIARIO') return 'Auto Diário';
  if (tb === 'CRON_SEMANAL') return 'Auto Semanal';
  if (tb === 'CRON_MENSAL') return 'Auto Mensal';
  return tb;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    CONCLUIDO: {
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'Concluído',
    },
    FALHOU: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      label: 'Falhou',
    },
    EM_PROGRESSO: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Em Progresso',
    },
  };
  const { bg, text, label } = config[status] ?? {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${bg} ${text}`}
    >
      {status === 'CONCLUIDO' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'FALHOU' && <XCircle className="w-3 h-3" />}
      {status === 'EM_PROGRESSO' && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </span>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    COMPLETO: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
    MODULAR: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-400',
    },
    INCREMENTAL: {
      bg: 'bg-slate-100 dark:bg-slate-700',
      text: 'text-slate-600 dark:text-slate-300',
    },
  };
  const { bg, text } = config[tipo] ?? { bg: 'bg-slate-100', text: 'text-slate-600' };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${bg} ${text}`}>
      {tipo}
    </span>
  );
}

function LogLevelIcon({ nivel }: { nivel: string }) {
  switch (nivel) {
    case 'ERROR':
      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    case 'WARN':
      return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    case 'SUCCESS':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  }
}

// ─── Modals ──────────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

function CreateBackupModal({ onClose, onSuccess }: CreateModalProps) {
  const [tipo, setTipo] = useState<'COMPLETO' | 'MODULAR' | 'INCREMENTAL'>('COMPLETO');
  const [selectedModulos, setSelectedModulos] = useState<string[]>([]);
  const [descricao, setDescricao] = useState('');
  const [retentionPolicy, setRetentionPolicy] = useState<'30_DIAS' | '1_ANO' | '7_ANOS'>('7_ANOS');
  const [loading, setLoading] = useState(false);

  const toggleModulo = (id: string) => {
    setSelectedModulos((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (tipo === 'MODULAR' && selectedModulos.length === 0) {
      toast.error('Selecione ao menos um módulo para backup modular');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        tipo,
        modulos: tipo === 'MODULAR' ? selectedModulos : undefined,
        descricao: descricao || undefined,
        retention_policy: retentionPolicy,
      };

      const response = await authFetch('/api/backup/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      if (data.success) {
        toast.success('Backup iniciado com sucesso!');
        await onSuccess();
        onClose();
      } else {
        toast.error(`Erro ao criar backup: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao criar backup:', error);
      toast.error('Erro de conexão ao criar backup');
    } finally {
      setLoading(false);
    }
  };

  const retentionLabels = {
    '30_DIAS': '30 dias (rotina diária)',
    '1_ANO': '1 ano (rotina semanal)',
    '7_ANOS': '7 anos (conformidade FAA)',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Criar Novo Backup
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configure as opções do backup manual
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipo de Backup
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['COMPLETO', 'MODULAR', 'INCREMENTAL'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    tipo === t
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {t === 'COMPLETO' && <Database className="w-5 h-5 text-blue-600" />}
                  {t === 'MODULAR' && <Package className="w-5 h-5 text-purple-600" />}
                  {t === 'INCREMENTAL' && <Activity className="w-5 h-5 text-slate-500" />}
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t}
                  </span>
                  {t === 'COMPLETO' && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Recomendado
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Módulos (only for MODULAR) */}
          {tipo === 'MODULAR' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Módulos para Backup
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MODULOS.map((modulo) => (
                  <label
                    key={modulo.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedModulos.includes(modulo.id)
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-primary'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModulos.includes(modulo.id)}
                      onChange={() => toggleModulo(modulo.id)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-primary/30"
                    />
                    <span className="text-base">{modulo.icon}</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {modulo.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Retenção */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Política de Retenção
            </label>
            <div className="space-y-2">
              {(['30_DIAS', '1_ANO', '7_ANOS'] as const).map((r) => (
                <label key={r} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="retention"
                    value={r}
                    checked={retentionPolicy === r}
                    onChange={() => setRetentionPolicy(r)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {retentionLabels[r]}
                    {r === '7_ANOS' && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Conformidade FAA
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Descrição <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Backup antes da migração de dados..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/30 focus:border-transparent resize-none"
              rows={2}
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Este processo pode levar alguns minutos dependendo do volume de dados.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Criando...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" /> Criar Backup
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors font-medium text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

interface LogsModalProps {
  backup: Backup;
  onClose: () => void;
}

function LogsModal({ backup, onClose }: LogsModalProps) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const carregarLogs = async () => {
      try {
        setError(null);
        const response = await authFetchNoStore(`/api/backup/${backup.uuid}`);
        const data = (await response.json()) as {
          success: boolean;
          data?: { logs?: Log[] };
          error?: string;
        };
        if (!response.ok || !data.success) {
          setError(data.error || 'Nao foi possivel carregar os logs deste backup.');
          setLogs([]);
          return;
        }
        setLogs(data.data?.logs || []);
      } catch (error) {
        console.error('Erro ao carregar logs:', error);
        setError('Erro ao carregar logs do backup');
        toast.error('Erro ao carregar logs do backup');
      } finally {
        setLoading(false);
      }
    };
    carregarLogs();
  }, [backup.uuid]);

  const levelColor: Record<string, string> = {
    ERROR: 'text-red-600 dark:text-red-400',
    WARN: 'text-amber-600 dark:text-amber-400',
    SUCCESS: 'text-emerald-600 dark:text-emerald-400',
    INFO: 'text-blue-600 dark:text-blue-400',
  };

  const levelBg: Record<string, string> = {
    ERROR: 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800',
    WARN: 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800',
    SUCCESS: 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800',
    INFO: 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <FileText className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Logs do Backup
              </h2>
              <p className="text-xs text-slate-500 font-mono">{backup.uuid}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={backup.status} />
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <span className="ml-2 text-slate-500 text-sm">Carregando logs...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-slate-400">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-60 text-amber-500" />
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum log detalhado encontrado</p>
              <p className="mt-2 text-xs text-slate-400">
                Este backup existe, mas nao possui eventos persistidos em timeline.
              </p>
            </div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-lg border ${levelBg[log.nivel] ?? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
              >
                <LogLevelIcon nivel={log.nivel} />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${levelColor[log.nivel] ?? 'text-slate-700 dark:text-slate-300'}`}
                  >
                    [{log.nivel}] {log.mensagem}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {(log.timestamp || log.created_at) && (
                      <span className="text-xs text-slate-400">
                        {formatDate(log.timestamp || log.created_at || '')}
                      </span>
                    )}
                    {log.tabela_afetada && (
                      <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono">
                        {log.tabela_afetada}
                      </span>
                    )}
                    {log.registros_processados != null && log.registros_processados > 0 && (
                      <span className="text-xs text-slate-400">
                        {log.registros_processados.toLocaleString('pt-BR')} registros
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

interface RestoreModalProps {
  backup: Backup;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

function RestoreModal({ backup, onClose, onSuccess }: RestoreModalProps) {
  const [selectedModulos, setSelectedModulos] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoreAll, setRestoreAll] = useState(true);

  const backupModulos: string[] = (() => {
    try {
      return JSON.parse(backup.modulos_incluidos || '[]');
    } catch {
      return [];
    }
  })();

  const toggleModulo = (id: string) => {
    setSelectedModulos((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const canSubmit = confirmText === 'CONFIRMAR' && (restoreAll || selectedModulos.length > 0);

  const handleRestore = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const payload = {
        modulos: restoreAll ? undefined : selectedModulos,
      };

      const response = await authFetch(`/api/backup/${backup.uuid}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      if (data.success) {
        toast.success('Restauração concluída com sucesso!');
        await onSuccess();
        onClose();
      } else {
        toast.error(`Erro ao restaurar: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao restaurar:', error);
      toast.error('Erro de conexão ao restaurar backup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-t-2xl">
          <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
              Restaurar Backup
            </h2>
            <p className="text-sm text-red-700 dark:text-red-400">
              Operação destrutiva — dados atuais serão substituídos
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Warning */}
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
              Atenção: Esta ação não pode ser desfeita
            </p>
            <p className="text-sm text-red-700 dark:text-red-400">
              Backup de <strong>{formatDateShort(backup.created_at)}</strong> •{' '}
              {formatBytes(backup.tamanho_bytes)}
            </p>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Escopo da Restauração
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={restoreAll}
                  onChange={() => setRestoreAll(true)}
                  className="w-4 h-4 text-red-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Restaurar todos os módulos do backup
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={!restoreAll}
                  onChange={() => setRestoreAll(false)}
                  className="w-4 h-4 text-red-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Selecionar módulos específicos
                </span>
              </label>
            </div>
          </div>

          {!restoreAll && (
            <div className="grid grid-cols-2 gap-2">
              {MODULOS.filter((m) => backupModulos.includes(m.id)).map((modulo) => (
                <label
                  key={modulo.id}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                    selectedModulos.includes(modulo.id)
                      ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModulos.includes(modulo.id)}
                    onChange={() => toggleModulo(modulo.id)}
                    className="w-3.5 h-3.5 text-red-600"
                  />
                  <span>{modulo.icon}</span>
                  <span className="text-slate-700 dark:text-slate-300">{modulo.label}</span>
                </label>
              ))}
            </div>
          )}

          {/* Confirmation input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Digite <span className="font-mono font-bold text-red-600">CONFIRMAR</span> para
              prosseguir
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRMAR"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleRestore}
            disabled={!canSubmit || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Restaurando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> Restaurar Backup
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors font-medium text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTipo, setFilterTipo] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [logsBackup, setLogsBackup] = useState<Backup | null>(null);
  const [restoreBackup, setRestoreBackup] = useState<Backup | null>(null);

  const carregarBackups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authFetchNoStore('/api/backup?limit=50');
      const data = (await response.json()) as { success: boolean; data?: Backup[]; error?: string };

      if (response.ok && data.success) {
        setBackups(data.data || []);
      } else {
        toast.error(data.error || 'Erro ao carregar lista de backups');
      }
    } catch (error) {
      console.error('Erro ao carregar backups:', error);
      toast.error('Erro de conexão ao carregar backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarBackups();
  }, [carregarBackups]);

  useEffect(() => {
    if (!backups.some((backup) => backup.status === 'EM_PROGRESSO')) return;

    const timer = window.setTimeout(() => {
      carregarBackups();
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [backups, carregarBackups]);

  const handleDownload = async (backup: Backup) => {
    try {
      const response = await authFetch(`/api/backup/${backup.uuid}/download`);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${backup.uuid}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download iniciado');
    } catch (error) {
      console.error('Erro ao fazer download:', error);
      toast.error('Erro ao fazer download do backup');
    }
  };

  const handleDelete = async (backup: Backup) => {
    const confirmed = await confirmDialog(
      `Deseja remover o backup de ${formatDateShort(backup.created_at)}? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    try {
      const response = await authFetch(`/api/backup/${backup.uuid}`, { method: 'DELETE' });
      const data = (await response.json()) as { success: boolean };

      if (data.success) {
        toast.success('Backup removido com sucesso');
        carregarBackups();
      } else {
        toast.error('Erro ao remover backup');
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Erro de conexão ao remover backup');
    }
  };

  // ── Stats ──
  const totalBackups = backups.length;
  const ultimoBackup = backups[0];
  const totalSize = backups.reduce((sum, b) => sum + (b.tamanho_bytes || 0), 0);
  const backupsConcluidos = backups.filter((b) => b.status === 'CONCLUIDO').length;

  // ── Filtered list ──
  const filtered = backups.filter((b) => {
    const matchSearch =
      !searchQuery ||
      b.uuid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.descricao || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      formatTriggeredBy(b.triggered_by).toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = !filterStatus || b.status === filterStatus;
    const matchTipo = !filterTipo || b.tipo === filterTipo;
    return matchSearch && matchStatus && matchTipo;
  });

  return (
    <div className="space-y-4">
        <SettingsSectionIntro
          badge="Backup e restauração"
          title="Backup & Restore"
          description="Gerenciamento de backups e recuperação de dados do sistema AirTrust."
          icon={<Database className="h-5 w-5" />}
          action={
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              <Database className="w-4 h-4" />
              Criar Backup
            </button>
          }
        />

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                  Total
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {totalBackups}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                  Concluídos
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {backupsConcluidos}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                <HardDrive className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                  Tamanho Total
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {formatBytes(totalSize)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                <Calendar className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                  Último Backup
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {ultimoBackup ? formatDateShort(ultimoBackup.created_at) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Table Card ── */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Activity className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por UUID, descrição ou origem..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Todos os status</option>
              <option value="CONCLUIDO">Concluído</option>
              <option value="EM_PROGRESSO">Em Progresso</option>
              <option value="FALHOU">Falhou</option>
            </select>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Todos os tipos</option>
              <option value="COMPLETO">Completo</option>
              <option value="MODULAR">Modular</option>
              <option value="INCREMENTAL">Incremental</option>
            </select>
            <button
              onClick={carregarBackups}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="mt-3 text-sm text-slate-500">Carregando backups...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Database className="w-14 h-14 text-slate-200 dark:text-slate-700 mb-4" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">
                {searchQuery || filterStatus || filterTipo
                  ? 'Nenhum backup encontrado para os filtros aplicados'
                  : 'Nenhum backup encontrado'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {!searchQuery &&
                  !filterStatus &&
                  !filterTipo &&
                  'Crie o primeiro backup usando o botão acima'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      UUID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Origem
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Registros
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Tamanho
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Data
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Retenção
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((backup) => (
                    <tr
                      key={backup.uuid}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <StatusBadge status={backup.status} />
                      </td>
                      <td className="px-4 py-3">
                        <TipoBadge tipo={backup.tipo} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {backup.uuid.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-700 dark:text-slate-300">
                          {formatTriggeredBy(backup.triggered_by)}
                        </span>
                        {backup.descricao && (
                          <p
                            className="text-xs text-slate-400 truncate max-w-[150px]"
                            title={backup.descricao}
                          >
                            {backup.descricao}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {(backup.total_registros || 0).toLocaleString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                        {formatBytes(backup.tamanho_bytes || 0)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(backup.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {(backup.retention_policy || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setLogsBackup(backup)}
                            title="Ver logs"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {backup.status === 'CONCLUIDO' && (
                            <>
                              <button
                                onClick={() => handleDownload(backup)}
                                title="Baixar backup"
                                className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setRestoreBackup(backup)}
                                title="Restaurar backup"
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(backup)}
                            title="Remover backup"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer row count */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
              {filtered.length} de {backups.length} backup{backups.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* ── Automated Schedule Card ── */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">
              Próximos Backups Automáticos
            </h3>
            <Shield className="w-4 h-4 text-blue-500 ml-1" title="Conformidade FAA" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg mt-0.5">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">Diário</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  Todos os dias às 03:00 UTC
                </p>
                <p className="text-xs text-blue-500 dark:text-blue-500 mt-1">Retenção: 30 dias</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg mt-0.5">
                <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-semibold text-purple-800 dark:text-purple-300 text-sm">
                  Semanal
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                  Domingos às 04:00 UTC
                </p>
                <p className="text-xs text-purple-500 dark:text-purple-500 mt-1">Retenção: 1 ano</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg mt-0.5">
                <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">Mensal</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Dia 1 de cada mês às 05:00 UTC
                </p>
                <p className="text-xs text-amber-500 dark:text-amber-500 mt-1">
                  Retenção: 7 anos (FAA)
                </p>
              </div>
            </div>
          </div>
        </div>

      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateBackupModal onClose={() => setShowCreateModal(false)} onSuccess={carregarBackups} />
      )}

      {logsBackup && <LogsModal backup={logsBackup} onClose={() => setLogsBackup(null)} />}

      {restoreBackup && (
        <RestoreModal
          backup={restoreBackup}
          onClose={() => setRestoreBackup(null)}
          onSuccess={carregarBackups}
        />
      )}
    </div>
  );
}
