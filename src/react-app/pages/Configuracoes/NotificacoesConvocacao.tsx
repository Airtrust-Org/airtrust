import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Mail, RotateCcw, Save, Send, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/react-app/hooks/useAuth';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import {
  useAtualizarGestorCopiaConvocacao,
  useCriarGestorCopiaConvocacao,
  useEnviarEmailTesteConvocacao,
  useExcluirGestorCopiaConvocacao,
  useNotificacoesConvocacaoConfig,
  useSalvarNotificacoesConvocacaoConfig,
  useTestarConexaoConvocacao,
  type GestorCopiaConvocacao,
  type NotificacoesConvocacaoConfigInput,
} from '@/react-app/hooks/useNotificacoesConvocacao';

interface GestorFormState {
  id: number | null;
  nome: string;
  email: string;
  cargo: string;
  empresa: string;
  ativo: boolean;
}

interface ConfigFormState {
  smtp_host: string;
  smtp_port: string;
  smtp_security: 'TLS' | 'SSL' | 'NONE';
  smtp_user: string;
  smtp_password: string;
  sender_name: string;
  reply_to: string;
  assunto_padrao: string;
  assinatura_html: string;
  template_html: string;
  batch_size: string;
  batch_interval_ms: string;
}

interface ConfigDefaults {
  smtp_host?: string;
  smtp_port?: number;
  smtp_security?: 'TLS' | 'SSL' | 'NONE';
  smtp_user?: string;
  sender_name?: string;
  reply_to?: string;
  assunto_padrao: string;
  assinatura_html: string;
  template_html: string;
}

const VARIABLE_BUTTONS = [
  '{{MATRICULA}}',
  '{{NOME_TREINAMENTO}}',
  '{{MODALIDADE}}',
  '{{DATA_INICIO}}',
  '{{DATA_FIM}}',
  '{{HORARIO}}',
  '{{LOCAL}}',
  '{{LINK_ACESSO}}',
  '{{INSTRUTOR}}',
  '{{EMPRESA}}',
  '{{DATA_ENVIO}}',
  '{{LISTA_PARTICIPANTES_TURMA}}',
].join('|');

const MOCK_VALUES: Record<string, string> = {
  '{{NOME_TRIPULANTE}}': 'Leonardo Marques',
  '{{MATRICULA}}': 'TRP-0241',
  '{{NOME_TREINAMENTO}}': 'CRM Recorrente 2026',
  '{{MODALIDADE}}': 'Presencial',
  '{{DATA_INICIO}}': '12/05/2026',
  '{{DATA_FIM}}': '12/05/2026',
  '{{HORARIO}}': '08:00 às 12:00',
  '{{LOCAL}}': 'Sala Alpha — Centro de Treinamento',
  '{{LINK_ACESSO}}':
    '<a href="https://airtrust.online/ead/treinamento">https://airtrust.online/ead/treinamento</a>',
  '{{INSTRUTOR}}': 'Cap. Renata Costa',
  '{{EMPRESA}}': 'AirTrust Aviation',
  '{{DATA_ENVIO}}': '04/05/2026 10:15',
  '{{LISTA_PARTICIPANTES_TURMA}}':
    '<ul><li>Leonardo Marques (TRP-0241)</li><li>Camila Souza (TRP-0198)</li><li>Diego Lima (TRP-0310)</li></ul>',
  '{{ASSINATURA_INSTITUCIONAL}}':
    '<p><strong>AirTrust — Treinamentos</strong><br/>Departamento de Treinamento</p>',
};

function emptyGestorForm(): GestorFormState {
  return {
    id: null,
    nome: '',
    email: '',
    cargo: '',
    empresa: '',
    ativo: true,
  };
}

function configToForm(config?: {
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_security: 'TLS' | 'SSL' | 'NONE';
  smtp_user?: string | null;
  sender_name?: string | null;
  reply_to?: string | null;
  assunto_padrao: string;
  assinatura_html: string;
  template_html: string;
  batch_size: number;
  batch_interval_ms: number;
}): ConfigFormState {
  return {
    smtp_host: config?.smtp_host || '',
    smtp_port: config?.smtp_port ? String(config.smtp_port) : '',
    smtp_security: config?.smtp_security || 'TLS',
    smtp_user: config?.smtp_user || '',
    smtp_password: '',
    sender_name: config?.sender_name || '',
    reply_to: config?.reply_to || '',
    assunto_padrao: config?.assunto_padrao || '',
    assinatura_html: config?.assinatura_html || '',
    template_html: config?.template_html || '',
    batch_size: config?.batch_size ? String(config.batch_size) : '50',
    batch_interval_ms: config?.batch_interval_ms ? String(config.batch_interval_ms) : '1000',
  };
}

function applyAirTrustDefaults(
  current: ConfigFormState,
  defaults?: ConfigDefaults,
): ConfigFormState {
  return {
    ...current,
    smtp_host: current.smtp_host || defaults?.smtp_host || 'smtp-relay.brevo.com',
    smtp_port: current.smtp_port || (defaults?.smtp_port ? String(defaults.smtp_port) : '587'),
    smtp_security: current.smtp_security || defaults?.smtp_security || 'TLS',
    smtp_user: current.smtp_user || defaults?.smtp_user || 'treinamento@airtrust.online',
    sender_name: current.sender_name || defaults?.sender_name || 'AirTrust - Treinamentos',
    reply_to: current.reply_to || defaults?.reply_to || 'treinamento@airtrust.online',
    assunto_padrao: current.assunto_padrao || defaults?.assunto_padrao || '',
    assinatura_html: current.assinatura_html || defaults?.assinatura_html || '',
    template_html: current.template_html || defaults?.template_html || '',
    batch_size: current.batch_size || '50',
    batch_interval_ms: current.batch_interval_ms || '1000',
  };
}

function previewHtml(templateHtml: string, assinaturaHtml: string): string {
  const withSignature = templateHtml.includes('{{ASSINATURA_INSTITUCIONAL}}')
    ? templateHtml
    : `${templateHtml}<br/>{{ASSINATURA_INSTITUCIONAL}}`;

  return Object.entries({
    ...MOCK_VALUES,
    '{{ASSINATURA_INSTITUCIONAL}}': assinaturaHtml || MOCK_VALUES['{{ASSINATURA_INSTITUCIONAL}}'],
  }).reduce((html, [key, value]) => html.split(key).join(value), withSignature);
}

function missingRequiredVariables(template: string): string[] {
  return ['{{NOME_TREINAMENTO}}', '{{DATA_INICIO}}'].filter((token) => !template.includes(token));
}

export default function NotificacoesConvocacao() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = usePermissions();
  const canEdit = isAdmin || isGestor;

  const configQuery = useNotificacoesConvocacaoConfig();
  const salvarConfig = useSalvarNotificacoesConvocacaoConfig();
  const testarConexao = useTestarConexaoConvocacao();
  const enviarTeste = useEnviarEmailTesteConvocacao();
  const criarGestor = useCriarGestorCopiaConvocacao();
  const atualizarGestor = useAtualizarGestorCopiaConvocacao();
  const excluirGestor = useExcluirGestorCopiaConvocacao();

  const [configForm, setConfigForm] = useState<ConfigFormState>(() => configToForm());
  const [gestorForm, setGestorForm] = useState<GestorFormState>(() => emptyGestorForm());
  const [emailsTeste, setEmailsTeste] = useState('');

  useEffect(() => {
    if (!configQuery.data) return;
    setConfigForm(applyAirTrustDefaults(configToForm(configQuery.data), configQuery.data.defaults));
  }, [configQuery.data]);

  const gestores = configQuery.data?.gestores || [];
  const ativos = gestores.filter((gestor) => gestor.ativo);
  const preview = useMemo(
    () => previewHtml(configForm.template_html, configForm.assinatura_html),
    [configForm.assinatura_html, configForm.template_html],
  );
  const missingVariables = useMemo(
    () => missingRequiredVariables(configForm.template_html),
    [configForm.template_html],
  );

  function setField<K extends keyof ConfigFormState>(field: K, value: ConfigFormState[K]) {
    setConfigForm((current) => ({ ...current, [field]: value }));
  }

  function resetToDefaultTemplate() {
    if (!configQuery.data?.defaults) return;
    setConfigForm((current) => ({
      ...current,
      assunto_padrao: configQuery.data?.defaults.assunto_padrao || current.assunto_padrao,
      assinatura_html: configQuery.data?.defaults.assinatura_html || current.assinatura_html,
      template_html: configQuery.data?.defaults.template_html || current.template_html,
    }));
  }

  function handleApplyRecommendedDefaults() {
    setConfigForm((current) => applyAirTrustDefaults(current, configQuery.data?.defaults));
  }

  function insertVariable(variable: string) {
    setConfigForm((current) => ({
      ...current,
      template_html: `${current.template_html}${current.template_html.endsWith(' ') ? '' : ' '}${variable}`,
    }));
  }

  async function handleSaveConfig() {
    try {
      const payload: NotificacoesConvocacaoConfigInput = {
        smtp_host: configForm.smtp_host || null,
        smtp_port: configForm.smtp_port ? Number(configForm.smtp_port) : null,
        smtp_security: configForm.smtp_security,
        smtp_user: configForm.smtp_user || null,
        smtp_password: configForm.smtp_password || null,
        sender_name: configForm.sender_name || null,
        reply_to: configForm.reply_to || null,
        assunto_padrao: configForm.assunto_padrao || null,
        assinatura_html: configForm.assinatura_html || null,
        template_html: configForm.template_html || null,
        batch_size: configForm.batch_size ? Number(configForm.batch_size) : null,
        batch_interval_ms: configForm.batch_interval_ms
          ? Number(configForm.batch_interval_ms)
          : null,
      };

      await salvarConfig.mutateAsync(payload);
      setConfigForm((current) => ({ ...current, smtp_password: '' }));
      toast.success('Configurações de convocação salvas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar configurações.');
    }
  }

  async function handleTestConnection() {
    try {
      await testarConexao.mutateAsync();
      toast.success('Configuração validada com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao validar configuração.');
    }
  }

  async function handleSendTestEmail() {
    const recipients = emailsTeste
      .split(/[;,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (recipients.length === 0 && !user?.email) {
      toast.error('Usuário atual sem e-mail cadastrado.');
      return;
    }

    try {
      const destinos = recipients.length > 0 ? recipients : [user!.email];
      await enviarTeste.mutateAsync({ emails: destinos, nome: user?.nome });
      toast.success(`E-mail de teste enviado para ${destinos.join(', ')}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar e-mail de teste.');
    }
  }

  function editGestor(gestor: GestorCopiaConvocacao) {
    setGestorForm({
      id: gestor.id,
      nome: gestor.nome,
      email: gestor.email,
      cargo: gestor.cargo || '',
      empresa: gestor.empresa || '',
      ativo: gestor.ativo,
    });
  }

  async function handleSaveGestor() {
    if (!gestorForm.nome.trim() || !gestorForm.email.trim()) {
      toast.error('Informe nome e e-mail do gestor.');
      return;
    }

    const payload = {
      nome: gestorForm.nome.trim(),
      email: gestorForm.email.trim(),
      cargo: gestorForm.cargo.trim() || null,
      empresa: gestorForm.empresa.trim() || null,
      ativo: gestorForm.ativo,
    };

    try {
      if (gestorForm.id) {
        await atualizarGestor.mutateAsync({ id: gestorForm.id, input: payload });
        toast.success('Gestor atualizado.');
      } else {
        await criarGestor.mutateAsync(payload);
        toast.success('Gestor em cópia adicionado.');
      }
      setGestorForm(emptyGestorForm());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar gestor.');
    }
  }

  async function handleDeleteGestor(id: number) {
    if (!window.confirm('Excluir este gestor da lista de cópia?')) return;

    try {
      await excluirGestor.mutateAsync(id);
      if (gestorForm.id === id) {
        setGestorForm(emptyGestorForm());
      }
      toast.success('Gestor removido.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir gestor.');
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Notificações
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Convocação por e-mail</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Configure o servidor de envio, os gestores em cópia e o template padrão usado nas
              convocações das turmas de treinamentos planejados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <Shield className="h-3.5 w-3.5" />
              {canEdit ? 'Edição permitida' : 'Somente visualização'}
            </span>
            <Button
              variant="secondary"
              onClick={() => configQuery.refetch()}
              disabled={configQuery.isFetching}
            >
              Atualizar
            </Button>
            <Button
              variant="secondary"
              onClick={handleApplyRecommendedDefaults}
              disabled={!canEdit}
            >
              <RotateCcw className="h-4 w-4" />
              Aplicar padrão AirTrust
            </Button>
            <Button
              variant="secondary"
              onClick={handleTestConnection}
              disabled={!canEdit || testarConexao.isPending}
            >
              Testar conexão
            </Button>
            <Button
              variant="secondary"
              onClick={handleSendTestEmail}
              disabled={!canEdit || enviarTeste.isPending}
            >
              <Send className="h-4 w-4" />
              Enviar teste
            </Button>
            <Button onClick={handleSaveConfig} disabled={!canEdit || salvarConfig.isPending}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>

        {ativos.length > 10 && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            Há mais de 10 gestores ativos em cópia. Isso pode impactar a deliverability dos envios.
          </div>
        )}

        {missingVariables.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            Variáveis obrigatórias ausentes no template: {missingVariables.join(', ')}.
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-slate-500" />
              <h4 className="text-lg font-semibold text-slate-900">Servidor de e-mail</h4>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700">
                <span>Servidor SMTP</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={configForm.smtp_host}
                  onChange={(event) => setField('smtp_host', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Porta</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  inputMode="numeric"
                  value={configForm.smtp_port}
                  onChange={(event) => setField('smtp_port', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Segurança</span>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={configForm.smtp_security}
                  onChange={(event) =>
                    setField(
                      'smtp_security',
                      event.target.value as ConfigFormState['smtp_security'],
                    )
                  }
                  disabled={!canEdit}
                >
                  <option value="TLS">TLS</option>
                  <option value="SSL">SSL</option>
                  <option value="NONE">Nenhuma</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Usuário de autenticação</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={configForm.smtp_user}
                  onChange={(event) => setField('smtp_user', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>
                  Senha {configQuery.data?.smtp_password_configured ? '(já configurada)' : ''}
                </span>
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={configForm.smtp_password}
                  onChange={(event) => setField('smtp_password', event.target.value)}
                  placeholder={
                    configQuery.data?.smtp_password_configured
                      ? 'Preencha apenas para substituir'
                      : ''
                  }
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Nome de exibição do remetente</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={configForm.sender_name}
                  onChange={(event) => setField('sender_name', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span>Reply-To</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={configForm.reply_to}
                  onChange={(event) => setField('reply_to', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span>E-mails para teste</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={emailsTeste}
                  onChange={(event) => setEmailsTeste(event.target.value)}
                  disabled={!canEdit}
                  placeholder={user?.email || 'separe por vírgula, ; ou quebra de linha'}
                />
                <span className="block text-xs text-slate-500">
                  Se vazio, o teste usa o e-mail do usuário logado.
                </span>
              </label>
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span>Assunto padrão</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={configForm.assunto_padrao}
                  onChange={(event) => setField('assunto_padrao', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Lote por envio</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  inputMode="numeric"
                  value={configForm.batch_size}
                  onChange={(event) => setField('batch_size', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Intervalo entre lotes (ms)</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  inputMode="numeric"
                  value={configForm.batch_interval_ms}
                  onChange={(event) => setField('batch_interval_ms', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-500" />
              <h4 className="text-lg font-semibold text-slate-900">Gestores em cópia</h4>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700">
                <span>Nome do gestor</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={gestorForm.nome}
                  onChange={(event) =>
                    setGestorForm((current) => ({ ...current, nome: event.target.value }))
                  }
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>E-mail</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={gestorForm.email}
                  onChange={(event) =>
                    setGestorForm((current) => ({ ...current, email: event.target.value }))
                  }
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Cargo/Função</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={gestorForm.cargo}
                  onChange={(event) =>
                    setGestorForm((current) => ({ ...current, cargo: event.target.value }))
                  }
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Empresa</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={gestorForm.empresa}
                  onChange={(event) =>
                    setGestorForm((current) => ({ ...current, empresa: event.target.value }))
                  }
                  disabled={!canEdit}
                />
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={gestorForm.ativo}
                onChange={(event) =>
                  setGestorForm((current) => ({ ...current, ativo: event.target.checked }))
                }
                disabled={!canEdit}
              />
              Gestor ativo para receber cópia em todos os envios
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                onClick={handleSaveGestor}
                disabled={!canEdit || criarGestor.isPending || atualizarGestor.isPending}
              >
                {gestorForm.id ? 'Atualizar gestor' : 'Adicionar gestor'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setGestorForm(emptyGestorForm())}
                disabled={!canEdit}
              >
                Limpar
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              {gestores.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  Nenhum gestor em cópia cadastrado.
                </div>
              ) : (
                gestores.map((gestor) => (
                  <div
                    key={gestor.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{gestor.nome}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${gestor.ativo ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}
                        >
                          {gestor.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{gestor.email}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {[gestor.cargo, gestor.empresa].filter(Boolean).join(' · ') ||
                          'Sem cargo/empresa informados'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => editGestor(gestor)}
                        disabled={!canEdit}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => handleDeleteGestor(gestor.id)}
                        disabled={!canEdit || excluirGestor.isPending}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">Template de convocação</h4>
                <p className="mt-1 text-sm text-slate-500">
                  Use HTML e insira variáveis operacionais com um clique.
                </p>
              </div>
              <Button variant="secondary" onClick={resetToDefaultTemplate} disabled={!canEdit}>
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {VARIABLE_BUTTONS.split('|').map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => insertVariable(variable)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white"
                  disabled={!canEdit}
                >
                  {variable}
                </button>
              ))}
            </div>

            <label className="mt-5 block space-y-2 text-sm text-slate-700">
              <span>Assinatura institucional</span>
              <textarea
                className="min-h-[140px] w-full rounded-2xl border border-slate-300 px-3 py-3 font-mono text-xs"
                value={configForm.assinatura_html}
                onChange={(event) => setField('assinatura_html', event.target.value)}
                disabled={!canEdit}
              />
            </label>

            <label className="mt-5 block space-y-2 text-sm text-slate-700">
              <span>Template HTML</span>
              <textarea
                className="min-h-[360px] w-full rounded-2xl border border-slate-300 px-3 py-3 font-mono text-xs"
                value={configForm.template_html}
                onChange={(event) => setField('template_html', event.target.value)}
                disabled={!canEdit}
              />
            </label>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-slate-900">Pré-visualização</h4>
            <p className="mt-1 text-sm text-slate-500">
              Exemplo com dados fictícios preenchidos automaticamente.
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <iframe
                title="Pré-visualização do template de convocação"
                className="h-[520px] w-full bg-white"
                srcDoc={preview}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
