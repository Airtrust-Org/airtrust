interface ModeloSessaoLike {
  id: number;
  nome: string;
}

interface ModeloSessaoMatchLike extends ModeloSessaoLike {
  codigo?: string | null;
  tipo?: string | null;
  tipo_sessao_id?: number | null;
  tipo_sessao_codigo?: string | null;
  tipo_sessao_nome?: string | null;
  modelo_aeronave?: string | null;
  codigo_aeronave?: string | null;
  tipo_aeronave?: string | null;
  equipamento?: string | null;
  dispositivo?: string | null;
}

interface TipoSessaoMatchLike {
  id?: number | null;
  codigo?: string | null;
  nome?: string | null;
}

interface TipoCheckLike {
  id: number;
  codigo?: string | null;
}

interface ResolveEditModeloSelectionParams {
  modelos: ModeloSessaoLike[];
  modeloSessaoId: number | null;
  isEditMode: boolean;
  templateId?: number | null;
  temaSessao?: string | null;
}

interface DeriveSpecialFichaFlagsParams {
  checksSelecionados: number[];
  tiposCheck: TipoCheckLike[];
  gerarFichaInstrutorManual: boolean;
  gerarFichaExaminadorManual: boolean;
}

interface ApplyModelChangeDefaultsParams {
  modeloAnteriorId: number | null;
  modeloId: number;
  checksPadrao: number[];
}

interface FilterModelosSessaoForModalParams<T extends ModeloSessaoMatchLike> {
  modelos: T[];
  tipoSessao?: TipoSessaoMatchLike | null;
  equipamento?: string | null;
  tipoDispositivo?: 'SIMULADOR' | 'AERONAVE';
}

function normalizeBase(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function normalizeModeloSessaoEquipamento(value: unknown): string {
  const normalized = normalizeBase(value);
  const compact = normalized.replace(/[^A-Z0-9]/g, '');

  if (compact.includes('AW139')) return 'AW139';
  if (compact.includes('SK76') || compact.includes('S76')) return 'SK76';

  const beforeParenthesis = normalized.split('(')[0]?.trim() || normalized;
  return beforeParenthesis.replace(/[^A-Z0-9]/g, '');
}

function normalizeTipoSessao(value: unknown): string {
  const normalized = normalizeBase(value);
  const compact = normalized.replace(/[^A-Z0-9]/g, '');

  if (!compact) return '';
  if (compact === 'INI' || compact.includes('INICIAL')) return 'INICIAL';
  if (compact === 'PER' || compact.includes('PERIODICO')) return 'PERIODICO';
  if (compact === 'REC' || compact.includes('RECORRENTE')) return 'RECORRENTE';
  if (compact === 'SEM' || compact.includes('SEMESTRAL')) return 'SEMESTRAL';
  if (compact === 'UPG' || compact.includes('UPGRADE')) return 'UPGRADE';
  if (compact === 'ESP' || compact.includes('ESPECIFICO')) return 'ESPECIFICO';
  if (compact === 'CHK' || compact.includes('CHECK')) return 'CHECK';

  return compact;
}

function normalizeTipoDispositivo(value: unknown): string {
  return normalizeBase(value).replace(/[^A-Z0-9]/g, '');
}

function isModeloDispositivoCompativel(
  modelo: ModeloSessaoMatchLike,
  tipoDispositivo: 'SIMULADOR' | 'AERONAVE',
): boolean {
  const tipoModelo = normalizeTipoDispositivo(modelo.tipo);

  if (tipoDispositivo === 'AERONAVE') {
    return tipoModelo === 'AERONAVE';
  }

  return tipoModelo !== 'AERONAVE';
}

function isModeloTipoSessaoCompativel(
  modelo: ModeloSessaoMatchLike,
  tipoSessao?: TipoSessaoMatchLike | null,
): boolean {
  if (!tipoSessao?.id && !tipoSessao?.codigo && !tipoSessao?.nome) {
    return true;
  }

  if (
    tipoSessao?.id &&
    modelo.tipo_sessao_id &&
    Number(modelo.tipo_sessao_id) === Number(tipoSessao.id)
  ) {
    return true;
  }

  const esperado = new Set(
    [tipoSessao?.codigo, tipoSessao?.nome].map(normalizeTipoSessao).filter(Boolean),
  );
  if (esperado.size === 0) {
    return false;
  }

  const tipoLegado = normalizeTipoDispositivo(modelo.tipo);
  const candidatos = [
    modelo.tipo_sessao_codigo,
    modelo.tipo_sessao_nome,
    tipoLegado !== 'SIMULADOR' && tipoLegado !== 'AERONAVE' ? modelo.tipo : null,
  ].map(normalizeTipoSessao);

  return candidatos.some((candidato) => esperado.has(candidato));
}

function isModeloEquipamentoCompativel(
  modelo: ModeloSessaoMatchLike,
  equipamento?: string | null,
): boolean {
  const esperado = normalizeModeloSessaoEquipamento(equipamento);
  if (!esperado) return true;

  const candidatos = [
    modelo.modelo_aeronave,
    modelo.codigo_aeronave,
    modelo.tipo_aeronave,
    modelo.equipamento,
    modelo.dispositivo,
  ].map(normalizeModeloSessaoEquipamento);

  if (candidatos.every((candidato) => !candidato)) {
    return true;
  }

  return candidatos.some((candidato) => candidato === esperado);
}

export function isModeloSessaoCompativel(
  modelo: ModeloSessaoMatchLike,
  params: Omit<FilterModelosSessaoForModalParams<ModeloSessaoMatchLike>, 'modelos'>,
): boolean {
  return (
    isModeloDispositivoCompativel(modelo, params.tipoDispositivo || 'SIMULADOR') &&
    isModeloTipoSessaoCompativel(modelo, params.tipoSessao) &&
    isModeloEquipamentoCompativel(modelo, params.equipamento)
  );
}

export function filterModelosSessaoForModal<T extends ModeloSessaoMatchLike>({
  modelos,
  tipoSessao,
  equipamento,
  tipoDispositivo = 'SIMULADOR',
}: FilterModelosSessaoForModalParams<T>): T[] {
  return modelos.filter((modelo) =>
    isModeloSessaoCompativel(modelo, { tipoSessao, equipamento, tipoDispositivo }),
  );
}

export function resolveEditModeloSelection({
  modelos,
  modeloSessaoId,
  isEditMode,
  templateId,
  temaSessao,
}: ResolveEditModeloSelectionParams) {
  if (!isEditMode || modeloSessaoId || modelos.length === 0) {
    return null;
  }

  if (templateId) {
    const modeloPorTemplate = modelos.find((m) => m.id === templateId);
    if (modeloPorTemplate) {
      return {
        id: modeloPorTemplate.id,
        temaSessao: modeloPorTemplate.nome,
        source: 'template_id' as const,
      };
    }
  }

  if (!temaSessao) {
    return null;
  }

  const modeloCorrespondente = modelos.find((m) => m.nome === temaSessao);
  if (!modeloCorrespondente) {
    return null;
  }

  return {
    id: modeloCorrespondente.id,
    temaSessao: modeloCorrespondente.nome,
    source: 'tema' as const,
  };
}

function hasCheckCodePrefix(
  checksSelecionados: number[],
  tiposCheck: TipoCheckLike[],
  prefixo: string,
): boolean {
  return checksSelecionados.some((checkId) => {
    const check = tiposCheck.find((item) => item.id === checkId);
    return String(check?.codigo || '')
      .toUpperCase()
      .startsWith(prefixo);
  });
}

export function deriveSpecialFichaFlags({
  checksSelecionados,
  tiposCheck,
  gerarFichaInstrutorManual,
  gerarFichaExaminadorManual,
}: DeriveSpecialFichaFlagsParams) {
  const hasFap07Selecionada = hasCheckCodePrefix(checksSelecionados, tiposCheck, 'FAP07');
  const hasFap13Selecionada = hasCheckCodePrefix(checksSelecionados, tiposCheck, 'FAP13');

  return {
    hasFap07Selecionada,
    hasFap13Selecionada,
    gerarFichaInstrutorEfetivo: gerarFichaInstrutorManual || hasFap07Selecionada,
    gerarFichaExaminadorEfetivo: gerarFichaExaminadorManual || hasFap13Selecionada,
  };
}

export function applyModelChangeDefaults({
  modeloAnteriorId,
  modeloId,
  checksPadrao,
}: ApplyModelChangeDefaultsParams) {
  if (modeloAnteriorId === modeloId) {
    return null;
  }

  return {
    checksSelecionados: checksPadrao,
    gerarFichaInstrutor: false,
    gerarFichaExaminador: false,
  };
}
