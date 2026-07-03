export type HistoricoStatusLike = {
  id?: number | string | null;
  funcionario_id?: number | string | null;
  qualificacao_id?: number | string | null;
  qualificacao_codigo?: string | null;
  codigo?: string | null;
  qualificacao_nome?: string | null;
  qualificacao_desc?: string | null;
  qualificacao_status?: string | null;
  renovada?: number | boolean | null;
  tem_renovacao_posterior?: number | boolean | null;
  renovacao_de?: number | string | null;
  vigente_operacional?: number | boolean | null;
  status?: string | null;
  data_vencimento?: string | null;
  data_validade?: string | null;
};

const STATUS_RECONHECIDOS = new Set([
  'VALIDA',
  'VENCIDA',
  'VENCENDO_30',
  'RENOVADA',
  'PLANEJADA',
  'CANCELADA',
  'INDEFINIDA',
  'INDETERMINADA',
]);

function toIsoDateOnly(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export type HistoricoHeaderStats = {
  total: number;
  vencendo: number;
  vencidas: number;
  renovadas: number;
  planejadas: number;
};

export function getHistoricoDisplayStatus(item: HistoricoStatusLike): string {
  const qualificacaoStatus = String(item.qualificacao_status || '').toUpperCase();
  const rawStatus = String(item.status || '')
    .trim()
    .toUpperCase();
  const normalized = rawStatus === 'PROXIMA_VENCIMENTO' ? 'VENCENDO_30' : rawStatus;
  const temRenovacaoPosterior =
    item.tem_renovacao_posterior === 1 || item.tem_renovacao_posterior === true;
  const vigenteOperacional =
    item.vigente_operacional === 1 || item.vigente_operacional === true;
  const ehRenovada =
    temRenovacaoPosterior ||
    ((!vigenteOperacional || temRenovacaoPosterior) &&
      (item.renovada === 1 || item.renovada === true)) ||
    (qualificacaoStatus === 'RENOVADA' && (!vigenteOperacional || temRenovacaoPosterior));

  if (qualificacaoStatus === 'PLANEJADA' || qualificacaoStatus === 'CANCELADA') {
    return qualificacaoStatus;
  }

  if (STATUS_RECONHECIDOS.has(normalized)) {
    if (normalized !== 'RENOVADA' || !vigenteOperacional || temRenovacaoPosterior) {
      return normalized;
    }
  }

  if (ehRenovada) {
    return 'RENOVADA';
  }

  const hoje = new Date().toISOString().split('T')[0];
  const d30 = new Date();
  d30.setDate(d30.getDate() + 30);
  const hojeMais30 = d30.toISOString().split('T')[0];
  const vencimento = toIsoDateOnly(item.data_vencimento || item.data_validade);

  if (!vencimento) return 'VALIDA';
  if (vencimento < hoje) return 'VENCIDA';
  if (vencimento <= hojeMais30) return 'VENCENDO_30';
  return 'VALIDA';
}

export function getPlanejamentoRelacionamentoKey(item: HistoricoStatusLike): string | null {
  const funcionarioId = Number(item.funcionario_id || 0);
  const qualificacaoId = Number(item.qualificacao_id || 0);
  const qualificacaoCodigo = String(item.qualificacao_codigo || item.codigo || '')
    .trim()
    .toUpperCase();
  const qualificacaoNome = String(item.qualificacao_nome || item.qualificacao_desc || '')
    .trim()
    .toUpperCase();

  if (!funcionarioId) return null;
  if (qualificacaoId > 0) return `${funcionarioId}:id:${qualificacaoId}`;
  if (qualificacaoCodigo) return `${funcionarioId}:cod:${qualificacaoCodigo}`;
  if (qualificacaoNome) return `${funcionarioId}:nom:${qualificacaoNome}`;
  return null;
}

export function buildPlanejadasRelacionadasMap<T extends HistoricoStatusLike>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();

  items.forEach((item) => {
    if (getHistoricoDisplayStatus(item) !== 'PLANEJADA') return;
    const key = getPlanejamentoRelacionamentoKey(item);
    if (!key) return;
    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
  });

  return map;
}

export function findPlanejadaRelacionada<T extends HistoricoStatusLike>(
  item: T,
  map: Map<string, T[]>,
): T | null {
  if (getHistoricoDisplayStatus(item) !== 'VENCIDA') return null;

  const key = getPlanejamentoRelacionamentoKey(item);
  if (!key) return null;

  const relacionadas = map.get(key) || [];
  return relacionadas.find((planejada) => planejada.id !== item.id) || null;
}

export function computeHistoricoHeaderStats<T extends HistoricoStatusLike>(
  filteredHistorico: T[],
  statusFiltro: Set<string>,
  historicoTotal: number,
  planejadasTotalOverride?: number | null,
): HistoricoHeaderStats {
  const base: HistoricoHeaderStats = {
    total: historicoTotal,
    vencendo: 0,
    vencidas: 0,
    renovadas: 0,
    planejadas: 0,
  };

  filteredHistorico.forEach((item) => {
    const status = getHistoricoDisplayStatus(item);
    if (status === 'VENCENDO_30') base.vencendo += 1;
    if (status === 'VENCIDA') base.vencidas += 1;
    if (status === 'RENOVADA') base.renovadas += 1;
    if (status === 'PLANEJADA') base.planejadas += 1;
  });

  if (typeof planejadasTotalOverride === 'number' && Number.isFinite(planejadasTotalOverride)) {
    base.planejadas = Math.max(0, Math.trunc(planejadasTotalOverride));
  }

  if (statusFiltro.size === 1) {
    const unicoStatus = [...statusFiltro][0];
    if (unicoStatus === 'VENCENDO_30') base.vencendo = historicoTotal;
    if (unicoStatus === 'VENCIDA') base.vencidas = historicoTotal;
    if (unicoStatus === 'RENOVADA') base.renovadas = historicoTotal;
    if (unicoStatus === 'PLANEJADA') base.planejadas = historicoTotal;
  }

  return base;
}
