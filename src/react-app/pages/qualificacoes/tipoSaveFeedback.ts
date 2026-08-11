export type TipoSaveDraft = {
  nome?: string | null;
  codigo?: string | null;
  /** Display-only legacy field. Never sent as functional identity. */
  categoria?: string | null;
  categoria_id?: number | string | null;
  conteudo_programatico?: string | null;
  carga_horaria_inicial?: number | string | null;
  carga_horaria_recorrente?: number | string | null;
  ativo?: number | boolean | null;
  vencimento_fim_mes?: number | boolean | null;
  is_check?: number | boolean | null;
  validade?: number | string | null;
  descricao?: string | null;
  observacoes?: string | null;
};

export type TipoUpdateResponseData = {
  id?: string | number;
  validade_anterior?: number | null;
  validade_nova?: number | null;
  historicos_recalculados?: number | null;
  historicos_ignorados?: number | null;
  warnings?: string[] | null;
};

/**
 * Constrói o payload para criar/atualizar um tipo de qualificação.
 * `categoria_id` é a única identidade funcional da categoria. O backend
 * deriva os snapshots de nome/código da linha tenant-scoped.
 * `validade` é SEMPRE incluído — null significa "remover vencimento".
 */
export function buildTipoPayload(editingTipo: TipoSaveDraft): Record<string, unknown> {
  const categoriaId = Number(editingTipo.categoria_id || 0);
  if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
    throw new Error('Selecione uma categoria válida');
  }

  const payload: Record<string, unknown> = {
    nome: editingTipo.nome?.trim() || '',
    codigo: editingTipo.codigo?.trim() || '',
    categoria_id: categoriaId,
    conteudo_programatico: editingTipo.conteudo_programatico?.trim() || null,
    carga_horaria_inicial:
      editingTipo.carga_horaria_inicial != null ? Number(editingTipo.carga_horaria_inicial) : null,
    carga_horaria_recorrente:
      editingTipo.carga_horaria_recorrente != null
        ? Number(editingTipo.carga_horaria_recorrente)
        : null,
    ativo: editingTipo.ativo ?? 1,
    vencimento_fim_mes: editingTipo.vencimento_fim_mes ?? 0,
    is_check: editingTipo.is_check ? 1 : 0,
    validade:
      editingTipo.validade != null && Number(editingTipo.validade) > 0
        ? Number(editingTipo.validade)
        : null,
  };

  if (editingTipo.descricao?.trim() || editingTipo.observacoes?.trim()) {
    payload.descricao = editingTipo.descricao?.trim() || editingTipo.observacoes?.trim() || null;
  }

  return payload;
}

export function getTipoRelatedCachePatterns() {
  return ['/qualificacoes/tipos', '/qualificacoes/historico', '/dashboard/qualificacoes'] as const;
}

export function buildTipoSaveSuccessMessage(
  data: TipoUpdateResponseData | null | undefined,
  isEdit: boolean,
) {
  const base = isEdit ? 'Modelo atualizado.' : 'Modelo criado.';
  const recalculados = Number(data?.historicos_recalculados || 0);
  const ignorados = Number(data?.historicos_ignorados || 0);
  const warnings = Array.isArray(data?.warnings) ? data?.warnings.filter(Boolean) : [];

  if (!isEdit) {
    return base;
  }

  const parts = [base];
  parts.push(`${recalculados} registro(s) de histórico recalculado(s).`);

  if (ignorados > 0) {
    parts.push(`${ignorados} registro(s) sem alteração.`);
  }

  if (warnings.length > 0) {
    parts.push(`Avisos: ${warnings.join(' | ')}`);
  }

  return parts.join(' ');
}
