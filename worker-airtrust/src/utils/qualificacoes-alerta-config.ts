import type { D1Database } from '@cloudflare/workers-types';

export const DEFAULT_QUALIFICACOES_ALERTA_DIAS = 30;
const MIN_QUALIFICACOES_ALERTA_DIAS = 1;
const MAX_QUALIFICACOES_ALERTA_DIAS = 365;

function clampAlertaDias(value: number): number {
  return Math.max(MIN_QUALIFICACOES_ALERTA_DIAS, Math.min(MAX_QUALIFICACOES_ALERTA_DIAS, value));
}

export function normalizeQualificacoesAlertaDias(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_QUALIFICACOES_ALERTA_DIAS;
  return clampAlertaDias(Math.trunc(parsed));
}

export async function getQualificacoesAlertaDias(
  db: D1Database,
  empresaId: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT dias_alerta_vencimento FROM empresas_config WHERE empresa_id = ? LIMIT 1')
    .bind(empresaId)
    .first<{ dias_alerta_vencimento?: number | null }>();

  return normalizeQualificacoesAlertaDias(row?.dias_alerta_vencimento);
}

export function getTodayIsoSaoPaulo(referenceDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(referenceDate);
}

export function getQualificacoesVencimentoExpr(
  historicoAlias: string = 'qh',
  tipoAlias: string = 'qt',
): string {
  return `COALESCE(
    ${historicoAlias}.data_vencimento,
    CASE
      WHEN ${historicoAlias}.data_conclusao IS NOT NULL
        THEN date(${historicoAlias}.data_conclusao, '+' || COALESCE(${historicoAlias}.validade_meses, ${tipoAlias}.validade, 12) || ' months')
      ELSE NULL
    END
  )`;
}
