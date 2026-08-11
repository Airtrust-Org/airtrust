export function buildTipoUpdatePayload(
  original: Record<string, unknown> | null | undefined,
  draft: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!original) return null;

  const payload: Record<string, unknown> = {};
  let hasChanges = false;

  const normalizeString = (val: unknown) => (typeof val === 'string' ? val.trim() : val) || null;
  const normalizeNumber = (val: unknown) => (val === '' || val == null ? null : Number(val));
  const normalizeBoolean = (val: unknown) => {
    if (val === 1 || val === '1' || val === true) return 1;
    if (val === 0 || val === '0' || val === false) return 0;
    return val;
  };

  const fields = [
    { key: 'nome', norm: normalizeString },
    { key: 'codigo', norm: normalizeString },
    // categoria is display-only; categoria_id is the sole functional identity.
    { key: 'categoria_id', norm: normalizeNumber },
    { key: 'validade', norm: normalizeNumber },
    { key: 'vencimento_fim_mes', norm: (v: unknown) => (v ? 1 : 0) },
    { key: 'carga_horaria_inicial', norm: normalizeNumber },
    { key: 'carga_horaria_recorrente', norm: normalizeNumber },
    { key: 'conteudo_programatico', norm: normalizeString },
    { key: 'descricao', norm: normalizeString },
    { key: 'observacoes', norm: normalizeString },
    { key: 'ativo', norm: normalizeBoolean },
    { key: 'is_check', norm: normalizeBoolean },
    { key: 'classe_requisito', norm: normalizeString },
  ];

  for (const { key, norm } of fields) {
    if (!Object.prototype.hasOwnProperty.call(draft, key)) {
      continue;
    }
    const origVal = norm(original[key]);
    const draftVal = norm(draft[key]);
    if (origVal !== draftVal) {
      payload[key] = draftVal;
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return null;
  }

  return payload;
}
