import { sqlAddMonthsClamped } from './sql-add-months';
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

// Construir Intl.DateTimeFormat é caro (~0,2 ms); o formatter é imutável e reutilizável.
const SAO_PAULO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getTodayIsoSaoPaulo(referenceDate: Date = new Date()): string {
  return SAO_PAULO_DATE_FORMATTER.format(referenceDate);
}

export function getQualificacoesVencimentoExpr(
  historicoAlias: string = 'qh',
  tipoAlias: string = 'qt',
): string {
  return `COALESCE(
    ${historicoAlias}.data_vencimento,
    CASE
      WHEN ${historicoAlias}.data_conclusao IS NOT NULL
        AND (${historicoAlias}.validade_meses IS NOT NULL OR ${tipoAlias}.validade IS NOT NULL)
        THEN ${sqlAddMonthsClamped(`${historicoAlias}.data_conclusao`, `COALESCE(${historicoAlias}.validade_meses, ${tipoAlias}.validade)`)}
      ELSE NULL
    END
  )`;
}
