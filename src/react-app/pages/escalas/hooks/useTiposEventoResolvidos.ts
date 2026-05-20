// Tipos de evento completamente dinâmicos — 100% orientados ao banco de dados.
// Nenhum tipo é embutido no frontend: todos vêm da tabela escalas_tipos_evento_config.

import { useMemo } from 'react';
import { useTiposEventoConfigQuery } from './queries/useEscalasQuery';
import type { TipoEventoConfig } from './queries/escalas-types';
import { TIPO_TO_CODIGO_MAP } from '../constants/tiposEvento';

export type { TipoEventoConfig };

export function normalizeTipoEventoCodigo(codigo: string | null | undefined): string {
  const raw = String(codigo ?? '').trim();
  if (!raw) return '';
  const mapped = TIPO_TO_CODIGO_MAP[raw.toLowerCase() as keyof typeof TIPO_TO_CODIGO_MAP];
  return (mapped ?? raw).toUpperCase();
}

export function useTiposEventoResolvidos() {
  const query = useTiposEventoConfigQuery();

  /** configMap: keyed by canonical code (e.g. VOO/VIM/FOL) */
  const configMap = useMemo(() => {
    const rows = query.data ?? [];
    return rows.reduce(
      (acc, row) => {
        const codigo = normalizeTipoEventoCodigo(row.codigo);
        if (!codigo) return acc;
        acc[codigo] = row;
        return acc;
      },
      {} as Record<string, TipoEventoConfig>,
    );
  }, [query.data]);

  /** tiposAtivos: ordered list of active canonical codes */
  const tiposAtivos = useMemo(() => {
    return (query.data ?? [])
      .filter((row) => row.ativo === 1)
      .sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99))
      .map((row) => normalizeTipoEventoCodigo(row.codigo))
      .filter(Boolean);
  }, [query.data]);

  /** registroPorTipo: same as configMap — kept for backward compat */
  const registroPorTipo = configMap;

  return {
    ...query,
    configMap,
    tiposAtivos,
    registroPorTipo,
  };
}
