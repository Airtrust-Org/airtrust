import type { D1Database } from '@cloudflare/workers-types';
import { readFrmsPendingTreatment } from './case-resolution';
import { logAuditoria } from './db-service-shared';

/**
 * Escalonamento de casos de fadiga com prazo vencido.
 *
 * O prazo NÃO é inventado aqui: é o que o gestor registrou no tratamento do caso
 * (`FRMS_CASE_TREATMENT_V1.prazo`). Caso sem tratamento registrado não tem prazo e, portanto,
 * não "vence"; ele aparece como "sem tratamento" nos painéis e só passará a gerar escalonamento
 * quando a empresa definir formalmente um prazo máximo para o primeiro tratamento.
 */
export interface OpenTreatedCaseRow {
  id: string;
  nivel: string | null;
  tipo_limite: string | null;
  notas_resolucao: string | null;
}

export interface OverdueCase {
  id: string;
  nivel: string;
  tipo_limite: string;
  responsavel: string;
  prazo: string;
  dias_vencido: number;
}

export const OPEN_CASE_SCAN_LIMIT = 500;
const SEVERE_LEVELS = ['CRITICO', 'VIOLACAO'];

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Casos abertos com tratamento registrado cujo prazo é anterior a `hoje` (data civil de São Paulo). */
export function selectOverdueCases(rows: readonly OpenTreatedCaseRow[], hoje: string): OverdueCase[] {
  if (!isIsoDate(hoje)) throw new Error('FRMS_CASE_OVERDUE_INVALID_TODAY');
  const overdue: OverdueCase[] = [];
  for (const row of rows) {
    const treatment = readFrmsPendingTreatment(row.notas_resolucao);
    if (!treatment || !isIsoDate(treatment.prazo) || treatment.prazo >= hoje) continue;
    overdue.push({
      id: String(row.id),
      nivel: String(row.nivel ?? '').toUpperCase(),
      tipo_limite: String(row.tipo_limite ?? ''),
      responsavel: treatment.responsavel,
      prazo: treatment.prazo,
      dias_vencido: daysBetween(treatment.prazo, hoje),
    });
  }
  return overdue.sort((a, b) => b.dias_vencido - a.dias_vencido || a.id.localeCompare(b.id));
}

/** Prioridade da notificação: a severidade do próprio caso, nunca um critério novo. */
export function overduePriority(cases: readonly OverdueCase[]): 'ALTA' | 'URGENTE' {
  return cases.some((item) => SEVERE_LEVELS.includes(item.nivel)) ? 'URGENTE' : 'ALTA';
}

export async function loadOpenTreatedCases(db: D1Database, empresaId: number): Promise<OpenTreatedCaseRow[]> {
  const result = await db
    .prepare(
      `SELECT a.id, a.nivel, a.tipo_limite, a.notas_resolucao
         FROM frms_alerta a
         JOIN funcionarios f
           ON f.id = CAST(a.tripulante_id AS INTEGER)
          AND f.empresa_id = ?
          AND f.deleted_at IS NULL
        WHERE a.deleted_at IS NULL
          AND COALESCE(a.resolvido, 0) = 0
          AND a.notas_resolucao IS NOT NULL
        ORDER BY a.created_at ASC, a.id ASC
        LIMIT ?`,
    )
    .bind(empresaId, OPEN_CASE_SCAN_LIMIT)
    .all<OpenTreatedCaseRow>();
  if (!result || !Array.isArray(result.results)) throw new Error('FRMS_CASE_OVERDUE_QUERY_INCOMPLETE');
  return result.results;
}

export interface OverdueEscalationSettings {
  repeat_hours: number;
  title_template: string;
  message_template: string;
}

export interface OverdueEscalationResult {
  vencidos: number;
  notificado: boolean;
  registrados: number;
  truncado: boolean;
}

type Render = (template: string, vars: Record<string, unknown>) => string;

/**
 * Escalona os casos vencidos de UM tenant: uma notificação consolidada por janela
 * `repeat_hours` e um registro de auditoria por caso/prazo (idempotente).
 */
export async function escalateOverdueCases(
  db: D1Database,
  params: { empresaId: number; hoje: string; settings: OverdueEscalationSettings; render: Render },
): Promise<OverdueEscalationResult> {
  const { empresaId, hoje, settings, render } = params;
  const rows = await loadOpenTreatedCases(db, empresaId);
  const overdue = selectOverdueCases(rows, hoje);
  const truncado = rows.length >= OPEN_CASE_SCAN_LIMIT;
  if (overdue.length === 0) return { vencidos: 0, notificado: false, registrados: 0, truncado };

  let notificado = false;
  const recent = await db
    .prepare(
      `SELECT 1 AS found FROM notificacoes_sistema
        WHERE tipo = 'FRMS_CASE_OVERDUE'
          AND empresa_id = ?
          AND deleted_at IS NULL
          AND created_at > datetime('now', '-' || ? || ' hours')
        LIMIT 1`,
    )
    .bind(empresaId, settings.repeat_hours)
    .first<{ found: number }>();
  if (!recent) {
    const vars = { total: overdue.length, max_dias: overdue[0].dias_vencido, data: hoje };
    await db
      .prepare(
        `INSERT INTO notificacoes_sistema
           (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, link, acao_primaria, created_at, updated_at)
         VALUES ('FRMS_CASE_OVERDUE', ?, ?, ?, 'frms', ?, ?, '/frms/alertas', 'Abrir casos vencidos',
                 datetime('now'), datetime('now'))`,
      )
      .bind(
        overduePriority(overdue),
        render(settings.title_template, vars),
        render(settings.message_template, vars),
        JSON.stringify({
          empresa_id: empresaId,
          data: hoje,
          total: overdue.length,
          casos: overdue.slice(0, 20).map(({ id, nivel, prazo, dias_vencido, responsavel }) => (
            { id, nivel, prazo, dias_vencido, responsavel })),
        }),
        empresaId,
      )
      .run();
    notificado = true;
  }

  // Uma linha de auditoria por caso e por prazo: se o gestor renegociar o prazo e ele vencer de
  // novo, é um novo evento; reexecuções do mesmo dia não duplicam.
  let registrados = 0;
  for (const item of overdue) {
    const known = await db
      .prepare(
        `SELECT 1 AS found FROM auditoria_avancada_v2
          WHERE tabela = 'frms_alerta' AND acao = 'PRAZO_VENCIDO' AND registro_id = ?
            AND json_extract(dados_novos, '$.prazo') = ?
          LIMIT 1`,
      )
      .bind(item.id, item.prazo)
      .first<{ found: number }>();
    if (known) continue;
    await logAuditoria(db, 'frms_alerta', item.id, 'PRAZO_VENCIDO', null, {
      prazo: item.prazo,
      responsavel: item.responsavel,
      detectado_em: hoje,
      dias_vencido: item.dias_vencido,
      notificado_nesta_execucao: notificado,
    });
    registrados += 1;
  }
  return { vencidos: overdue.length, notificado, registrados, truncado };
}
