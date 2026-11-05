import {
  listTrainingCommunications,
  type TrainingCommunication,
} from './training-communication-history';
import type { EmployeeSectorAccess } from '../middleware/employee-sector-access';

type Channel = 'EMAIL' | 'WHATSAPP';
export type AlertIdentity = {
  funcionario_id: number;
  qualificacao_tipo_id?: number | null;
  curso_id?: number | null;
};

const saoPauloParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function localDay(value: Date): string {
  const parts = saoPauloParts.formatToParts(value);
  const get = (name: string) => parts.find((p) => p.type === name)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseSqliteTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function keyFor(identity: AlertIdentity, channel: Channel): string | null {
  const funcionario = Number(identity.funcionario_id);
  const qualificacao = Number(identity.qualificacao_tipo_id);
  const curso = Number(identity.curso_id);
  if (!Number.isInteger(funcionario) || funcionario <= 0) return null;
  if (Number.isInteger(qualificacao) && qualificacao > 0)
    return `${funcionario}:q:${qualificacao}:${channel}`;
  if (Number.isInteger(curso) && curso > 0)
    return `${funcionario}:c:${curso}:${channel}`;
  return null;
}

export class SameDayTrainingAlerts {
  private readonly delivered = new Set<string>();

  constructor(rows: TrainingCommunication[], day: string) {
    for (const row of rows) {
      if (row.status_envio !== 'enviada' || row.gestor) continue;
      const stamp = parseSqliteTimestamp(row.enviado_em);
      if (!stamp || localDay(stamp) !== day) continue;
      const channel = String(row.tipo || '').toUpperCase().startsWith('EMAIL')
        ? 'EMAIL'
        : String(row.tipo || '').toUpperCase().startsWith('WHATSAPP')
          ? 'WHATSAPP'
          : null;
      if (!channel) continue;
      const key = keyFor(row, channel);
      if (key) this.delivered.add(key);
    }
  }

  wasSent(identity: AlertIdentity, channel: Channel): boolean {
    const key = keyFor(identity, channel);
    return key ? this.delivered.has(key) : false;
  }

  markAccepted(identity: AlertIdentity, channel: Channel): void {
    const key = keyFor(identity, channel);
    if (key) this.delivered.add(key);
  }
}

/**
 * Reads the same tenant- and sector-scoped communication history displayed by
 * Compliance. Two neighbouring UTC dates are included because a São Paulo
 * calendar day crosses UTC midnight. A failed read must block sending.
 */
export async function readSameDayTrainingAlerts(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess,
  now = new Date(),
): Promise<SameDayTrainingAlerts> {
  const day = localDay(now);
  const previous = new Date(`${day}T12:00:00Z`);
  const following = new Date(previous);
  previous.setUTCDate(previous.getUTCDate() - 1);
  following.setUTCDate(following.getUTCDate() + 1);
  const start = previous.toISOString().slice(0, 10);
  const end = following.toISOString().slice(0, 10);
  const rows: TrainingCommunication[] = [];

  for (let offset = 0; offset <= 20000; offset += 200) {
    const page = await listTrainingCommunications(
      db, empresaId, access, { notifications: true, audit: true },
      { inicio: start, fim: end, resultado: 'enviada', limit: 200, offset },
    );
    rows.push(...page.rows);
    if (!page.has_more) return new SameDayTrainingAlerts(rows, day);
  }
  throw new Error('Histórico de alertas excedeu limite de verificação segura; envio bloqueado');
}
