export function normalizeCategoriaKey(value?: string | null) {
  return (value ?? '').toString().trim().toUpperCase();
}

export function getCategoriaCorDisplay(categoriaNome?: string | null, corOriginal?: string | null) {
  const categoriaKey = normalizeCategoriaKey(categoriaNome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (categoriaKey === 'LICENCA') {
    return '#0f766e';
  }
  return corOriginal || undefined;
}

export function parseDateLocal(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return new Date(year, month - 1, day);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizeTipoCodigo(value?: string | null) {
  return (value ?? '').toString().trim().toUpperCase();
}

export function getTipoTreinamentoDisplay(value?: string | null, validadeMeses?: number | null) {
  const tipo = normalizeTipoCodigo(value);

  if (tipo === 'SEMESTRAL' || Number(validadeMeses || 0) === 6) {
    return {
      value: 'SEMESTRAL',
      label: 'Semestral',
      className: 'bg-emerald-100 text-emerald-800',
    };
  }

  if (tipo === 'INICIAL') {
    return {
      value: 'INICIAL',
      label: 'Inicial',
      className: 'bg-amber-100 text-amber-800',
    };
  }

  return {
    value: 'RECORRENTE',
    label: 'Periódico',
    className: 'bg-sky-100 text-sky-800',
  };
}

export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(value?: string | null): string {
  if (!value) return 'Data a definir';
  const parsed = parseDateLocal(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString('pt-BR');
}

export type PlanejadaDateSource = {
  qualificacao_status?: string | null;
  data_realizacao?: string | null;
  data_conclusao?: string | null;
};

export function isPlanejadaVencida(
  item: PlanejadaDateSource,
  today: Date = new Date(),
): boolean {
  const status = String(item.qualificacao_status || '').toUpperCase();
  if (status !== 'PLANEJADA') return false;

  const data = parseDateLocal(item.data_realizacao || item.data_conclusao);
  if (!data) return false;

  const hoje = new Date(today);
  hoje.setHours(0, 0, 0, 0);
  return data < hoje;
}

export function getDataMinimaPlanejada(today: Date = new Date()): string {
  const amanha = new Date(today);
  amanha.setHours(0, 0, 0, 0);
  amanha.setDate(amanha.getDate() + 1);
  return formatDateInputValue(amanha);
}

export function sugerirNovaDataPlanejada(
  item?: PlanejadaDateSource | null,
  today: Date = new Date(),
): string {
  const dataBase = parseDateLocal(item?.data_realizacao || item?.data_conclusao);
  const sugerida = dataBase ? new Date(dataBase) : new Date(today);
  sugerida.setHours(0, 0, 0, 0);
  sugerida.setDate(sugerida.getDate() + 1);

  const minima = parseDateLocal(getDataMinimaPlanejada(today));
  if (minima && sugerida < minima) {
    return formatDateInputValue(minima);
  }

  return formatDateInputValue(sugerida);
}

export type PlanejadaListItem = PlanejadaDateSource & {
  id?: number | null;
};

function getPlanejadaReferenceDate(item: PlanejadaDateSource): Date | null {
  return parseDateLocal(item.data_realizacao || item.data_conclusao);
}

export function prioritizeHistoricoItems<T extends PlanejadaListItem>(
  items: readonly T[],
  highlightedHistoricoId?: number | null,
  today: Date = new Date(),
): T[] {
  const hoje = new Date(today);
  hoje.setHours(0, 0, 0, 0);

  const shouldPrioritize = (item: T): boolean => {
    const status = String(item.qualificacao_status || '').toUpperCase();
    if (status !== 'PLANEJADA') return false;
    const data = getPlanejadaReferenceDate(item);
    return Boolean(data && data <= hoje);
  };

  return [...items].sort((a, b) => {
    const destaqueA = highlightedHistoricoId && a.id === highlightedHistoricoId ? 1 : 0;
    const destaqueB = highlightedHistoricoId && b.id === highlightedHistoricoId ? 1 : 0;
    if (destaqueA !== destaqueB) return destaqueB - destaqueA;

    const prioridadeA = shouldPrioritize(a) ? 1 : 0;
    const prioridadeB = shouldPrioritize(b) ? 1 : 0;
    return prioridadeB - prioridadeA;
  });
}

export function sortPlanejadosByDate<T extends PlanejadaDateSource>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const dataA = getPlanejadaReferenceDate(a);
    const dataB = getPlanejadaReferenceDate(b);
    if (!dataA && !dataB) return 0;
    if (!dataA) return 1;
    if (!dataB) return -1;
    return dataA.getTime() - dataB.getTime();
  });
}

export type PlanejadosStats = {
  total: number;
  futuros: number;
  atrasados: number;
  semData: number;
};

export function computePlanejadosStats(
  items: readonly PlanejadaDateSource[],
  today: Date = new Date(),
): PlanejadosStats {
  const hoje = new Date(today);
  hoje.setHours(0, 0, 0, 0);

  return items.reduce<PlanejadosStats>(
    (acc, item) => {
      acc.total += 1;
      const data = getPlanejadaReferenceDate(item);
      if (!data) {
        acc.semData += 1;
      } else if (data < hoje) {
        acc.atrasados += 1;
      } else {
        acc.futuros += 1;
      }
      return acc;
    },
    { total: 0, futuros: 0, atrasados: 0, semData: 0 },
  );
}

export type PlannedTrainingParticipantSource = {
  funcionario_id?: number | string | null;
};

export type PlannedTrainingAvailabilitySource = {
  status?: string | null;
  participantes: readonly PlannedTrainingParticipantSource[];
  qualificacao_tipo_id?: number | string | null;
  qualificacao_codigo?: string | null;
  qualificacao_nome?: string | null;
  titulo?: string | null;
  data_prevista?: string | null;
  hora_inicio?: string | null;
};

export type PlannedQualificationAvailabilitySource = {
  qualificacao_id?: number | string | null;
  qualificacao_codigo?: string | null;
  codigo?: string | null;
  qualificacao_nome?: string | null;
  funcionario_id?: number | string | null;
  data_realizacao?: string | null;
  data_conclusao?: string | null;
};

function normalizePlannedAvailabilityText(value?: string | null): string {
  return (value ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizePlannedAvailabilityCode(value?: string | null): string {
  return (value ?? '').toString().trim().toUpperCase();
}

function isSamePlannedDate(left?: string | null, right?: string | null): boolean {
  return String(left || '').slice(0, 10) === String(right || '').slice(0, 10);
}

export function getAvailablePlannedTrainings<T extends PlannedTrainingAvailabilitySource>(
  trainings: readonly T[],
  item: PlannedQualificationAvailabilitySource,
): T[] {
  const qualificacaoId = Number(item.qualificacao_id || 0);
  const qualificacaoCodigo = normalizePlannedAvailabilityCode(
    item.qualificacao_codigo || item.codigo || '',
  );
  const qualificacaoNome = normalizePlannedAvailabilityText(item.qualificacao_nome || '');
  const funcionarioId = Number(item.funcionario_id || 0);
  const dataPlanejadaItem = item.data_realizacao || item.data_conclusao || null;

  return trainings
    .filter((treinamento) => {
      const statusTreinamento = normalizePlannedAvailabilityText(treinamento.status);
      if (statusTreinamento !== 'PLANEJADO') return false;
      if (
        !treinamento.participantes.some(
          (participante) => Number(participante.funcionario_id) === funcionarioId,
        )
      ) {
        return false;
      }

      if (qualificacaoId > 0 && Number(treinamento.qualificacao_tipo_id) === qualificacaoId) {
        return true;
      }

      const treinamentoCodigo = normalizePlannedAvailabilityCode(
        treinamento.qualificacao_codigo || '',
      );
      if (qualificacaoCodigo && treinamentoCodigo === qualificacaoCodigo) {
        return true;
      }

      const treinamentoNome = normalizePlannedAvailabilityText(
        treinamento.qualificacao_nome || treinamento.titulo || '',
      );
      if (
        qualificacaoNome &&
        treinamentoNome &&
        (treinamentoNome.includes(qualificacaoNome) || qualificacaoNome.includes(treinamentoNome))
      ) {
        return true;
      }

      return isSamePlannedDate(treinamento.data_prevista, dataPlanejadaItem);
    })
    .sort((left, right) => {
      const leftKey = `${left.data_prevista} ${left.hora_inicio || '99:99'}`;
      const rightKey = `${right.data_prevista} ${right.hora_inicio || '99:99'}`;
      return leftKey.localeCompare(rightKey);
    });
}

export type PlannedFallbackParticipantSource = {
  funcionario_id?: number | string | null;
  qualificacao_codigo?: string | null;
  codigo?: string | null;
  qualificacao_nome?: string | null;
  tipo_nome?: string | null;
  data_realizacao?: string | null;
  data_conclusao?: string | null;
};

function normalizePlannedFallbackValue(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

export function getPlannedFallbackParticipantIds(
  items: readonly PlannedFallbackParticipantSource[],
  selected: PlannedFallbackParticipantSource,
): number[] {
  const dataPlanejada = selected.data_realizacao || selected.data_conclusao || '';
  const dataRef = String(dataPlanejada).slice(0, 10);
  const codigoRef = normalizePlannedFallbackValue(
    selected.qualificacao_codigo || selected.codigo,
  );
  const nomeRef = normalizePlannedFallbackValue(
    selected.qualificacao_nome || selected.tipo_nome,
  );

  const ids = Array.from(
    new Set(
      items
        .filter((item) => {
          const itemData = String(item.data_realizacao || item.data_conclusao || '').slice(0, 10);
          if (itemData !== dataRef) return false;

          const itemCodigo = normalizePlannedFallbackValue(item.qualificacao_codigo || item.codigo);
          const itemNome = normalizePlannedFallbackValue(item.qualificacao_nome || item.tipo_nome);
          const codigoMatch = Boolean(codigoRef && itemCodigo && codigoRef === itemCodigo);
          const nomeMatch = Boolean(nomeRef && itemNome && nomeRef === itemNome);

          if (codigoRef || nomeRef) return codigoMatch || nomeMatch;
          return true;
        })
        .map((item) => Number(item.funcionario_id || 0))
        .filter((id) => id > 0),
    ),
  );

  const selectedId = Number(selected.funcionario_id || 0);
  if (ids.length === 0 && selectedId > 0) ids.push(selectedId);
  return ids;
}

export function getStatusColor(status: string) {
  if (status === 'CONCLUIDA' || status === 'CONCLUIDO') return 'bg-emerald-600/10 text-emerald-700';
  if (status === 'RENOVADA') return 'bg-blue-600/10 text-blue-600';
  if (status === 'VALIDA') return 'bg-success-600/10 text-success-600';
  if (status === 'PROXIMA_VENCIMENTO' || status === 'VENCENDO_30')
    return 'bg-warning-600/10 text-warning-600';
  if (status === 'PLANEJADA') return 'bg-purple-600/10 text-purple-600';
  if (status === 'CANCELADA') return 'bg-slate-600/10 text-slate-600';
  return 'bg-danger-600/10 text-danger-600';
}

export function getStatusDotColor(status: string) {
  if (status === 'CONCLUIDA' || status === 'CONCLUIDO') return 'bg-emerald-700';
  if (status === 'VALIDA') return 'bg-success-600';
  if (status === 'PROXIMA_VENCIMENTO' || status === 'VENCENDO_30') return 'bg-warning-600';
  if (status === 'PLANEJADA') return 'bg-purple-600';
  if (status === 'CANCELADA') return 'bg-slate-600';
  return 'bg-danger-600';
}

export function getStatusLabel(status: string) {
  if (status === 'CONCLUIDA' || status === 'CONCLUIDO') return 'Sem vencimento';
  if (status === 'RENOVADA') return 'Renovada';
  if (status === 'VALIDA') return 'Válida';
  if (status === 'PROXIMA_VENCIMENTO' || status === 'VENCENDO_30') return 'Vencendo';
  if (status === 'PLANEJADA') return 'Planejada';
  if (status === 'CANCELADA') return 'Cancelada';
  return 'Vencida';
}
