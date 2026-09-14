export interface FuncionarioRosterRow {
  status?: string;
  funcao?: string;
  cargo?: string;
  aeronave?: string;
}

export interface FuncionarioRosterStats {
  ativos: number;
  inativos: number;
  byModelo: Record<string, { cmd: number; cop: number }>;
}

function normalizeAircraft(value?: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

export function buildFuncionarioRosterStats(
  funcionarios: readonly FuncionarioRosterRow[],
): FuncionarioRosterStats {
  const stats: FuncionarioRosterStats = {
    ativos: 0,
    inativos: 0,
    byModelo: {},
  };

  for (const funcionario of funcionarios) {
    if (String(funcionario.status || '').toUpperCase() !== 'ATIVO') {
      stats.inativos++;
      continue;
    }

    stats.ativos++;
    const role = String(funcionario.funcao || funcionario.cargo || '').toUpperCase();
    const position = role.includes('COMANDANTE') ? 'cmd' : role.includes('COPILOTO') ? 'cop' : null;
    if (!position) continue;

    const aircraft = normalizeAircraft(funcionario.aeronave);
    for (const modelo of ['AW139', 'SK76'] as const) {
      const matchesModel =
        modelo === 'AW139'
          ? aircraft.includes('AW139')
          : aircraft.includes('SK76') || aircraft.includes('S76');
      if (!matchesModel) continue;

      stats.byModelo[modelo] ??= { cmd: 0, cop: 0 };
      stats.byModelo[modelo][position]++;
    }
  }

  return stats;
}
