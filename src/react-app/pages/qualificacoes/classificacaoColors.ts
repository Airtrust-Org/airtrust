type TagVariant = 'category' | 'format';

type TagAppearance = {
  className: string;
  style: {
    backgroundColor: string;
    color: string;
    borderColor: string;
    borderWidth: number;
    borderStyle: 'solid';
  };
};

const NEUTRAL_HEX = '#6B7280';
const DEFAULT_TEXT_HEX = '#64748B';

const FORMAT_COLOR_FALLBACKS: Record<string, string> = {
  DOCUMENTAL: '#0F766E',
  EAD: '#2563EB',
  PRESENCIAL: '#F97316',
  REMOTO: '#8B5CF6',
  SIMULADOR: '#DB2777',
  VOO: '#14B8A6',
  NAO_CLASSIFICADO: '#64748B',
};

const CATEGORY_COLOR_FALLBACKS: Record<string, string> = {
  CHECK: '#10B981',
  EAD: '#EAB308',
  EXAME: '#A855F7',
  LICENCA: '#2563EB',
  OUTROS: '#6B7280',
  QUALIDADE: '#DB3DBe',
  TEORICO: '#3B82F6',
  TREINAMENTO_TEORICO: '#3B82F6',
  TREINAMENTOTEORICO: '#3B82F6',
  VOO: '#F97316',
  DOUTRINACAO: '#14B8A6',
  PRODUTO: '#EF4444',
  TECNICO_ESPECIALIZADO: '#F59E0B',
  CORRETIVO: '#EC4899',
  EM_SERVICO_OJT: '#8B5CF6',
  EM_SERVICO_OJT_ESTRUTURADO: '#6366F1',
};

function normalizeKey(value?: string | null) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeHex(value?: string | null) {
  const raw = String(value ?? '')
    .trim()
    .replace(/['"]/g, '');

  if (!raw) return null;

  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    const [, short] = /^#([0-9a-fA-F]{3})$/.exec(hex) ?? [];
    if (!short) return null;
    return `#${short
      .split('')
      .map((char) => char + char)
      .join('')
      .toUpperCase()}`;
  }

  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return hex.toUpperCase();
  }

  return null;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = normalizeHex(hex);
  if (!normalized) return `rgba(100, 116, 139, ${alpha})`;

  const parsed = normalized.slice(1);
  const red = Number.parseInt(parsed.slice(0, 2), 16);
  const green = Number.parseInt(parsed.slice(2, 4), 16);
  const blue = Number.parseInt(parsed.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isNeutralColor(hex?: string | null) {
  const normalized = normalizeHex(hex);
  return normalized === NEUTRAL_HEX;
}

export function resolveClassificationTagColor(params: {
  variant: TagVariant;
  label?: string | null;
  code?: string | null;
  color?: string | null;
}) {
  const normalizedExplicit = normalizeHex(params.color);

  if (normalizedExplicit && !(params.variant === 'format' && isNeutralColor(normalizedExplicit))) {
    return normalizedExplicit;
  }

  const fallbackMap =
    params.variant === 'format' ? FORMAT_COLOR_FALLBACKS : CATEGORY_COLOR_FALLBACKS;
  const key = normalizeKey(params.code ?? params.label);

  return fallbackMap[key] ?? normalizedExplicit ?? DEFAULT_TEXT_HEX;
}

export function resolveClassificationTagAppearance(params: {
  variant: TagVariant;
  label?: string | null;
  code?: string | null;
  color?: string | null;
}): TagAppearance {
  const resolvedColor = resolveClassificationTagColor(params);
  const backgroundOpacity = params.variant === 'format' ? 0.12 : 0.14;
  const borderOpacity = params.variant === 'format' ? 0.38 : 0.3;

  return {
    className:
      params.variant === 'format'
        ? 'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold'
        : 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
    style: {
      backgroundColor: hexToRgba(resolvedColor, backgroundOpacity),
      color: resolvedColor,
      borderColor: hexToRgba(resolvedColor, borderOpacity),
      borderWidth: 1,
      borderStyle: 'solid',
    },
  };
}
