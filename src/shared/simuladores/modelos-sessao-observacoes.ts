const INTERNAL_METADATA_LEAK_PATTERN = [
  'tipo_item\\s*=',
  'fase_voo\\s*=',
  'carater\\s*=',
  'fap_refs\\s*=',
  'matriz_v6_modelo\\s*=',
  'sourceNotes',
  'source_notes',
  '\\bprompt\\b',
  '\\bdebug\\b',
  '\\brbac\\b',
  '\\brole\\b',
  '\\btenant\\b',
  'empresa_id',
  '\\bauth\\b',
  '\\bjwt\\b',
  '\\btoken\\b',
  'auditoria\\s+interna',
  'bastidor(?:es)?\\s+t[eé]cnico',
  'instru[cç][aã]o\\s+de\\s+agente',
  '[{}]',
  `["'](?:source|metadata|internal|audit)["']`,
].join('|');

export const INTERNAL_METADATA_LEAK_RE = new RegExp(INTERNAL_METADATA_LEAK_PATTERN, 'i');

export const INVALID_MODELO_SESSAO_OBSERVACOES_MESSAGE =
  'observacoes contem metadado interno ou tecnico e nao podem ser usadas como override visivel da ficha';

function normalizeObservacoesText(value: unknown): string {
  return String(value || '').trim();
}

export function hasUnsafeModeloSessaoObservacoes(value: unknown): boolean {
  const normalized = normalizeObservacoesText(value);
  return normalized.length > 0 && INTERNAL_METADATA_LEAK_RE.test(normalized);
}

export function resolveModeloSessaoObservacoesOverride(value: unknown): string {
  const normalized = normalizeObservacoesText(value);
  if (!normalized) return '';
  return hasUnsafeModeloSessaoObservacoes(normalized) ? '' : normalized;
}

export function sanitizeModeloSessaoObservacoesForStorage(value: unknown): string | null {
  const normalized = resolveModeloSessaoObservacoesOverride(value);
  return normalized || null;
}

export function validateModeloSessaoObservacoesInput(value: unknown): {
  ok: true;
  value: string | null;
} | {
  ok: false;
  error: string;
} {
  const normalized = normalizeObservacoesText(value);
  if (!normalized) {
    return { ok: true, value: null };
  }

  if (hasUnsafeModeloSessaoObservacoes(normalized)) {
    return {
      ok: false,
      error: INVALID_MODELO_SESSAO_OBSERVACOES_MESSAGE,
    };
  }

  return { ok: true, value: normalized };
}
