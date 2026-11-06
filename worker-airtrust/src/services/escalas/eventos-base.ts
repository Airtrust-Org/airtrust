import {
  findEscalaDoTenant,
  insertEventosBase,
  listManualEventoRanges,
  softDeleteEventosAutoGerados,
  type ManualEventoRange,
} from '../../repositories/escalas-eventos-repository';

/**
 * ESCALAS — regras compartilhadas de escala e geração de eventos base (VOO/FOL).
 * Movido de routes/escalas-shared.ts; a rota continua reexportando estes símbolos.
 */

/**
 * Carrega escala verificando pertencimento ao tenant (IDOR guard).
 * Retorna null se não existir ou não pertencer ao empresaId.
 */
export async function getEscalaVerificada(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<Record<string, unknown> | null> {
  if (!empresaId) return null;
  return findEscalaDoTenant(db, id, empresaId);
}

/**
 * Carrega escala e rejeita se estiver publicada.
 * Usar em endpoints de mutação (POST/PUT/DELETE) para garantir que escalas
 * publicadas só sejam alteradas após iniciar uma nova revisão.
 */
export async function getEscalaVerificadaParaMutacao(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<{ escala: Record<string, unknown> } | { error: string; status: number }> {
  if (!empresaId) return { error: 'Empresa não identificada', status: 400 };
  const escala = await findEscalaDoTenant<Record<string, unknown>>(db, id, empresaId);
  if (!escala) return { error: 'Escala não encontrada', status: 404 };
  if (escala.status === 'publicada') {
    return {
      error: 'Escala publicada não pode ser modificada diretamente. Inicie uma nova revisão primeiro.',
      status: 409,
    };
  }
  return { escala };
}

export interface EventoBasePlanejado {
  data: string; // YYYY-MM-DD
  tipo_evento: 'voo' | 'folga';
  motivo: string;
}

/**
 * Plano puro dos eventos base: todos os dias dos meses tocados pela alocação, sem as
 * datas já cobertas por eventos manuais. VOO dentro de [data_inicio, data_fim], FOL fora.
 */
export function planejarEventosBase(params: {
  manuais: ManualEventoRange[];
  data_inicio: string;
  data_fim: string;
  padrao_escala_id?: string | null;
}): EventoBasePlanejado[] {
  const { manuais, data_inicio, data_fim, padrao_escala_id } = params;
  const padraoLabel = padrao_escala_id ? ` (padrão ${padrao_escala_id})` : '';

  const manualDates = new Set<string>();
  for (const row of manuais) {
    // Mark all dates covered by manual events
    const s = new Date(row.data_inicio + 'T00:00:00Z');
    const e = new Date(row.data_fim + 'T00:00:00Z');
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      manualDates.add(d.toISOString().slice(0, 10));
    }
  }

  // Generate month-wide day-by-day plan
  const start = new Date(`${data_inicio}T12:00:00Z`);
  const end = new Date(`${data_fim}T12:00:00Z`);
  const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12, 0, 0));
  const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0, 12, 0, 0));

  const plano: EventoBasePlanejado[] = [];
  for (let d = new Date(monthStart); d <= monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);

    // Skip if there's already a manual event on this date
    if (manualDates.has(dateStr)) {
      continue;
    }

    const dentroDaAlocacao = dateStr >= data_inicio && dateStr <= data_fim;
    plano.push({
      data: dateStr,
      tipo_evento: dentroDaAlocacao ? 'voo' : 'folga',
      motivo: dentroDaAlocacao
        ? `Auto-gerado — VOO dentro do período alocado${padraoLabel}`
        : `Auto-gerado — FOL fora do período alocado${padraoLabel}`,
    });
  }
  return plano;
}

interface GerarEventosBaseParams {
  db: D1Database;
  empresa_id?: string | number | null;
  escala_id: string;
  tripulacao_id: string;
  funcionario_id: string;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string; // YYYY-MM-DD
  padrao_escala_id?: string | null;
  aeronave?: string | null;
  base?: string | null;
  created_by: string;
}

/**
 * Generates base VOO/FOL events for a crew member for the entire month of the
 * selected allocation.
 *
 * Business rule:
 * - selected `data_inicio` → `data_fim` = VOO
 * - remaining days of the same month = FOL
 *
 * - Marks all events as gerado_automaticamente=1
 * - Skips dates where the funcionário already has manual events
 */
export async function gerarEventosBase(params: GerarEventosBaseParams): Promise<number> {
  const {
    db,
    empresa_id,
    escala_id,
    tripulacao_id,
    funcionario_id,
    data_inicio,
    data_fim,
    padrao_escala_id,
    aeronave,
    base,
    created_by,
  } = params;
  const now = new Date().toISOString();

  // Get existing manual events for this funcionário in this escala (so we skip those dates)
  const manuais = await listManualEventoRanges(db, escala_id, funcionario_id, empresa_id);
  const plano = planejarEventosBase({ manuais, data_inicio, data_fim, padrao_escala_id });

  return insertEventosBase(
    db,
    plano.map((p) => ({
      id: crypto.randomUUID(),
      escala_id,
      tripulacao_id,
      funcionario_id,
      tipo_evento: p.tipo_evento,
      data: p.data,
      local: base || null,
      aeronave: aeronave || null,
      motivo: p.motivo,
      created_by,
      now,
    })),
  );
}

/**
 * Removes all auto-generated events for a specific tripulação.
 * Called before regenerating or when tripulação is deleted.
 */
export async function removerEventosAutoGerados(
  db: D1Database,
  escala_id: string,
  tripulacao_id: string,
): Promise<number> {
  return softDeleteEventosAutoGerados(db, escala_id, tripulacao_id, new Date().toISOString());
}
