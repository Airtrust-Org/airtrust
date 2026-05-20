import type { FrmsFrotaRow } from '@/react-app/hooks/useFrms';
import type { FrmsFiltersState } from './components/FrmsFilterContext';
import { resolveFrmsDashboardNivelCompleto } from './frmsUtils';

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeModel(value: string | null | undefined): string {
  return normalizeText(value).replace(/[\s-]+/g, '');
}

export function extractModelTokens(value: string | null | undefined): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  return Array.from(
    new Set(
      normalized
        .split(/\s*\/\s*|\s*,\s*|\s*\|\s*/)
        .map((token) => normalizeModel(token))
        .filter(Boolean),
    ),
  );
}

function matchQuinzena(
  row: Pick<FrmsFrotaRow, 'quinzena_numero' | 'quinzena_tipo'>,
  filtro: FrmsFiltersState['quinzena'],
): boolean {
  if (!filtro) return true;
  if (filtro === 'Q1') return row.quinzena_numero === 1 || row.quinzena_tipo === 'Q1';
  if (filtro === 'Q2') return row.quinzena_numero === 2 || row.quinzena_tipo === 'Q2';
  return true;
}

export function applyFrmsFrotaFilters(
  frota: FrmsFrotaRow[],
  filters: FrmsFiltersState,
  options?: {
    alertNivelByTripulante?: Record<string, string>;
    config?: Partial<Record<string, number>> | null;
    applyQuinzenaClientFilter?: boolean;
  },
): FrmsFrotaRow[] {
  const alertNivelByTripulante = options?.alertNivelByTripulante ?? {};
  const config = options?.config ?? null;
  const applyQuinzenaClientFilter = options?.applyQuinzenaClientFilter ?? true;

  return frota.filter((row) => {
    if (filters.busca) {
      const query = normalizeText(filters.busca);
      const nomeComposto = normalizeText([row.nome_guerra, row.nome].filter(Boolean).join(' '));
      if (!nomeComposto.includes(query)) {
        return false;
      }
    }

    if (
      filters.modeloAeronave &&
      !extractModelTokens(row.aeronave_modelo).includes(normalizeModel(filters.modeloAeronave))
    ) {
      return false;
    }

    if (applyQuinzenaClientFilter && !matchQuinzena(row, filters.quinzena)) {
      return false;
    }

    if (filters.status.length < 4) {
      const pctMax = Math.max(row.pct_mes, row.pct_7d, row.pct_dia, row.pct_365d);
      const nivel = resolveFrmsDashboardNivelCompleto({
        effectivenessPct: row.effectiveness_pct ?? null,
        maxCompliancePct: pctMax,
        alertNivel: alertNivelByTripulante[row.tripulante_id],
        config,
      });
      if (!filters.status.includes(nivel)) {
        return false;
      }
    }

    return true;
  });
}
