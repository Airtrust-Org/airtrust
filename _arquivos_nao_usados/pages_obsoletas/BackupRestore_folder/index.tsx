import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import {
  Download, Upload, Trash2, Calendar, Clock,
  Database, Users, Award, Monitor, AlertTriangle,
  Check, X, Settings, History, Play, Pause,
  ChevronRight, Home
} from 'lucide-react';

interface BackupModule {
  id: string;
  name: string;
  icon: any;
  count: number;
  color: string;
}

interface BackupFile {
  id: string;
  filename: string;
  created_at: string;
  type: 'manual' | 'scheduled';
  modules: string[];
  total_records: number;
  size?: number;
}

interface BackupPreview {
  filename: string;
  created_at: string;
  total_records: number;
  modules: Record<string, { count: number; size: number }>;
}

export default function BackupRestore() {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'schedule' | 'history'>('backup');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [showModalLimpeza, setShowModalLimpeza] = useState(false);
  const [loading, setLoading] = useState(false);

  const [scheduleConfig, setScheduleConfig] = useState({
    enabled: false,
    frequency: 'daily',
    time: '03:00',
    modules: [] as string[]
  });

  const modules: BackupModule[] = [
    { id: 'funcionarios', name: 'Funcionários', icon: Users, count: 0, color: 'blue' },
    { id: 'qualificacoes', name: 'Qualificações', icon: Award, count: 0, color: 'green' },
    { id: 'simuladores', name: 'Simuladores', icon: Monitor, count: 0, color: 'purple' },
    { id: 'agendamentos', name: 'Agendamentos', icon: Calendar, count: 0, color: 'orange' },
  ];

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const counters = await Promise.all(
        modules.map(async (module) => {
          try {
            const response = await fetch(`${API_BASE_URL}/${module.id}/count`);
            const data = await response.json();
            return { ...module, count: data.count || 0 };
          } catch {
            return { ...module, count: 0 };
          }
        })
      );

      counters.forEach(counter => {
        const index = modules.findIndex(m => m.id === counter.id);
        if (index !== -1) {
          modules[index] = counter;
        }
      });

      const backupsResponse = await fetch(`${API_BASE_URL}/backup/history`);
      const backupsData = await backupsResponse.json();
      if (backupsData.success) {
        setBackups(backupsData.data);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const handleBackupImediato = async () => {
    if (selectedModules.length === 0) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/backup/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: selectedModules })
      });

      const backup = await response.json();

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backup.filename;
      a.click();

      carregarDados(); // Recarregar histórico
    } catch (error) {
      toast.warning('Erro ao criar backup');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);

        setBackupPreview({
          filename: file.name,
          created_at: data.created_at,
          total_records: data.total_records,
          modules: Object.fromEntries(
            Object.entries(data.data).map(([module, records]: [string, any]) => [
              module,
              { count: records.length, size: JSON.stringify(records).length }
            ])
          )
        });
      } catch (error) {
        toast.warning('Arquivo de backup inválido');
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreBackup = async () => {
    if (!backupPreview) return;

    setLoading(true);
    try {
      const fileInput = document.getElementById('backup-upload') as HTMLInputElement;
      const file = fileInput?.files?.[0];

      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const backupData = JSON.parse(e.target?.result as string);

          const response = await fetch(`${API_BASE_URL}/backup/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: backupData.data,
              mode: restoreMode
            })
          });

          const result = await response.json();

          if (result.success) {
            setBackupPreview(null);
            carregarDados();
          } else {
            toast.warning('Erro ao restaurar dados');
          }
        } catch (error) {
          toast.warning('Erro ao processar arquivo de backup');
        }
      };
      reader.readAsText(file);
    } catch (error) {
      toast.warning('Erro ao restaurar backup');
    } finally {
      setLoading(false);
    }
  };

  const handleLimpezaDados = async () => {
    if (selectedModules.length === 0) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/backup/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: selectedModules })
      });

      const result = await response.json();

      if (result.success) {
        setSelectedModules([]);
        carregarDados();
      } else {
        toast.warning('Erro ao limpar dados');
      }
    } catch (error) {
      toast.warning('Erro ao limpar dados');
    } finally {
      setLoading(false);
      setShowModalLimpeza(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/backup/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleConfig)
      });

      const result = await response.json();

      if (result.success) {
      } else {
      }
    } catch (error) {
    }
  };

  const handleDownloadBackup = (backup: BackupFile) => {
    toast.warning(`Fazendo download de: ${backup.filename}`);
  };

  const handleDeleteBackup = async (backup: BackupFile) => {
    if (!confirm(`Deseja excluir o backup "${backup.filename}"?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/backup/${backup.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        carregarDados();
      } else {
        toast.warning('Erro ao excluir backup');
      }
    } catch (error) {
      toast.warning('Erro ao excluir backup');
    }
  };

  const getNextBackupTime = () => {
    if (!scheduleConfig.enabled) return 'Não agendado';

    const now = new Date();
    const [hours, minutes] = scheduleConfig.time.split(':');
    const nextBackup = new Date();
    nextBackup.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }

    return nextBackup.toLocaleString('pt-BR');
  };

  return (
    <div className="p-8">
      {/* BREADCRUMBS */}
      <nav className="flex items-center gap-2 text-sm text-gray-600 mb-6">
        <Home className="h-4 w-4" />
        <ChevronRight className="h-4 w-4" />
        <span className="font-medium text-gray-900">Backup & Restore</span>
      </nav>

      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Backup & Restore
        </h1>
        <p className="text-gray-600">
          Gerencie backups do sistema, agende backups automáticos e restaure dados
        </p>
      </div>

      {/* TABS */}
      <div className="bg-white rounded-2xl shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'backup', label: 'Criar Backup', icon: Download },
            { id: 'restore', label: 'Restaurar Dados', icon: Upload },
            { id: 'schedule', label: 'Agendar Backup', icon: Calendar },
            { id: 'history', label: 'Histórico', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTEÚDO DAS TABS */}
      <div className="space-y-6">

        {/* TAB: CRIAR BACKUP */}
        {activeTab === 'backup' && (
          <div className="space-y-6">

            {/* SELEÇÃO DE MÓDULOS */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Selecione os Módulos para Backup
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {modules.map(module => (
                  <label
                    key={module.id}
                    className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md ${
                      selectedModules.includes(module.id)
                        ? `border-${module.color}-600 bg-${module.color}-50`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModules.includes(module.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedModules([...selectedModules, module.id]);
                        } else {
                          setSelectedModules(selectedModules.filter(m => m !== module.id));
                        }
                      }}
                      className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <div className={`p-3 rounded-lg bg-${module.color}-100`}>
                      <module.icon className={`h-6 w-6 text-${module.color}-600`} />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{module.name}</div>
                      <div className="text-sm text-gray-600">{module.count} registros</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* AÇÕES RÁPIDAS */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedModules(modules.map(m => m.id))}
                  className=" py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Selecionar Tudo
                </button>
                <button
                  onClick={() => setSelectedModules([])}
                  className=" py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Limpar Seleção
                </button>
              </div>
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Ações de Backup
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* BACKUP IMEDIATO */}
                <button
                  onClick={handleBackupImediato}
                  disabled={selectedModules.length === 0 || loading}
                  className="flex items-center gap-4 p-6 border-2 border-primary rounded-xl hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="p-4 bg-primary/20 rounded-lg">
                    <Download className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-gray-900 text-lg">Backup Imediato</div>
                    <div className="text-sm text-gray-600">
                      Baixar backup dos módulos selecionados agora
                    </div>
                    {selectedModules.length > 0 && (
                      <div className="text-xs text-primary mt-1">
                        {selectedModules.length} módulo(s) selecionado(s)
                      </div>
                    )}
                  </div>
                </button>

                {/* LIMPEZA DE DADOS */}
                <button
                  onClick={() => setShowModalLimpeza(true)}
                  disabled={selectedModules.length === 0}
                  className="flex items-center gap-4 p-6 border-2 border-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="p-4 bg-red-100 rounded-lg">
                    <Trash2 className="h-8 w-8 text-red-600" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-gray-900 text-lg">Limpar Dados</div>
                    <div className="text-sm text-gray-600">
                      Remover dados dos módulos selecionados
                    </div>
                    <div className="text-xs text-red-600 mt-1">
                      ⚠️ Ação irreversível sem backup
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: RESTAURAR DADOS */}
        {activeTab === 'restore' && (
          <div className="space-y-6">

            {/* UPLOAD DE BACKUP */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Restaurar a partir de Backup
              </h2>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-primary transition-colors">
                <input
                  type="file"
                  accept=".json,.zip"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="backup-upload"
                />
                <label htmlFor="backup-upload" className="cursor-pointer">
                  <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    Clique para selecionar arquivo de backup
                  </p>
                  <p className="text-sm text-gray-600">
                    Formatos aceitos: .json, .zip
                  </p>
                </label>
              </div>
            </div>

            {/* PREVIEW DOS DADOS */}
            {backupPreview && (
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Preview do Backup
                </h2>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {backupPreview.filename}
                      </div>
                      <div className="text-sm text-gray-600">
                        Criado em: {new Date(backupPreview.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {backupPreview.total_records}
                      </div>
                      <div className="text-sm text-gray-600">registros</div>
                    </div>
                  </div>

                  {/* DETALHES POR MÓDULO */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(backupPreview.modules).map(([module, data]) => (
                      <div key={module} className="p-4 border border-gray-200 rounded-lg">
                        <div className="font-semibold text-gray-900 capitalize">{module}</div>
                        <div className="text-2xl font-bold text-primary mt-2">
                          {data.count}
                        </div>
                        <div className="text-xs text-gray-600">registros</div>
                      </div>
                    ))}
                  </div>

                  {/* OPÇÕES DE RESTORE */}
                  <div className="flex items-center gap-4 p-4 bg-yellow-50 border-l-4 border-yellow-600">
                    <AlertTriangle className="h-6 w-6 text-yellow-600" />
                    <div className="flex-1">
                      <div className="font-semibold text-yellow-900">
                        Escolha o modo de restauração
                      </div>
                      <div className="text-sm text-yellow-800 mt-1">
                        Esta ação irá modificar os dados existentes
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-primary">
                      <input
                        type="radio"
                        name="restore-mode"
                        value="merge"
                        checked={restoreMode === 'merge'}
                        onChange={(e) => setRestoreMode(e.target.value as 'merge')}
                        className="w-5 h-5 text-primary"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Mesclar com dados existentes</div>
                        <div className="text-sm text-gray-600">
                          Adiciona novos registros sem remover os existentes
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-red-600">
                      <input
                        type="radio"
                        name="restore-mode"
                        value="replace"
                        checked={restoreMode === 'replace'}
                        onChange={(e) => setRestoreMode(e.target.value as 'replace')}
                        className="w-5 h-5 text-red-600"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Substituir todos os dados</div>
                        <div className="text-sm text-gray-600">
                          ⚠️ Remove TODOS os dados existentes e importa do backup
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* BOTÕES */}
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={() => setBackupPreview(null)}
                      className=" py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleRestoreBackup}
                      disabled={loading}
                      className=" py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Restaurar Dados
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: AGENDAR BACKUP */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">

            {/* CONFIGURAÇÃO DE AGENDAMENTO */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  Backup Automático
                </h2>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-sm font-medium text-gray-700">
                    {scheduleConfig.enabled ? 'Ativado' : 'Desativado'}
                  </span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={scheduleConfig.enabled}
                      onChange={(e) => setScheduleConfig({...scheduleConfig, enabled: e.target.checked})}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </div>
                </label>
              </div>

              <div className="space-y-4">
                {/* FREQUÊNCIA */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frequência do Backup
                  </label>
                  <select
                    value={scheduleConfig.frequency}
                    onChange={(e) => setScheduleConfig({...scheduleConfig, frequency: e.target.value})}
                    disabled={!scheduleConfig.enabled}
                    className="w-full  py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="hourly">A cada hora</option>
                    <option value="daily">Diariamente</option>
                    <option value="weekly">Semanalmente</option>
                    <option value="monthly">Mensalmente</option>
                  </select>
                </div>

                {/* HORÁRIO */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Horário
                  </label>
                  <input
                    type="time"
                    value={scheduleConfig.time}
                    onChange={(e) => setScheduleConfig({...scheduleConfig, time: e.target.value})}
                    disabled={!scheduleConfig.enabled}
                    className="w-full  py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary disabled:opacity-50"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Próximo backup: {getNextBackupTime()}
                  </p>
                </div>

                {/* MÓDULOS */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Módulos Incluídos
                  </label>
                  <div className="space-y-2">
                    {modules.map(module => (
                      <label key={module.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleConfig.modules.includes(module.id)}
                          onChange={(e) => {
                            const modules = scheduleConfig.modules;
                            setScheduleConfig({
                              ...scheduleConfig,
                              modules: e.target.checked
                                ? [...modules, module.id]
                                : modules.filter(m => m !== module.id)
                            });
                          }}
                          disabled={!scheduleConfig.enabled}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <module.icon className="h-5 w-5 text-gray-600" />
                        <span className="font-medium text-gray-900">{module.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* BOTÃO SALVAR */}
                <div className="pt-4">
                  <button
                    onClick={handleSaveSchedule}
                    className="w-full  py-3 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    Salvar Configuração
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: HISTÓRICO */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              Histórico de Backups
            </h2>

            <div className="space-y-3">
              {backups.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum backup encontrado</p>
                </div>
              ) : (
                backups.map(backup => (
                  <div key={backup.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                    <div className={`p-3 rounded-lg ${
                      backup.type === 'manual' ? 'bg-primary/20' : 'bg-green-100'
                    }`}>
                      {backup.type === 'manual' ? (
                        <Download className={`h-6 w-6 ${backup.type === 'manual' ? 'text-primary' : 'text-green-600'}`} />
                      ) : (
                        <Clock className="h-6 w-6 text-green-600" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{backup.filename}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(backup.created_at).toLocaleString('pt-BR')} •
                        {backup.modules.join(', ')} •
                        {backup.total_records} registros
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownloadBackup(backup)}
                        className=" py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(backup)}
                        className=" py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE LIMPEZA */}
      {showModalLimpeza && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Confirmar Limpeza</h2>
                <p className="text-gray-600">Esta ação não pode ser desfeita</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-gray-700">
                Você está prestes a remover todos os dados dos seguintes módulos:
              </p>

              <div className="space-y-2">
                {selectedModules.map(moduleId => {
                  const module = modules.find(m => m.id === moduleId);
                  const IconComponent = module?.icon;
                  return (
                    <div key={moduleId} className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      {IconComponent && <IconComponent className="h-5 w-5 text-red-600" />}
                      <span className="font-medium text-red-900">{module?.name}</span>
                      <span className="text-sm text-red-600">({module?.count} registros)</span>
                    </div>
                  );
                })}
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ Certifique-se de ter um backup recente antes de prosseguir.
                  Esta ação irá remover permanentemente os dados selecionados.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModalLimpeza(false)}
                className="flex-1  py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleLimpezaDados}
                disabled={loading}
                className="flex-1  py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Limpando...' : 'Confirmar Limpeza'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
