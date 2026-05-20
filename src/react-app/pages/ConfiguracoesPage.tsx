import { useState } from 'react';
import { AlertCircle, CheckCircle, Copy, Users, Webhook, Zap, Building2, Package, HardDrive, Upload, Network, AlertTriangle, GraduationCap, Wrench } from 'lucide-react';
import AppLayout from '../components/AppLayout';

type Tab =
  | 'empresas'
  | 'usuarios'
  | 'cadastros'
  | 'backup'
  | 'importacoes'
  | 'integracoes'
  | 'zona-perigo';
type IntegracaoTab = 'status' | 'usuarios' | 'cursos';

interface WebhookStatus {
  id: string;
  ativo: boolean;
  eventosRecebidos: number;
  processados: number;
  erros: number;
  usuariosMapeados: number;
}

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('integracoes');
  const [integracaoTab, setIntegracaoTab] = useState<IntegracaoTab>('status');

  const webhookStatus: WebhookStatus = {
    id: '91af81ff-e9cc-4378-8367-18cc67a5a555',
    ativo: true,
    eventosRecebidos: 9,
    processados: 3,
    erros: 3,
    usuariosMapeados: 19,
  };

  const copiarWebhookUrl = () => {
    navigator.clipboard.writeText('https://api.airtrust.online/api/integracoes/edapp/webhook');
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
          <p className="text-sm text-slate-600 mt-1">
            Gerencie as configurações do sistema e da sua organização
          </p>
        </div>

        {/* Main Tabs */}
        <div className="border-b border-slate-200">
          <nav className="flex gap-4 overflow-x-auto">
            {[
              { id: 'empresas', label: 'Empresas', icon: <Building2 className="w-4 h-4" /> },
              { id: 'usuarios', label: 'Usuários', icon: <Users className="w-4 h-4" /> },
              { id: 'cadastros', label: 'Cadastros', icon: <Package className="w-4 h-4" /> },
              { id: 'backup', label: 'Backup', icon: <HardDrive className="w-4 h-4" /> },
              { id: 'importacoes', label: 'Importações', icon: <Upload className="w-4 h-4" /> },
              { id: 'integracoes', label: 'Integrações', icon: <Network className="w-4 h-4" /> },
              { id: 'zona-perigo', label: 'Zona de Perigo', icon: <AlertTriangle className="w-4 h-4" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Integrações Content */}
        {activeTab === 'integracoes' && (
          <div className="space-y-4">
            {/* EdApp Integration Header */}
            <div>
              <h2 className="text-xl font-bold text-slate-900">Integração EdApp</h2>
              <p className="text-sm text-slate-600 mt-1">
                Configure a integração com a plataforma EdApp
              </p>
            </div>

            {/* Sub Tabs */}
            <div className="border-b border-slate-200">
              <nav className="flex gap-6">
                {[
                  { id: 'status', label: 'Status', icon: <Zap className="w-4 h-4" /> },
                  { id: 'usuarios', label: 'Usuários', icon: <Users className="w-4 h-4" /> },
                  { id: 'cursos', label: 'Cursos', icon: <GraduationCap className="w-4 h-4" /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setIntegracaoTab(tab.id as IntegracaoTab)}
                    className={`flex items-center gap-2 px-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                      integracaoTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Status Tab Content */}
            {integracaoTab === 'status' && (
              <div className="space-y-4">
                {/* Webhook Status Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Webhook className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">Webhook EdApp</h3>
                        <p className="text-xs text-slate-500">ID: {webhookStatus.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {webhookStatus.ativo && (
                        <>
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-medium text-green-700">Ativo</span>
                        </>
                      )}
                    </div>
                  </div>

                  {webhookStatus.ativo && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm">
                      <CheckCircle className="w-5 h-5" />
                      Webhook ativo (ID: {webhookStatus.id})
                    </div>
                  )}
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Zap className="w-4 h-4 text-blue-600" />
                      </div>
                      <h3 className="text-sm font-medium text-slate-600">Eventos Recebidos</h3>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">
                      {webhookStatus.eventosRecebidos}
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                      <h3 className="text-sm font-medium text-slate-600">Processados</h3>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{webhookStatus.processados}</p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      </div>
                      <h3 className="text-sm font-medium text-slate-600">Erros</h3>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{webhookStatus.erros}</p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Users className="w-4 h-4 text-purple-600" />
                      </div>
                      <h3 className="text-sm font-medium text-slate-600">Usuários Mapeados</h3>
                    </div>
                    <p className="text-2xl font-bold text-purple-600">
                      {webhookStatus.usuariosMapeados}
                    </p>
                  </div>
                </div>

                {/* Configuration Section */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Configurações do Webhook</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        URL do Webhook
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value="https://api.airtrust.online/api/integracoes/edapp/webhook"
                          className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 font-mono"
                        />
                        <button
                          onClick={copiarWebhookUrl}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <Copy className="w-5 h-5" />
                          Copiar
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Eventos Monitorados
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'user.created',
                          'user.updated',
                          'course.completed',
                          'course.progress',
                        ].map((event) => (
                          <span
                            key={event}
                            className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                          >
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                      <div>
                        <h4 className="text-sm font-medium text-slate-900">Auto-sincronização</h4>
                        <p className="text-xs text-slate-500">
                          Sincronizar dados automaticamente a cada evento
                        </p>
                      </div>
                      <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-primary transition-colors">
                        <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Recent Events */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Eventos Recentes</h3>

                  <div className="space-y-3">
                    {[
                      { tipo: 'user.created', status: 'sucesso', tempo: '2 min atrás' },
                      { tipo: 'course.completed', status: 'sucesso', tempo: '15 min atrás' },
                      { tipo: 'user.updated', status: 'erro', tempo: '1 hora atrás' },
                    ].map((evento, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {evento.status === 'sucesso'
                            ? <CheckCircle className="w-4 h-4 text-green-600" />
                            : <AlertCircle className="w-4 h-4 text-red-600" />
                          }
                          <div>
                            <p className="text-sm font-medium text-slate-900">{evento.tipo}</p>
                            <p className="text-xs text-slate-500">{evento.tempo}</p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            evento.status === 'sucesso'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {evento.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Usuários Tab */}
            {integracaoTab === 'usuarios' && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Users className="w-14 h-14 text-slate-300 mb-4 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Gerenciamento de Usuários
                </h3>
                <p className="text-slate-600 mb-4">
                  Visualize e gerencie os usuários sincronizados com o EdApp
                </p>
                <p className="text-sm text-primary font-medium">
                  {webhookStatus.usuariosMapeados} usuários mapeados
                </p>
              </div>
            )}

            {/* Cursos Tab */}
            {integracaoTab === 'cursos' && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <GraduationCap className="w-14 h-14 text-slate-300 mb-4 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Cursos Sincronizados</h3>
                <p className="text-slate-600">
                  Gerencie os cursos e conclusões sincronizados do EdApp
                </p>
              </div>
            )}
          </div>
        )}

        {/* Placeholder para outras tabs */}
        {activeTab !== 'integracoes' && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Wrench className="w-14 h-14 text-slate-300 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Em desenvolvimento</h3>
            <p className="text-slate-600">Esta seção estará disponível em breve</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
