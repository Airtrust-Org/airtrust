import type { CvRdv, RdvInput } from '@/react-app/hooks/useControleVoos';

export const RDV_PILOT_STEPS = [
  { id: 'identificacao', label: 'Identificação' },
  { id: 'tripulacao', label: 'Tripulação' },
  { id: 'trechos', label: 'Trechos' },
  { id: 'abastecimentos', label: 'Abastecimentos' },
  { id: 'observacoes', label: 'Observações' },
  { id: 'revisao', label: 'Revisão e envio' },
] as const;

export type RdvPilotStepId = (typeof RDV_PILOT_STEPS)[number]['id'];

export type RdvSaveStatus = 'idle' | 'pendente' | 'salvando' | 'salvo' | 'erro';

export const RDV_SAVE_STATUS_LABELS: Record<RdvSaveStatus, string> = {
  idle: 'Sem alterações',
  pendente: 'Alterações pendentes',
  salvando: 'Salvando…',
  salvo: 'Salvo',
  erro: 'Erro de salvamento',
};

export type RdvFormState = {
  numero: string;
  data_voo: string;
  horario_decolagem_real: string;
  horario_pouso_real: string;
  horas_voadas: string;
  numero_pousos: string;
  ciclos: string;
  combustivel_decolagem: string;
  combustivel_pouso: string;
  combustivel_consumo: string;
  pob: string;
  carga_kg: string;
  ocorrencias: string;
  divergencias: string;
};

export type RdvTrechoDraft = {
  localId: string;
  /** id persistido em cv_voo_etapas; null/undefined = ainda não confirmado no servidor */
  id?: number | null;
  origem: string;
  destino: string;
  horario_decolagem: string;
  horario_pouso: string;
  combustivel_decolagem: string;
  combustivel_pouso: string;
  numero_pousos: string;
  pob: string;
  carga_kg: string;
  saveStatus?: RdvSaveStatus;
};

export type FieldErrors = Partial<Record<keyof RdvFormState, string>> & {
  trechos?: string;
};

const TRECHO_DRAFT_PREFIX = 'cv-rdv-trechos:';
const ETAPA_PENDING_PREFIX = 'cv-rdv-etapas-pending:';

export type EtapaPendingRecovery = {
  vooId: string;
  versao: number;
  timestamp: string;
  patches: Array<{ id: number; fields: Record<string, string | number | null> }>;
};

export function formatRdvNumero(dataVoo: string, prefixo: string) {
  const compactDate = dataVoo.split('-').join('');
  const compactPrefix = prefixo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `RDV-${compactDate}-${compactPrefix}`;
}

export function normalizeRdvNumero(value: string) {
  return value.trim().toUpperCase();
}

export function toInputDateTime(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function fromInputDateTime(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

export function toInputNumber(value: number | null | undefined) {
  return value == null ? '' : String(value);
}

export function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

/** Horas voadas em decimal a partir de datetime-local (domínio já usado no RDV). */
export function calcHorasVoadas(decolagemLocal: string, pousoLocal: string): number | null {
  if (!decolagemLocal.trim() || !pousoLocal.trim()) return null;
  const start = new Date(decolagemLocal);
  const end = new Date(pousoLocal);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return Number(((end.getTime() - start.getTime()) / 3_600_000).toFixed(2));
}

/** Consumo = decolagem − pouso (regra operacional do backend). */
export function calcConsumoCombustivel(
  decolagem: number | null,
  pouso: number | null,
): number | null {
  if (decolagem == null || pouso == null) return null;
  return Number((decolagem - pouso).toFixed(3));
}

export function createLocalId() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildFormState(
  voo: { prefixo: string; data_programacao: string },
  rdv: CvRdv | null,
): RdvFormState {
  return {
    numero: rdv?.numero || formatRdvNumero(voo.data_programacao, voo.prefixo),
    data_voo: rdv?.data_voo || voo.data_programacao,
    horario_decolagem_real: toInputDateTime(rdv?.horario_decolagem_real),
    horario_pouso_real: toInputDateTime(rdv?.horario_pouso_real),
    horas_voadas: toInputNumber(rdv?.horas_voadas),
    numero_pousos: toInputNumber(rdv?.numero_pousos),
    ciclos: toInputNumber(rdv?.ciclos),
    combustivel_decolagem: toInputNumber(rdv?.combustivel_decolagem),
    combustivel_pouso: toInputNumber(rdv?.combustivel_pouso),
    combustivel_consumo: toInputNumber(rdv?.combustivel_consumo),
    pob: toInputNumber(rdv?.pob),
    carga_kg: toInputNumber(rdv?.carga_kg),
    ocorrencias: rdv?.ocorrencias || '',
    divergencias: rdv?.divergencias || '',
  };
}

export function seedTrechosFromVoo(
  voo: {
    data_programacao: string;
    horario_previsto_partida: string;
    horario_previsto_chegada: string;
  },
  origemIcao: string,
  destinoIcao: string,
  rdv: CvRdv | null,
): RdvTrechoDraft[] {
  return [
    {
      localId: createLocalId(),
      origem: origemIcao,
      destino: destinoIcao,
      horario_decolagem: toInputDateTime(
        rdv?.horario_decolagem_real || voo.horario_previsto_partida,
      ),
      horario_pouso: toInputDateTime(rdv?.horario_pouso_real || voo.horario_previsto_chegada),
      combustivel_decolagem: toInputNumber(rdv?.combustivel_decolagem),
      combustivel_pouso: toInputNumber(rdv?.combustivel_pouso),
      numero_pousos: toInputNumber(rdv?.numero_pousos ?? 1),
      pob: toInputNumber(rdv?.pob),
      carga_kg: toInputNumber(rdv?.carga_kg),
    },
  ];
}

export function duplicateTrecho(trecho: RdvTrechoDraft): RdvTrechoDraft {
  return {
    ...trecho,
    localId: createLocalId(),
    origem: trecho.destino,
    destino: '',
    horario_decolagem: trecho.horario_pouso,
    horario_pouso: '',
    combustivel_decolagem: trecho.combustivel_pouso,
    combustivel_pouso: '',
  };
}

export function emptyTrecho(origem = '', destino = ''): RdvTrechoDraft {
  return {
    localId: createLocalId(),
    id: null,
    origem,
    destino,
    horario_decolagem: '',
    horario_pouso: '',
    combustivel_decolagem: '',
    combustivel_pouso: '',
    numero_pousos: '1',
    pob: '',
    carga_kg: '',
  };
}

/** Mapeia etapa persistida → draft de UI (campos do cartão). */
export function draftFromEtapa(
  etapa: {
    id: number;
    origem_icao: string | null;
    destino_icao: string | null;
    horario_decolagem: string | null;
    horario_pouso: string | null;
    combustivel_inicio: number | null;
    combustivel_fim: number | null;
    pousos_diurnos: number | null;
    pousos_noturnos: number | null;
    pax: number | null;
    payload: number | null;
  },
  localId?: string,
): RdvTrechoDraft {
  const pousos = (etapa.pousos_diurnos ?? 0) + (etapa.pousos_noturnos ?? 0);
  return {
    localId: localId || `e-${etapa.id}`,
    id: etapa.id,
    origem: etapa.origem_icao || '',
    destino: etapa.destino_icao || '',
    horario_decolagem: toInputDateTime(etapa.horario_decolagem),
    horario_pouso: toInputDateTime(etapa.horario_pouso),
    combustivel_decolagem: toInputNumber(etapa.combustivel_inicio),
    combustivel_pouso: toInputNumber(etapa.combustivel_fim),
    numero_pousos: toInputNumber(pousos || null) || '0',
    pob: toInputNumber(etapa.pax),
    carga_kg: toInputNumber(etapa.payload),
    saveStatus: 'salvo',
  };
}

/** Patch de API a partir do draft (sem versao/mode). */
export function draftToEtapaPatch(draft: RdvTrechoDraft): Record<string, string | number | null> {
  const pousos = parseInteger(draft.numero_pousos);
  return {
    origem_icao: draft.origem.trim().toUpperCase() || null,
    destino_icao: draft.destino.trim().toUpperCase() || null,
    horario_decolagem: fromInputDateTime(draft.horario_decolagem),
    horario_pouso: fromInputDateTime(draft.horario_pouso),
    combustivel_inicio: parseNumber(draft.combustivel_decolagem),
    combustivel_fim: parseNumber(draft.combustivel_pouso),
    pousos_diurnos: pousos,
    pousos_noturnos: 0,
    pax: parseInteger(draft.pob),
    payload: parseNumber(draft.carga_kg),
  };
}

export function etapaPendingStorageKey(vooId: string | number) {
  return `${ETAPA_PENDING_PREFIX}${vooId}`;
}

export function loadEtapaPendingRecovery(vooId: string | number): EtapaPendingRecovery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(etapaPendingStorageKey(vooId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EtapaPendingRecovery;
    if (!parsed || typeof parsed.versao !== 'number' || !Array.isArray(parsed.patches)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveEtapaPendingRecovery(vooId: string | number, payload: EtapaPendingRecovery) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(etapaPendingStorageKey(vooId), JSON.stringify(payload));
  } catch {
    // privacy mode / quota
  }
}

export function clearEtapaPendingRecovery(vooId: string | number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(etapaPendingStorageKey(vooId));
  } catch {
    // ignore
  }
}

export function formsAreEqual(a: RdvFormState, b: RdvFormState): boolean {
  return (Object.keys(a) as (keyof RdvFormState)[]).every((key) => a[key] === b[key]);
}

/** Agrega trechos → campos do RDV (primeiro decolagem / último pouso / totais). */
export function aggregateTrechosToFormPatch(trechos: RdvTrechoDraft[]): Partial<RdvFormState> {
  if (trechos.length === 0) return {};

  const first = trechos[0];
  const last = trechos[trechos.length - 1];
  let totalPousos = 0;
  let totalHoras = 0;
  let hasHoras = false;

  for (const t of trechos) {
    const pousos = parseInteger(t.numero_pousos);
    if (pousos != null) totalPousos += pousos;
    const horas = calcHorasVoadas(t.horario_decolagem, t.horario_pouso);
    if (horas != null) {
      totalHoras += horas;
      hasHoras = true;
    }
  }

  const combustivelDecolagem = parseNumber(first.combustivel_decolagem);
  const combustivelPouso = parseNumber(last.combustivel_pouso);
  const consumo = calcConsumoCombustivel(combustivelDecolagem, combustivelPouso);

  return {
    horario_decolagem_real: first.horario_decolagem,
    horario_pouso_real: last.horario_pouso,
    horas_voadas: hasHoras ? String(Number(totalHoras.toFixed(2))) : '',
    numero_pousos: totalPousos > 0 ? String(totalPousos) : '',
    ciclos: totalPousos > 0 ? String(totalPousos) : '',
    combustivel_decolagem: first.combustivel_decolagem,
    combustivel_pouso: last.combustivel_pouso,
    combustivel_consumo: consumo == null ? '' : String(consumo),
    pob: last.pob || first.pob,
    carga_kg: last.carga_kg || first.carga_kg,
  };
}

export function formStateToRdvInput(form: RdvFormState): RdvInput {
  return {
    numero: form.numero.trim(),
    data_voo: form.data_voo,
    horario_decolagem_real: fromInputDateTime(form.horario_decolagem_real),
    horario_pouso_real: fromInputDateTime(form.horario_pouso_real),
    horas_voadas: parseNumber(form.horas_voadas),
    numero_pousos: parseInteger(form.numero_pousos),
    ciclos: parseInteger(form.ciclos),
    combustivel_decolagem: parseNumber(form.combustivel_decolagem),
    combustivel_pouso: parseNumber(form.combustivel_pouso),
    combustivel_consumo: parseNumber(form.combustivel_consumo),
    pob: parseInteger(form.pob),
    carga_kg: parseNumber(form.carga_kg),
    ocorrencias: form.ocorrencias.trim() || null,
    divergencias: form.divergencias.trim() || null,
  };
}

export function validateField(
  field: keyof RdvFormState,
  form: RdvFormState,
  voo: { prefixo: string; data_programacao: string },
): string | null {
  if (field === 'numero') {
    const expected = formatRdvNumero(form.data_voo || voo.data_programacao, voo.prefixo);
    if (!normalizeRdvNumero(form.numero).startsWith(expected)) {
      return `Número do RDV deve começar com ${expected}.`;
    }
  }

  if (field === 'horario_pouso_real' || field === 'horario_decolagem_real') {
    if (form.horario_decolagem_real && form.horario_pouso_real) {
      if (form.horario_pouso_real < form.horario_decolagem_real) {
        return 'Pouso não pode ser anterior à decolagem.';
      }
    }
  }

  if (
    field === 'combustivel_decolagem' ||
    field === 'combustivel_pouso' ||
    field === 'combustivel_consumo'
  ) {
    const decolagem = parseNumber(form.combustivel_decolagem);
    const pouso = parseNumber(form.combustivel_pouso);
    const consumo = parseNumber(form.combustivel_consumo);
    if (decolagem != null && pouso != null) {
      if (pouso > decolagem) return 'Combustível de pouso não pode ser maior que decolagem.';
      if (consumo != null) {
        const expected = calcConsumoCombustivel(decolagem, pouso);
        if (expected != null && Number(consumo.toFixed(3)) !== expected) {
          return `Consumo deve ser ${expected}.`;
        }
      }
    }
  }

  return null;
}

export function validateTrechos(trechos: RdvTrechoDraft[]): string | null {
  if (trechos.length === 0) return 'Adicione ao menos um trecho.';
  for (let i = 0; i < trechos.length; i += 1) {
    const t = trechos[i];
    if (!t.origem.trim() || !t.destino.trim()) {
      return `Trecho ${i + 1}: informe origem e destino.`;
    }
    if (t.horario_decolagem && t.horario_pouso && t.horario_pouso < t.horario_decolagem) {
      return `Trecho ${i + 1}: pouso anterior à decolagem.`;
    }
    if (i > 0) {
      const prev = trechos[i - 1];
      if (prev.horario_pouso && t.horario_decolagem && t.horario_decolagem < prev.horario_pouso) {
        return `Trecho ${i + 1} inicia antes do pouso do trecho ${i}.`;
      }
    }
  }
  return null;
}

export function collectFieldErrors(
  form: RdvFormState,
  voo: { prefixo: string; data_programacao: string },
  trechos: RdvTrechoDraft[],
): FieldErrors {
  const errors: FieldErrors = {};
  const fields: (keyof RdvFormState)[] = [
    'numero',
    'horario_decolagem_real',
    'horario_pouso_real',
    'combustivel_decolagem',
    'combustivel_pouso',
    'combustivel_consumo',
  ];
  for (const field of fields) {
    const err = validateField(field, form, voo);
    if (err) errors[field] = err;
  }
  const trechoErr = validateTrechos(trechos);
  if (trechoErr) errors.trechos = trechoErr;
  return errors;
}

export function isStepComplete(
  stepId: RdvPilotStepId,
  form: RdvFormState,
  options: { tripulantesCount: number; abastecimentosCount: number; trechosCount: number },
): boolean {
  switch (stepId) {
    case 'identificacao':
      return Boolean(form.numero.trim() && form.data_voo);
    case 'tripulacao':
      return options.tripulantesCount > 0;
    case 'trechos':
      return (
        options.trechosCount > 0 && Boolean(form.horario_decolagem_real && form.horario_pouso_real)
      );
    case 'abastecimentos':
      return true;
    case 'observacoes':
      return true;
    case 'revisao':
      return Boolean(
        form.numero.trim() &&
        form.data_voo &&
        form.horario_decolagem_real &&
        form.horario_pouso_real &&
        form.combustivel_decolagem &&
        form.combustivel_pouso &&
        options.tripulantesCount > 0,
      );
    default:
      return false;
  }
}

export function computeProgressPercent(
  form: RdvFormState,
  options: { tripulantesCount: number; abastecimentosCount: number; trechosCount: number },
): number {
  const done = RDV_PILOT_STEPS.filter((s) => isStepComplete(s.id, form, options)).length;
  return Math.round((done / RDV_PILOT_STEPS.length) * 100);
}

export function getStepIndex(stepId: RdvPilotStepId): number {
  return RDV_PILOT_STEPS.findIndex((s) => s.id === stepId);
}

export function getSalvarRdvErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (isVersionConflictError(error)) {
    return 'Versão do RDV desatualizada. Recarregue os dados antes de continuar.';
  }
  if (message.includes('Payload contem termo fora do escopo')) {
    return 'Texto contém termo fora do escopo operacional interno. Remova termos regulatórios ou fiscais e salve novamente.';
  }
  if (message.includes('Combustivel incoerente')) {
    return 'Combustível incoerente: decolagem menos pouso deve ser igual ao consumo informado.';
  }
  if (message.includes('RDV com preenchimento finalizado')) {
    return 'RDV com preenchimento finalizado. Edição bloqueada.';
  }

  return message || 'Não foi possível salvar o RDV.';
}

export function isVersionConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('CONTROLE_VOOS_RDV_VERSION_CONFLICT') ||
    message.includes('Versao do RDV desatualizada') ||
    message.includes('Versão do RDV desatualizada')
  );
}

export function trechoDraftStorageKey(vooId: string | number) {
  return `${TRECHO_DRAFT_PREFIX}${vooId}`;
}

export function loadTrechoDraft(vooId: string | number): RdvTrechoDraft[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(trechoDraftStorageKey(vooId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RdvTrechoDraft[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTrechoDraft(vooId: string | number, trechos: RdvTrechoDraft[]) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(trechoDraftStorageKey(vooId), JSON.stringify(trechos));
  } catch {
    // privacy mode / quota
  }
}

export function clearTrechoDraft(vooId: string | number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(trechoDraftStorageKey(vooId));
  } catch {
    // ignore
  }
}
