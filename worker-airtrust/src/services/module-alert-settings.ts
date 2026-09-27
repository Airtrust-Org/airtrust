export type ModuleAlertSettings = {
  lms_completion: {
    enabled: boolean;
    thresholds: number[];
    title_template: string;
    message_template: string;
  };
  simulator_upcoming: {
    enabled: boolean;
    days_before: number;
  };
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
  frms_checkin_reminder: {
    enabled: boolean;
    title_template: string;
    message_template: string;
  };
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

export const DEFAULT_MODULE_ALERT_SETTINGS: ModuleAlertSettings = {
  lms_completion: {
    enabled: true,
    thresholds: [7, 1],
    title_template: 'Prazo do treinamento: {{treinamento}} — {{status_prazo}}',
    message_template:
      'Conclua o treinamento {{treinamento}} até {{data_limite}}. {{status_prazo}}.',
  },
  simulator_upcoming: { enabled: true, days_before: 15 },
  simulator_session_email: {
    enabled: true,
    created: true,
    updated: true,
    canceled: true,
    created_subject_template: 'Sessão de simulador agendada - {{data}} - {{sessao}}',
    updated_subject_template: 'Sessão de simulador atualizada - {{data}} - {{sessao}}',
    canceled_subject_template: 'Sessão de simulador cancelada - {{data}} - {{sessao}}',
    created_message_template:
      'Nova designação de sessão de simulador\n\nOlá, {{destinatario}}.\nVocê está designado(a) para a sessão abaixo:\nData: {{data}}\nHorário: {{horario}}\nSimulador/equipamento: {{equipamento}}\nSessão/tema: {{sessao}}\nSua função: {{funcao}}\nEquipe: {{equipe}}\nStatus: {{status}}\n{{observacoes}}\n{{acesso}}',
    updated_message_template:
      'Atualização de sessão de simulador\n\nOlá, {{destinatario}}.\nVocê está designado(a) para a sessão abaixo:\nData: {{data}}\nHorário: {{horario}}\nSimulador/equipamento: {{equipamento}}\nSessão/tema: {{sessao}}\nSua função: {{funcao}}\nEquipe: {{equipe}}\nStatus: {{status}}\n{{observacoes}}\n{{acesso}}',
    canceled_message_template:
      'Cancelamento de sessão de simulador\n\nOlá, {{destinatario}}.\nA sessão abaixo foi cancelada:\nData: {{data}}\nHorário: {{horario}}\nSimulador/equipamento: {{equipamento}}\nSessão/tema: {{sessao}}\nSua função: {{funcao}}\nEquipe: {{equipe}}\nStatus: {{status}}\n{{observacoes}}',
  },
  frms_checkin_reminder: {
    enabled: true,
    title_template: 'Check-in de fadiga pendente',
    message_template: '{{total}} tripulante(s) sem check-in de fadiga em {{data}}. {{resumo}}',
  },
  sgso_barriers: {
    enabled: true,
    stale_hours: 48,
    repeat_hours: 24,
    title_template: 'Barreiras de segurança degradadas',
    message_template:
      '{{total}} barreira(s) DEGRADADA/INOPERANTE sem atualização há mais de {{stale_hours}}h. Verificação necessária.',
  },
  weekly_qualifications: {
    enabled: true,
    weekday_utc: 1,
    horizon_days: 90,
    critical_days: 30,
    alert_days: 60,
    title_template: 'Resumo semanal: qualificações expirando em até {{horizon_days}} dias',
    message_template:
      '{{total}} qualificações expiram nos próximos {{horizon_days}} dias ({{criticos}} críticas, {{alertas}} alertas, {{avisos}} avisos).\n\n{{linhas}}',
  },
  licenses: {
    enabled: true,
    thresholds: [45, 30, 15, 7],
    expired_frequency: 'DAILY',
    expired_interval_days: 1,
    subject_template: 'Alerta: licença {{licenca}} vence em {{dias}} dias',
    message_template:
      'A licença {{licenca}} de {{funcionario}} vence em {{dias}} dias, em {{data_vencimento}}. Providencie a renovação.',
    expired_subject_template:
      'URGENTE: licença {{licenca}} vencida há {{dias_vencida}} {{unidade_dias_vencida}}',
    expired_message_template:
      'A licença {{licenca}} de {{funcionario}} está vencida há {{dias_vencida}} {{unidade_dias_vencida}}. Data de vencimento: {{data_vencimento}}. Regularize imediatamente.',
  },
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function intValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function textValue(value: unknown, fallback: string, max = 5000): string {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : fallback;
}

function thresholdsValue(value: unknown, fallback: number[], min = 0, max = 365): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = [
    ...new Set(
      value.map(Number).filter((item) => Number.isInteger(item) && item >= min && item <= max),
    ),
  ].sort((a, b) => b - a);
  return normalized.length ? normalized : [...fallback];
}

export function normalizeModuleAlertSettings(value: unknown): ModuleAlertSettings {
  const root = objectValue(value);
  const lms = objectValue(root.lms_completion);
  const simulatorUpcoming = objectValue(root.simulator_upcoming);
  const simulatorEmail = objectValue(root.simulator_session_email);
  const frms = objectValue(root.frms_checkin_reminder);
  const sgso = objectValue(root.sgso_barriers);
  const weekly = objectValue(root.weekly_qualifications);
  const licenses = objectValue(root.licenses);
  const d = DEFAULT_MODULE_ALERT_SETTINGS;

  return {
    lms_completion: {
      enabled: boolValue(lms.enabled, d.lms_completion.enabled),
      thresholds: thresholdsValue(lms.thresholds, d.lms_completion.thresholds, 0, 365),
      title_template: textValue(lms.title_template, d.lms_completion.title_template, 300),
      message_template: textValue(lms.message_template, d.lms_completion.message_template),
    },
    simulator_upcoming: {
      enabled: boolValue(simulatorUpcoming.enabled, d.simulator_upcoming.enabled),
      days_before: intValue(
        simulatorUpcoming.days_before,
        d.simulator_upcoming.days_before,
        0,
        365,
      ),
    },
    simulator_session_email: {
      enabled: boolValue(simulatorEmail.enabled, d.simulator_session_email.enabled),
      created: boolValue(simulatorEmail.created, d.simulator_session_email.created),
      updated: boolValue(simulatorEmail.updated, d.simulator_session_email.updated),
      canceled: boolValue(simulatorEmail.canceled, d.simulator_session_email.canceled),
      created_subject_template: textValue(
        simulatorEmail.created_subject_template,
        d.simulator_session_email.created_subject_template,
        300,
      ),
      updated_subject_template: textValue(
        simulatorEmail.updated_subject_template,
        d.simulator_session_email.updated_subject_template,
        300,
      ),
      canceled_subject_template: textValue(
        simulatorEmail.canceled_subject_template,
        d.simulator_session_email.canceled_subject_template,
        300,
      ),
      created_message_template: textValue(
        simulatorEmail.created_message_template,
        d.simulator_session_email.created_message_template,
      ),
      updated_message_template: textValue(
        simulatorEmail.updated_message_template,
        d.simulator_session_email.updated_message_template,
      ),
      canceled_message_template: textValue(
        simulatorEmail.canceled_message_template,
        d.simulator_session_email.canceled_message_template,
      ),
    },
    frms_checkin_reminder: {
      enabled: boolValue(frms.enabled, d.frms_checkin_reminder.enabled),
      title_template: textValue(frms.title_template, d.frms_checkin_reminder.title_template, 300),
      message_template: textValue(frms.message_template, d.frms_checkin_reminder.message_template),
    },
    sgso_barriers: {
      enabled: boolValue(sgso.enabled, d.sgso_barriers.enabled),
      stale_hours: intValue(sgso.stale_hours, d.sgso_barriers.stale_hours, 1, 8760),
      repeat_hours: intValue(sgso.repeat_hours, d.sgso_barriers.repeat_hours, 1, 720),
      title_template: textValue(sgso.title_template, d.sgso_barriers.title_template, 300),
      message_template: textValue(sgso.message_template, d.sgso_barriers.message_template),
    },
    weekly_qualifications: {
      enabled: boolValue(weekly.enabled, d.weekly_qualifications.enabled),
      weekday_utc: intValue(weekly.weekday_utc, d.weekly_qualifications.weekday_utc, 0, 6),
      horizon_days: intValue(weekly.horizon_days, d.weekly_qualifications.horizon_days, 1, 365),
      critical_days: intValue(weekly.critical_days, d.weekly_qualifications.critical_days, 1, 365),
      alert_days: intValue(weekly.alert_days, d.weekly_qualifications.alert_days, 1, 365),
      title_template: textValue(weekly.title_template, d.weekly_qualifications.title_template, 300),
      message_template: textValue(
        weekly.message_template,
        d.weekly_qualifications.message_template,
      ),
    },
    licenses: {
      enabled: boolValue(licenses.enabled, d.licenses.enabled),
      thresholds: thresholdsValue(licenses.thresholds, d.licenses.thresholds, 0, 365),
      expired_frequency:
        String(licenses.expired_frequency || '').toUpperCase() === 'EVERY_N_DAYS'
          ? 'EVERY_N_DAYS'
          : 'DAILY',
      expired_interval_days: intValue(
        licenses.expired_interval_days,
        d.licenses.expired_interval_days,
        1,
        365,
      ),
      subject_template: textValue(licenses.subject_template, d.licenses.subject_template, 300),
      message_template: textValue(licenses.message_template, d.licenses.message_template),
      expired_subject_template: textValue(
        licenses.expired_subject_template,
        d.licenses.expired_subject_template,
        300,
      ),
      expired_message_template: textValue(
        licenses.expired_message_template,
        d.licenses.expired_message_template,
      ),
    },
  };
}

async function readTheme(db: D1Database, empresaId: number): Promise<Record<string, unknown>> {
  const row = await db
    .prepare('SELECT cores_tema FROM empresas_config WHERE empresa_id = ? LIMIT 1')
    .bind(empresaId)
    .first<{ cores_tema: string | null }>();
  if (!row?.cores_tema) return {};
  try {
    return objectValue(JSON.parse(row.cores_tema));
  } catch {
    return {};
  }
}

export async function getModuleAlertSettings(
  db: D1Database,
  empresaId: number,
): Promise<ModuleAlertSettings> {
  const theme = await readTheme(db, empresaId);
  const system = objectValue(theme.system_settings);
  return normalizeModuleAlertSettings(system.moduleAlertSettings);
}

export async function saveModuleAlertSettings(
  db: D1Database,
  empresaId: number,
  value: unknown,
): Promise<ModuleAlertSettings> {
  const normalized = normalizeModuleAlertSettings(value);
  const theme = await readTheme(db, empresaId);
  const system = objectValue(theme.system_settings);
  const next = {
    ...theme,
    system_settings: { ...system, moduleAlertSettings: normalized },
  };
  await db
    .prepare(
      `INSERT INTO empresas_config (empresa_id, cores_tema, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(empresa_id) DO UPDATE SET cores_tema = excluded.cores_tema, updated_at = datetime('now')`,
    )
    .bind(empresaId, JSON.stringify(next))
    .run();
  return normalized;
}

export function renderAlertTemplate(template: string, variables: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''));
  }
  return result;
}
