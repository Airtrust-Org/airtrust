import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Env } from '../types';
import type { TrainingComplianceSnapshot } from '../routes/compliance-treinamentos';
import { sendEmailDetailed } from '../lib/email';
import { getSetorGestoresBySetor } from './setores-gestores';

export type TrainingComplianceStatus =
  'CONFORME' | 'VENCENDO' | 'VENCIDO' | 'NAO_REALIZADO' | 'EM_ANDAMENTO';

export type TrainingComplianceReportFilters = {
  setor_id?: number | null;
  funcao_id?: number | null;
  funcionario_id?: number | null;
  qualificacao_tipo_id?: number | null;
  statuses?: TrainingComplianceStatus[];
  critico?: boolean;
  ate_dias?: number | null;
};

export type TrainingComplianceReportRow = {
  funcionario_id: number;
  funcionario_nome: string;
  matricula: string | null;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string | null;
  qualificacao_tipo_codigo: string | null;
  status_compliance: TrainingComplianceStatus;
  data_validade: string | null;
  dias_para_vencer: number | null;
  ultima_data: string | null;
  critico_operacional: boolean;
  referencia_normativa: string | null;
};

export type ComplianceReportFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type ComplianceReportAutomationPolicy = {
  enabled: boolean;
  frequency: ComplianceReportFrequency;
  weekday: number;
  day_of_month: number;
  time: string;
  timezone: string;
  sector_ids: number[];
  statuses: TrainingComplianceStatus[];
  critical_only: boolean;
  due_within_days: number | null;
};

export const DEFAULT_COMPLIANCE_REPORT_AUTOMATION: ComplianceReportAutomationPolicy = {
  enabled: false,
  frequency: 'WEEKLY',
  weekday: 1,
  day_of_month: 1,
  time: '08:00',
  timezone: 'America/Sao_Paulo',
  sector_ids: [],
  statuses: ['VENCIDO', 'NAO_REALIZADO', 'VENCENDO', 'EM_ANDAMENTO'],
  critical_only: false,
  due_within_days: null,
};

const ALLOWED_STATUSES = new Set<TrainingComplianceStatus>([
  'CONFORME',
  'VENCENDO',
  'VENCIDO',
  'NAO_REALIZADO',
  'EM_ANDAMENTO',
]);

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTimezone(value: unknown): string {
  const requested = String(value || DEFAULT_COMPLIANCE_REPORT_AUTOMATION.timezone).trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: requested }).format(new Date());
    return requested;
  } catch {
    return DEFAULT_COMPLIANCE_REPORT_AUTOMATION.timezone;
  }
}

function normalizeTime(value: unknown): string {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return DEFAULT_COMPLIANCE_REPORT_AUTOMATION.time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return DEFAULT_COMPLIANCE_REPORT_AUTOMATION.time;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeComplianceReportAutomationPolicy(
  value: unknown,
): ComplianceReportAutomationPolicy {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const frequency = String(input.frequency || '').toUpperCase();
  const statuses = Array.isArray(input.statuses)
    ? [...new Set(input.statuses.map((item) => String(item).toUpperCase()))].filter(
        (item): item is TrainingComplianceStatus =>
          ALLOWED_STATUSES.has(item as TrainingComplianceStatus),
      )
    : DEFAULT_COMPLIANCE_REPORT_AUTOMATION.statuses;
  const sectors = Array.isArray(input.sector_ids)
    ? [
        ...new Set(input.sector_ids.map(positiveInt).filter((id): id is number => id !== null)),
      ].slice(0, 200)
    : [];
  const dueRaw = input.due_within_days;
  const due = dueRaw === null || dueRaw === undefined || dueRaw === '' ? null : Number(dueRaw);
  const weekdayRaw = Number(input.weekday);
  return {
    enabled: input.enabled === true,
    frequency:
      frequency === 'DAILY' || frequency === 'MONTHLY' || frequency === 'WEEKLY'
        ? frequency
        : DEFAULT_COMPLIANCE_REPORT_AUTOMATION.frequency,
    weekday: Math.max(
      0,
      Math.min(
        6,
        Number.isInteger(weekdayRaw)
          ? weekdayRaw
          : DEFAULT_COMPLIANCE_REPORT_AUTOMATION.weekday,
      ),
    ),
    day_of_month: Math.max(1, Math.min(28, Number(input.day_of_month) || 1)),
    time: normalizeTime(input.time),
    timezone: normalizeTimezone(input.timezone),
    sector_ids: sectors,
    statuses: statuses.length ? statuses : DEFAULT_COMPLIANCE_REPORT_AUTOMATION.statuses,
    critical_only: input.critical_only === true,
    due_within_days: Number.isFinite(due) ? Math.max(-365, Math.min(365, Number(due))) : null,
  };
}

async function readThemeConfig(
  db: D1Database,
  empresaId: number,
): Promise<Record<string, unknown>> {
  const row = await db
    .prepare('SELECT cores_tema FROM empresas_config WHERE empresa_id = ? LIMIT 1')
    .bind(empresaId)
    .first<{ cores_tema: string | null }>();
  if (!row?.cores_tema) return {};
  try {
    const parsed = JSON.parse(row.cores_tema);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function getComplianceReportAutomationPolicy(
  db: D1Database,
  empresaId: number,
): Promise<ComplianceReportAutomationPolicy> {
  const config = await readThemeConfig(db, empresaId);
  const systemSettings =
    config.system_settings && typeof config.system_settings === 'object'
      ? (config.system_settings as Record<string, unknown>)
      : {};
  return normalizeComplianceReportAutomationPolicy(systemSettings.trainingComplianceReports);
}

export async function saveComplianceReportAutomationPolicy(
  db: D1Database,
  empresaId: number,
  value: unknown,
): Promise<ComplianceReportAutomationPolicy> {
  const normalized = normalizeComplianceReportAutomationPolicy(value);
  const config = await readThemeConfig(db, empresaId);
  const currentSystem =
    config.system_settings && typeof config.system_settings === 'object'
      ? (config.system_settings as Record<string, unknown>)
      : {};
  const next = {
    ...config,
    system_settings: {
      ...currentSystem,
      trainingComplianceReports: normalized,
    },
  };
  await db
    .prepare(
      `INSERT INTO empresas_config (empresa_id, cores_tema, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(empresa_id) DO UPDATE SET
         cores_tema = excluded.cores_tema,
         updated_at = datetime('now')`,
    )
    .bind(empresaId, JSON.stringify(next))
    .run();
  return normalized;
}

export function buildTrainingComplianceReportRows(
  snapshot: TrainingComplianceSnapshot,
  filters: TrainingComplianceReportFilters = {},
): TrainingComplianceReportRow[] {
  const statuses = new Set<TrainingComplianceStatus>(
    filters.statuses?.length
      ? filters.statuses.filter((item) => ALLOWED_STATUSES.has(item))
      : DEFAULT_COMPLIANCE_REPORT_AUTOMATION.statuses,
  );
  return snapshot.people
    .filter(
      (person) =>
        (!filters.setor_id || person.setor_id === filters.setor_id) &&
        (!filters.funcao_id || person.funcao_id === filters.funcao_id) &&
        (!filters.funcionario_id || person.id === filters.funcionario_id),
    )
    .flatMap((person) =>
      person.requisitos
        .filter((requirement) => requirement.obrigatoriedade === 'OBRIGATORIA')
        .filter((requirement) => statuses.has(requirement.status_compliance))
        .filter(
          (requirement) =>
            !filters.qualificacao_tipo_id ||
            requirement.qualificacao_tipo_id === filters.qualificacao_tipo_id,
        )
        .filter((requirement) => !filters.critico || requirement.critico_operacional)
        .filter((requirement) => {
          if (filters.ate_dias === null || filters.ate_dias === undefined) return true;
          if (requirement.dias_para_vencer == null) {
            return requirement.status_compliance === 'NAO_REALIZADO';
          }
          return requirement.dias_para_vencer <= filters.ate_dias;
        })
        .map((requirement) => ({
          funcionario_id: person.id,
          funcionario_nome: person.nome,
          matricula: person.matricula,
          setor_id: person.setor_id,
          setor_nome: person.setor_nome,
          funcao_id: person.funcao_id,
          funcao_nome: person.funcao_nome,
          qualificacao_tipo_id: requirement.qualificacao_tipo_id,
          qualificacao_tipo_nome: requirement.qualificacao_tipo_nome,
          qualificacao_tipo_codigo: requirement.qualificacao_tipo_codigo,
          status_compliance: requirement.status_compliance,
          data_validade: requirement.data_validade,
          dias_para_vencer: requirement.dias_para_vencer,
          ultima_data: requirement.ultima_data,
          critico_operacional: requirement.critico_operacional,
          referencia_normativa: requirement.referencia_normativa,
        })),
    )
    .sort((a, b) => {
      const person = a.funcionario_nome.localeCompare(b.funcionario_nome, 'pt-BR');
      if (person !== 0) return person;
      return String(a.qualificacao_tipo_nome || a.qualificacao_tipo_codigo || '').localeCompare(
        String(b.qualificacao_tipo_nome || b.qualificacao_tipo_codigo || ''),
        'pt-BR',
      );
    });
}

function statusLabel(row: TrainingComplianceReportRow): string {
  if (row.status_compliance === 'CONFORME') return 'Realizado';
  if (row.status_compliance === 'VENCENDO') {
    return row.dias_para_vencer == null ? 'Vencendo' : `Vence em ${row.dias_para_vencer} dia(s)`;
  }
  if (row.status_compliance === 'VENCIDO') {
    const days = Math.abs(row.dias_para_vencer || 0);
    return days ? `Vencido ha ${days} dia(s)` : 'Vencido';
  }
  if (row.status_compliance === 'EM_ANDAMENTO') return 'Em andamento';
  return 'Nunca realizou';
}

function dateBr(value: string | null): string {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/→/g, '->')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return ['-'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function drawCellLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  x: number,
  y: number,
  size: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color: rgb(0.12, 0.16, 0.23),
    });
  });
}

export async function generateTrainingComplianceReportPdf(params: {
  rows: TrainingComplianceReportRow[];
  empresaNome: string;
  setorNome: string;
  generatedAt?: Date;
}): Promise<{ bytes: Uint8Array; base64: string; filename: string }> {
  const generatedAt = params.generatedAt || new Date();
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [841.89, 595.28];
  const margin = 28;
  const columns = [145, 95, 90, 185, 115, 80];
  const headers = ['Funcionario', 'Setor', 'Funcao', 'Treinamento', 'Situacao', 'Vencimento'];
  const tableWidth = columns.reduce((sum, value) => sum + value, 0);
  const summary = {
    pessoas: new Set(params.rows.map((row) => row.funcionario_id)).size,
    requisitos: params.rows.length,
    conformes: params.rows.filter((row) => row.status_compliance === 'CONFORME').length,
    vencendo: params.rows.filter((row) => row.status_compliance === 'VENCENDO').length,
    vencidos: params.rows.filter((row) => row.status_compliance === 'VENCIDO').length,
    nunca: params.rows.filter((row) => row.status_compliance === 'NAO_REALIZADO').length,
    andamento: params.rows.filter((row) => row.status_compliance === 'EM_ANDAMENTO').length,
  };

  const addPage = (first: boolean) => {
    const page = doc.addPage(pageSize);
    let y = pageSize[1] - margin;
    if (first) {
      page.drawText(pdfText(`Compliance de Treinamentos - ${params.setorNome}`), {
        x: margin,
        y,
        size: 16,
        font: bold,
        color: rgb(0.06, 0.13, 0.22),
      });
      y -= 20;
      page.drawText(pdfText(`Empresa: ${params.empresaNome}`), {
        x: margin,
        y,
        size: 9,
        font: regular,
      });
      y -= 14;
      page.drawText(pdfText(`Emissao: ${generatedAt.toLocaleString('pt-BR')}`), {
        x: margin,
        y,
        size: 9,
        font: regular,
      });
      y -= 18;
      page.drawText(
        pdfText(
          `Pessoas: ${summary.pessoas} | Requisitos no recorte: ${summary.requisitos} | Realizados: ${summary.conformes} | Vencidos: ${summary.vencidos} | Nunca realizou: ${summary.nunca} | Vencendo: ${summary.vencendo} | Em andamento: ${summary.andamento}`,
        ),
        { x: margin, y, size: 8.2, font: bold },
      );
      y -= 22;
    }
    page.drawRectangle({
      x: margin,
      y: y - 17,
      width: tableWidth,
      height: 18,
      color: rgb(0.91, 0.93, 0.96),
    });
    let x = margin;
    headers.forEach((header, index) => {
      page.drawText(header, { x: x + 4, y: y - 11, size: 7.5, font: bold });
      x += columns[index];
    });
    return { page, y: y - 23 };
  };

  let current = addPage(true);
  for (const row of params.rows) {
    const cells = [
      row.funcionario_nome,
      row.setor_nome || 'Sem setor',
      row.funcao_nome || 'Sem funcao',
      row.qualificacao_tipo_nome || row.qualificacao_tipo_codigo || 'Treinamento',
      statusLabel(row),
      dateBr(row.data_validade),
    ];
    const wrapped = cells.map((cell, index) =>
      wrapText(regular, cell, 7.2, columns[index] - 8),
    );
    const lines = Math.max(1, ...wrapped.map((cell) => cell.length));
    const rowHeight = Math.max(18, lines * 9 + 5);
    if (current.y - rowHeight < 28) current = addPage(false);
    let x = margin;
    wrapped.forEach((cellLines, index) => {
      drawCellLines(current.page, regular, cellLines, x + 4, current.y - 9, 7.2, 9);
      x += columns[index];
    });
    current.page.drawLine({
      start: { x: margin, y: current.y - rowHeight + 2 },
      end: { x: margin + tableWidth, y: current.y - rowHeight + 2 },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93),
    });
    current.y -= rowHeight;
  }
  if (!params.rows.length) {
    current.page.drawText('Nenhum requisito encontrado para o recorte configurado.', {
      x: margin,
      y: current.y - 10,
      size: 10,
      font: regular,
    });
  }
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawText(`AirTrust - pagina ${index + 1}/${pages.length}`, {
      x: margin,
      y: 12,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.45, 0.52),
    });
  });
  const bytes = await doc.save();
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  const safeSector =
    params.setorNome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 70) || 'setor';
  return {
    bytes,
    base64: btoa(binary),
    filename: `compliance-treinamentos-${safeSector}-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  };
}

export async function sendTrainingComplianceReportToSectorManagers(params: {
  env: Env;
  db: D1Database;
  empresaId: number;
  empresaNome: string;
  setorId: number;
  setorNome: string;
  rows: TrainingComplianceReportRow[];
}): Promise<{ sent: boolean; recipients: number; error: string | null }> {
  const managers = await getSetorGestoresBySetor(params.db, params.empresaId, params.setorId, true);
  const recipients = [
    ...new Map(
      managers
        .filter((item) => String(item.gestor_email || '').includes('@'))
        .map((item) => [
          String(item.gestor_email).trim().toLowerCase(),
          { email: String(item.gestor_email).trim(), name: item.gestor_nome },
        ]),
    ).values(),
  ];
  if (!recipients.length)
    return { sent: false, recipients: 0, error: 'Nenhum gestor com e-mail valido' };
  const pdf = await generateTrainingComplianceReportPdf({
    rows: params.rows,
    empresaNome: params.empresaNome,
    setorNome: params.setorNome,
  });
  const safeEmpresaNome = escapeHtml(params.empresaNome);
  const safeSetorNome = escapeHtml(params.setorNome);
  const result = await sendEmailDetailed(params.env, {
    to: recipients,
    subject: `Relatorio de Compliance de Treinamentos - ${params.setorNome}`,
    textContent: `Segue o relatorio atualizado de treinamentos do setor ${params.setorNome}. O documento apresenta o recorte configurado no AirTrust para acompanhamento do gestor.`,
    htmlContent: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55"><h2>Gerencia de Treinamento | ${safeEmpresaNome}</h2><p>Segue o relatorio atualizado de treinamentos do setor <strong>${safeSetorNome}</strong>.</p><p>O documento anexo apresenta o recorte configurado no AirTrust para acompanhamento e regularizacao quando aplicavel.</p></div>`,
    attachments: [{ content: pdf.base64, name: pdf.filename }],
  });
  return {
    sent: result.ok,
    recipients: recipients.length,
    error: result.ok ? null : result.providerResponse || 'Falha no envio do e-mail',
  };
}

export function complianceReportScheduleWindow(
  policy: ComplianceReportAutomationPolicy,
  now: Date,
): { due: boolean; localDate: string; triggerKey: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: policy.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const localDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const weekday = new Date(Date.UTC(year, Math.max(0, month - 1), day)).getUTCDay();
  const [targetHour, targetMinute] = policy.time.split(':').map(Number);
  const afterTime = hour * 60 + minute >= targetHour * 60 + targetMinute;
  const recurrenceMatches =
    policy.frequency === 'DAILY' ||
    (policy.frequency === 'WEEKLY' && weekday === policy.weekday) ||
    (policy.frequency === 'MONTHLY' && day === policy.day_of_month);
  return {
    due: policy.enabled && policy.sector_ids.length > 0 && afterTime && recurrenceMatches,
    localDate,
    triggerKey: `${policy.frequency}:${localDate}`,
  };
}
