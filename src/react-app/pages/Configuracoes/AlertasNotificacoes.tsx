import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, RefreshCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/react-app/components/UI/Button';
import { fetchWithAuth } from '@/react-app/config/api';
import { usePermissions } from '@/react-app/hooks/usePermissions';

type Frequency = 'ONCE' | 'DAILY' | 'EVERY_N_DAYS';

type QualificationAlert = {
  id: number;
  codigo: string;
  ativo: number;
  dias_antes: number;
  assunto_template: string;
  template: string;
  frequencia: Frequency;
  intervalo_dias: number | null;
  origem: 'empresa' | 'padrao';
};

type ModuleAlertSettings = {
  lms_completion: {
    enabled: boolean;
    thresholds: number[];
    title_template: string;
    message_template: string;
  };
  simulator_upcoming: { enabled: boolean; days_before: number };
  simulator_session_email: {
    enabled: boolean;
    created: boolean;
    updated: boolean;
    canceled: boolean;
    created_subject_template: string;
    updated_subject_template: string;
    canceled_subject_template: string;
    created_message_template: string;
    updated_message_template: string;
    canceled_message_template: string;
  };
  frms_checkin_reminder: { enabled: boolean; title_template: string; message_template: string };
  sgso_barriers: {
    enabled: boolean;
    stale_hours: number;
    repeat_hours: number;
    title_template: string;
    message_template: string;
  };
  weekly_qualifications: {
    enabled: boolean;
    weekday_utc: number;
    horizon_days: number;
    critical_days: number;
    alert_days: number;
    title_template: string;
    message_template: string;
  };
  licenses: {
    enabled: boolean;
    thresholds: number[];
    expired_frequency: 'DAILY' | 'EVERY_N_DAYS';
    expired_interval_days: number;
    subject_template: string;
    message_template: string;
    expired_subject_template: string;
    expired_message_template: string;
  };
};

type SgsoSla = { fase: string; horas_prazo: number; horas_alerta_previa: number; ativo: number };
type SigvoosConfig = { notificar_falha_email?: string | null };
type ConvocationConfig = {
  sender_name?: string | null;
  reply_to?: string | null;
  assunto_padrao: string;
  assinatura_html: string;
  template_html: string;
  batch_size: number;
  batch_interval_ms: number;
};
type FrmsNotificationRole = {
  id: string;
  cargo: string;
  nivel_minimo: 'AVISO' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';
  ativo: number;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: string };

async function readData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(url, init);
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Falha HTTP ${response.status}`);
  }
  return payload.data as T;
}

function parseNumberList(value: string, allowNegative = false): number[] {
  const numbers = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && (allowNegative || item >= 0));
  return [...new Set(numbers)].sort((a, b) => b - a);
}

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const textareaClass = `${fieldClass} min-h-24 font-mono text-xs`;

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export default function AlertasNotificacoes() {
  const { isAdmin } = usePermissions();
  const canEdit = isAdmin;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [qualifications, setQualifications] = useState<QualificationAlert[]>([]);
  const [modules, setModules] = useState<ModuleAlertSettings | null>(null);
  const [sgsoSlas, setSgsoSlas] = useState<SgsoSla[]>([]);
  const [sigvoosFailureEmail, setSigvoosFailureEmail] = useState('');
  const [convocation, setConvocation] = useState<ConvocationConfig | null>(null);
  const [frmsNotificationRoles, setFrmsNotificationRoles] = useState<FrmsNotificationRole[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        qualificationData,
        moduleData,
        slaData,
        sigvoosData,
        convocationData,
        frmsRoleData,
      ] = await Promise.all([
        readData<QualificationAlert[]>('/api/notificacoes/configuracoes-qualificacoes'),
        readData<ModuleAlertSettings>('/api/notificacoes/configuracoes-modulos'),
        readData<SgsoSla[]>('/api/notificacoes/configuracoes-sgso-sla'),
        readData<SigvoosConfig>('/api/integracoes/sigvoos/config'),
        readData<ConvocationConfig>('/api/notificacoes/convocacoes/config'),
        readData<FrmsNotificationRole[]>('/api/frms/configuracoes/notificacoes'),
      ]);
      setQualifications(qualificationData || []);
      setModules(moduleData);
      setSgsoSlas(slaData || []);
      setSigvoosFailureEmail(String(sigvoosData?.notificar_falha_email || ''));
      setConvocation(convocationData);
      setFrmsNotificationRoles(frmsRoleData || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveQualification(row: QualificationAlert) {
    setSaving(`qualification:${row.codigo}`);
    try {
      const updated = await readData<QualificationAlert>(
        `/api/notificacoes/configuracoes-qualificacoes/${encodeURIComponent(row.codigo)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ativo: Boolean(row.ativo),
            dias_antes: row.dias_antes,
            assunto_template: row.assunto_template,
            template: row.template,
            frequencia: row.frequencia,
            intervalo_dias: row.intervalo_dias,
          }),
        },
      );
      setQualifications((current) =>
        current.map((item) => (item.codigo === row.codigo ? updated : item)),
      );
      toast.success('Alerta de qualificação salvo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar alerta');
    } finally {
      setSaving(null);
    }
  }

  async function resetQualification(codigo: string) {
    setSaving(`qualification:${codigo}`);
    try {
      await readData<unknown>(
        `/api/notificacoes/configuracoes-qualificacoes/${encodeURIComponent(codigo)}`,
        { method: 'DELETE' },
      );
      await load();
      toast.success('Configuração padrão restaurada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao restaurar padrão');
    } finally {
      setSaving(null);
    }
  }

  async function saveModules() {
    if (!modules) return;
    setSaving('modules');
    try {
      const updated = await readData<ModuleAlertSettings>(
        '/api/notificacoes/configuracoes-modulos',
        {
          method: 'PUT',
          body: JSON.stringify(modules),
        },
      );
      setModules(updated);
      toast.success('Alertas dos módulos atualizados.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar módulos');
    } finally {
      setSaving(null);
    }
  }


  async function saveSgso() {
    setSaving('sgso');
    try {
      const updated = await readData<SgsoSla[]>('/api/notificacoes/configuracoes-sgso-sla', {
        method: 'PUT',
        body: JSON.stringify({
          rows: sgsoSlas.map((row) => ({ ...row, ativo: Boolean(row.ativo) })),
        }),
      });
      setSgsoSlas(updated);
      toast.success('SLAs do SGSO atualizados.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar SLAs');
    } finally {
      setSaving(null);
    }
  }

  async function saveConvocation() {
    if (!convocation) return;
    setSaving('convocation');
    try {
      const updated = await readData<ConvocationConfig>('/api/notificacoes/convocacoes/config', {
        method: 'PUT',
        body: JSON.stringify({
          sender_name: convocation.sender_name || null,
          reply_to: convocation.reply_to || null,
          assunto_padrao: convocation.assunto_padrao,
          assinatura_html: convocation.assinatura_html,
          template_html: convocation.template_html,
          batch_size: convocation.batch_size,
          batch_interval_ms: convocation.batch_interval_ms,
        }),
      });
      setConvocation((current) => ({ ...(current || updated), ...updated }));
      toast.success('Configuração de convocações atualizada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar convocações');
    } finally {
      setSaving(null);
    }
  }

  async function saveSigvoos() {
    setSaving('sigvoos');
    try {
      const updated = await readData<SigvoosConfig>('/api/integracoes/sigvoos/config', {
        method: 'PUT',
        body: JSON.stringify({ notificar_falha_email: sigvoosFailureEmail.trim() || null }),
      });
      setSigvoosFailureEmail(String(updated?.notificar_falha_email || ''));
      toast.success('Destino de falhas SIGVOOS atualizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar SIGVOOS');
    } finally {
      setSaving(null);
    }
  }

  if (loading || !modules) {
    return <div className="min-h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
        <div className="flex gap-3">
          <Bell className="mt-0.5 h-5 w-5 text-blue-700 dark:text-blue-300" />
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              Alertas e notificações
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Central de réguas, prazos e textos automáticos. Bloqueios de segurança operacional
              continuam fail-closed e não são desligáveis por esta tela.
            </p>
            {!canEdit ? (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Somente administrador pode alterar estas configurações.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <Card
        title="Qualificações"
        description="Régua única de treinamento. Funcionário recebe e-mail + WhatsApp em 30/15/7 dias e e-mail após o vencimento. Gestores recebem somente CHECK do próprio setor por e-mail em 45/30/15/7 dias. Alterar 30/15/7 sincroniza e-mail e WhatsApp no mesmo estágio."
      >
        <div className="space-y-4">
          {qualifications.map((row, index) => (
            <div
              key={row.codigo}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {row.codigo.replace('QUALIFICACAO_', '').replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-slate-500">
                    Origem:{' '}
                    {row.origem === 'empresa' ? 'configuração da empresa' : 'padrão do sistema'}
                  </div>
                </div>
                <Toggle
                  checked={Boolean(row.ativo)}
                  disabled={!canEdit}
                  label="Ativo"
                  onChange={(value) =>
                    setQualifications((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, ativo: value ? 1 : 0 } : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {row.codigo !== 'QUALIFICACAO_VENCIDA' ? (
                  <label className="text-xs font-medium text-slate-600">
                    Dias antes
                    <input
                      className={fieldClass}
                      type="number"
                      min={0}
                      max={365}
                      disabled={!canEdit}
                      value={row.dias_antes}
                      onChange={(e) =>
                        setQualifications((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, dias_antes: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ) : null}
                <label className="text-xs font-medium text-slate-600">
                  Frequência
                  <select
                    className={fieldClass}
                    disabled={!canEdit}
                    value={row.frequencia || 'ONCE'}
                    onChange={(e) =>
                      setQualifications((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, frequencia: e.target.value as Frequency }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="ONCE">Uma vez por estágio</option>
                    <option value="DAILY">Diariamente</option>
                    <option value="EVERY_N_DAYS">A cada N dias</option>
                  </select>
                </label>
                {row.frequencia === 'EVERY_N_DAYS' ? (
                  <label className="text-xs font-medium text-slate-600">
                    Intervalo
                    <input
                      className={fieldClass}
                      type="number"
                      min={1}
                      max={365}
                      disabled={!canEdit}
                      value={row.intervalo_dias || 1}
                      onChange={(e) =>
                        setQualifications((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, intervalo_dias: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  Assunto
                  <input
                    className={fieldClass}
                    disabled={!canEdit}
                    value={row.assunto_template || ''}
                    onChange={(e) =>
                      setQualifications((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, assunto_template: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Mensagem
                  <textarea
                    className={textareaClass}
                    disabled={!canEdit}
                    value={row.template || ''}
                    onChange={(e) =>
                      setQualifications((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, template: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Variáveis: {'{{funcionario}}'}, {'{{qualificacao}}'}, {'{{dias}}'},{' '}
                {'{{data_vencimento}}'}, {'{{categoria}}'}, {'{{dias_vencida}}'}.
              </p>
              {canEdit ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    isLoading={saving === `qualification:${row.codigo}`}
                    leftIcon={<Save className="h-4 w-4" />}
                    onClick={() => void saveQualification(row)}
                  >
                    Salvar
                  </Button>
                  {row.origem === 'empresa' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<RefreshCcw className="h-4 w-4" />}
                      onClick={() => void resetQualification(row.codigo)}
                    >
                      Restaurar padrão
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Régua única de treinamentos"
        description="Compliance e renovação EAD não mantêm mais réguas automáticas paralelas."
      >
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          <p>
            Todos os alertas automáticos de treinamento usam exclusivamente os estágios de
            qualificações acima e são processados diariamente às 05:00 (horário de Brasília).
          </p>
          <p className="mt-2">
            A renovação EAD pode criar ou reabrir a matrícula em segundo plano, sem enviar mensagem
            própria. O módulo de Compliance continua disponível para acompanhamento e cobranças
            manuais, sem uma segunda régua automática de comunicação.
          </p>
        </div>
      </Card>

      <Card
        title="Alertas dos demais módulos"
        description="Defaults atuais foram preservados; alterações abaixo passam a valer sem novo deploy."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex justify-between gap-2">
              <strong className="text-sm">Licenças</strong>
              <Toggle
                checked={modules.licenses.enabled}
                disabled={!canEdit}
                label="Ativo"
                onChange={(value) =>
                  setModules({ ...modules, licenses: { ...modules.licenses, enabled: value } })
                }
              />
            </div>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Marcos antes do vencimento
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={modules.licenses.thresholds.join(', ')}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    licenses: { ...modules.licenses, thresholds: parseNumberList(e.target.value) },
                  })
                }
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-600">
                Vencida
                <select
                  className={fieldClass}
                  disabled={!canEdit}
                  value={modules.licenses.expired_frequency}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      licenses: {
                        ...modules.licenses,
                        expired_frequency: e.target.value as 'DAILY' | 'EVERY_N_DAYS',
                      },
                    })
                  }
                >
                  <option value="DAILY">Diariamente</option>
                  <option value="EVERY_N_DAYS">A cada N dias</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Intervalo
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={365}
                  disabled={!canEdit || modules.licenses.expired_frequency === 'DAILY'}
                  value={modules.licenses.expired_interval_days}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      licenses: {
                        ...modules.licenses,
                        expired_interval_days: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Assunto antes do vencimento
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={modules.licenses.subject_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    licenses: { ...modules.licenses, subject_template: e.target.value },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Mensagem antes do vencimento
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={modules.licenses.message_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    licenses: { ...modules.licenses, message_template: e.target.value },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Assunto vencida
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={modules.licenses.expired_subject_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    licenses: { ...modules.licenses, expired_subject_template: e.target.value },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Mensagem vencida
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={modules.licenses.expired_message_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    licenses: { ...modules.licenses, expired_message_template: e.target.value },
                  })
                }
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex justify-between gap-2">
              <strong className="text-sm">Simuladores</strong>
              <Toggle
                checked={modules.simulator_session_email.enabled}
                disabled={!canEdit}
                label="E-mails ativos"
                onChange={(value) =>
                  setModules({
                    ...modules,
                    simulator_session_email: { ...modules.simulator_session_email, enabled: value },
                  })
                }
              />
            </div>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Avisar sessão próxima com antecedência de
              <input
                className={fieldClass}
                type="number"
                min={0}
                max={365}
                disabled={!canEdit}
                value={modules.simulator_upcoming.days_before}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    simulator_upcoming: {
                      ...modules.simulator_upcoming,
                      days_before: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-4">
              <Toggle
                checked={modules.simulator_session_email.created}
                disabled={!canEdit}
                label="Criação"
                onChange={(value) =>
                  setModules({
                    ...modules,
                    simulator_session_email: { ...modules.simulator_session_email, created: value },
                  })
                }
              />
              <Toggle
                checked={modules.simulator_session_email.updated}
                disabled={!canEdit}
                label="Alteração"
                onChange={(value) =>
                  setModules({
                    ...modules,
                    simulator_session_email: { ...modules.simulator_session_email, updated: value },
                  })
                }
              />
              <Toggle
                checked={modules.simulator_session_email.canceled}
                disabled={!canEdit}
                label="Cancelamento"
                onChange={(value) =>
                  setModules({
                    ...modules,
                    simulator_session_email: {
                      ...modules.simulator_session_email,
                      canceled: value,
                    },
                  })
                }
              />
            </div>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Assunto — criação
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={modules.simulator_session_email.created_subject_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    simulator_session_email: {
                      ...modules.simulator_session_email,
                      created_subject_template: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Mensagem — criação
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={modules.simulator_session_email.created_message_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    simulator_session_email: {
                      ...modules.simulator_session_email,
                      created_message_template: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Assunto — alteração
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={modules.simulator_session_email.updated_subject_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    simulator_session_email: {
                      ...modules.simulator_session_email,
                      updated_subject_template: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Mensagem — alteração
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={modules.simulator_session_email.updated_message_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    simulator_session_email: {
                      ...modules.simulator_session_email,
                      updated_message_template: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Assunto — cancelamento
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={modules.simulator_session_email.canceled_subject_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    simulator_session_email: {
                      ...modules.simulator_session_email,
                      canceled_subject_template: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Mensagem — cancelamento
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={modules.simulator_session_email.canceled_message_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    simulator_session_email: {
                      ...modules.simulator_session_email,
                      canceled_message_template: e.target.value,
                    },
                  })
                }
              />
            </label>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex justify-between gap-2">
                <strong className="text-sm">FRMS — check-in de fadiga</strong>
                <Toggle
                  checked={modules.frms_checkin_reminder.enabled}
                  disabled={!canEdit}
                  label="Lembrete ativo"
                  onChange={(value) =>
                    setModules({
                      ...modules,
                      frms_checkin_reminder: { ...modules.frms_checkin_reminder, enabled: value },
                    })
                  }
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                O bloqueio/avaliação de aptidão FRMS continua obrigatório; este controle desliga
                apenas o lembrete de comunicação.
              </p>
              <label className="mt-2 block text-xs font-medium text-slate-600">
                Título
                <input
                  className={fieldClass}
                  disabled={!canEdit}
                  value={modules.frms_checkin_reminder.title_template}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      frms_checkin_reminder: {
                        ...modules.frms_checkin_reminder,
                        title_template: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="mt-2 block text-xs font-medium text-slate-600">
                Mensagem
                <textarea
                  className={textareaClass}
                  disabled={!canEdit}
                  value={modules.frms_checkin_reminder.message_template}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      frms_checkin_reminder: {
                        ...modules.frms_checkin_reminder,
                        message_template: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex justify-between gap-2">
                <strong className="text-sm">SGSO — barreiras degradadas</strong>
                <Toggle
                  checked={modules.sgso_barriers.enabled}
                  disabled={!canEdit}
                  label="Comunicação ativa"
                  onChange={(value) =>
                    setModules({
                      ...modules,
                      sgso_barriers: { ...modules.sgso_barriers, enabled: value },
                    })
                  }
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-slate-600">
                  Sem atualização há
                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    disabled={!canEdit}
                    value={modules.sgso_barriers.stale_hours}
                    onChange={(e) =>
                      setModules({
                        ...modules,
                        sgso_barriers: {
                          ...modules.sgso_barriers,
                          stale_hours: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Repetir após
                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    disabled={!canEdit}
                    value={modules.sgso_barriers.repeat_hours}
                    onChange={(e) =>
                      setModules({
                        ...modules,
                        sgso_barriers: {
                          ...modules.sgso_barriers,
                          repeat_hours: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
              <label className="mt-2 block text-xs font-medium text-slate-600">
                Título
                <input
                  className={fieldClass}
                  disabled={!canEdit}
                  value={modules.sgso_barriers.title_template}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      sgso_barriers: { ...modules.sgso_barriers, title_template: e.target.value },
                    })
                  }
                />
              </label>
              <label className="mt-2 block text-xs font-medium text-slate-600">
                Mensagem
                <textarea
                  className={textareaClass}
                  disabled={!canEdit}
                  value={modules.sgso_barriers.message_template}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      sgso_barriers: { ...modules.sgso_barriers, message_template: e.target.value },
                    })
                  }
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex justify-between gap-2">
              <strong className="text-sm">Resumo semanal de qualificações</strong>
              <Toggle
                checked={modules.weekly_qualifications.enabled}
                disabled={!canEdit}
                label="Ativo"
                onChange={(value) =>
                  setModules({
                    ...modules,
                    weekly_qualifications: { ...modules.weekly_qualifications, enabled: value },
                  })
                }
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                Dia UTC (0–6)
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  max={6}
                  disabled={!canEdit}
                  value={modules.weekly_qualifications.weekday_utc}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      weekly_qualifications: {
                        ...modules.weekly_qualifications,
                        weekday_utc: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Horizonte
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={365}
                  disabled={!canEdit}
                  value={modules.weekly_qualifications.horizon_days}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      weekly_qualifications: {
                        ...modules.weekly_qualifications,
                        horizon_days: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Crítico até
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={365}
                  disabled={!canEdit}
                  value={modules.weekly_qualifications.critical_days}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      weekly_qualifications: {
                        ...modules.weekly_qualifications,
                        critical_days: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Alerta até
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={365}
                  disabled={!canEdit}
                  value={modules.weekly_qualifications.alert_days}
                  onChange={(e) =>
                    setModules({
                      ...modules,
                      weekly_qualifications: {
                        ...modules.weekly_qualifications,
                        alert_days: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Título
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={modules.weekly_qualifications.title_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    weekly_qualifications: {
                      ...modules.weekly_qualifications,
                      title_template: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Mensagem
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={modules.weekly_qualifications.message_template}
                onChange={(e) =>
                  setModules({
                    ...modules,
                    weekly_qualifications: {
                      ...modules.weekly_qualifications,
                      message_template: e.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
        </div>
        {canEdit ? (
          <Button
            className="mt-4"
            isLoading={saving === 'modules'}
            leftIcon={<Save className="h-4 w-4" />}
            onClick={() => void saveModules()}
          >
            Salvar módulos
          </Button>
        ) : null}
      </Card>

      <Card
        title="SGSO — SLAs"
        description="Prazo e pré-alerta por fase. O registro de violação de SLA continua obrigatório; desativar a comunicação não apaga nem ignora violações."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {sgsoSlas.map((row, index) => (
            <div
              key={row.fase}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex items-center justify-between">
                <strong className="text-sm">{row.fase}</strong>
                <Toggle
                  checked={Boolean(row.ativo)}
                  disabled={!canEdit}
                  label="Ativo"
                  onChange={(value) =>
                    setSgsoSlas((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, ativo: value ? 1 : 0 } : item,
                      ),
                    )
                  }
                />
              </div>
              <label className="mt-2 block text-xs font-medium text-slate-600">
                Prazo (horas)
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={8760}
                  disabled={!canEdit}
                  value={row.horas_prazo}
                  onChange={(e) =>
                    setSgsoSlas((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, horas_prazo: Number(e.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label className="mt-2 block text-xs font-medium text-slate-600">
                Pré-alertar com antecedência (horas)
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  max={row.horas_prazo - 1}
                  disabled={!canEdit}
                  value={row.horas_alerta_previa}
                  onChange={(e) =>
                    setSgsoSlas((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, horas_alerta_previa: Number(e.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
        {canEdit ? (
          <Button
            className="mt-3"
            size="sm"
            isLoading={saving === 'sgso'}
            leftIcon={<Save className="h-4 w-4" />}
            onClick={() => void saveSgso()}
          >
            Salvar SLAs
          </Button>
        ) : null}
      </Card>

      {convocation ? (
        <Card
          title="Convocações de treinamentos"
          description="Configuração canônica já existente para assunto, corpo, assinatura e envio em lote das convocações."
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              Nome do remetente
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={convocation.sender_name || ''}
                onChange={(e) => setConvocation({ ...convocation, sender_name: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Responder para
              <input
                className={fieldClass}
                type="email"
                disabled={!canEdit}
                value={convocation.reply_to || ''}
                onChange={(e) => setConvocation({ ...convocation, reply_to: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 lg:col-span-2">
              Assunto padrão
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={convocation.assunto_padrao}
                onChange={(e) => setConvocation({ ...convocation, assunto_padrao: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Template HTML
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={convocation.template_html}
                onChange={(e) => setConvocation({ ...convocation, template_html: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Assinatura HTML
              <textarea
                className={textareaClass}
                disabled={!canEdit}
                value={convocation.assinatura_html}
                onChange={(e) =>
                  setConvocation({ ...convocation, assinatura_html: e.target.value })
                }
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Tamanho do lote
              <input
                className={fieldClass}
                type="number"
                min={1}
                disabled={!canEdit}
                value={convocation.batch_size}
                onChange={(e) =>
                  setConvocation({ ...convocation, batch_size: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Intervalo entre lotes (ms)
              <input
                className={fieldClass}
                type="number"
                min={0}
                disabled={!canEdit}
                value={convocation.batch_interval_ms}
                onChange={(e) =>
                  setConvocation({ ...convocation, batch_interval_ms: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {canEdit ? (
            <Button
              className="mt-3"
              size="sm"
              isLoading={saving === 'convocation'}
              leftIcon={<Save className="h-4 w-4" />}
              onClick={() => void saveConvocation()}
            >
              Salvar convocações
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Card
        title="FRMS — destinatários por nível"
        description="Política global protegida: define o nível mínimo de alerta recebido por cada cargo. A central mostra a fonte canônica sem criar uma configuração paralela por empresa."
      >
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {frmsNotificationRoles.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {row.cargo.replace(/_/g, ' ')}
              </div>
              <div className="mt-1 text-xs text-slate-500">Nível mínimo: {row.nivel_minimo}</div>
              <div className="mt-1 text-xs text-slate-500">{row.ativo ? 'Ativo' : 'Inativo'}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Alterações desta política exigem administrador da plataforma porque a tabela atual é
          global. O lembrete diário de check-in FRMS, que é comunicação tenant-scoped, é
          configurável acima.
        </p>
      </Card>

      <Card title="SIGVOOS" description="Destino para falhas automáticas de sincronização.">
        <div className="max-w-xl">
          <label className="text-xs font-medium text-slate-600">
            E-mail para falha de integração
            <input
              className={fieldClass}
              type="email"
              disabled={!canEdit}
              value={sigvoosFailureEmail}
              onChange={(e) => setSigvoosFailureEmail(e.target.value)}
              placeholder="operacoes@empresa.com"
            />
          </label>
          {canEdit ? (
            <Button
              className="mt-3"
              size="sm"
              isLoading={saving === 'sigvoos'}
              leftIcon={<Save className="h-4 w-4" />}
              onClick={() => void saveSigvoos()}
            >
              Salvar SIGVOOS
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>
            Alertas que representam bloqueio ou validação de segurança — por exemplo aptidão FRMS,
            validações de RDV e controles de tenant/RBAC — não são convertidos em opções
            desligáveis.
          </p>
        </div>
      </div>
    </div>
  );
}
