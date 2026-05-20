interface ModeloSessaoLike {
  id: number;
  nome: string;
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