import { getSpecialEventSessionDefinition } from './special-event-sessions';

export const INSTRUCTION_SEAT_VALUES = [
  'ESQUERDO',
  'DIREITO',
  'AMBOS',
  'ESTACAO_INSTRUTOR',
] as const;

export type InstructionSeatValue = (typeof INSTRUCTION_SEAT_VALUES)[number];

const INSTRUCTION_SEAT_LABELS: Record<InstructionSeatValue, string> = {
  ESQUERDO: 'Esquerdo',
  DIREITO: 'Direito',
  AMBOS: 'Ambos',
  ESTACAO_INSTRUTOR: 'Estação do instrutor',
};

export function isInstructorSpecialSession(code: string | null | undefined): boolean {
  return getSpecialEventSessionDefinition(code)?.kind === 'instructor';
}

export function formatMinutesAsHHMM(
  minutes: number | null | undefined,
  fallback = 'N/A',
): string {
  if (!Number.isFinite(minutes) || Number(minutes) < 0) {
    return fallback;
  }

  const totalMinutes = Math.round(Number(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function decimalHoursToMinutes(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 60);
}

function normalizeComparableText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function normalizeInstructionSeatValue(
  value: string | null | undefined,
): InstructionSeatValue | null {
  const normalized = normalizeComparableText(value).replace(/\s+/g, '_');
  if ((INSTRUCTION_SEAT_VALUES as readonly string[]).includes(normalized)) {
    return normalized as InstructionSeatValue;
  }
  return null;
}

export function getInstructionSeatLabel(value: string | null | undefined): string {
  const normalized = normalizeInstructionSeatValue(value);
  return normalized ? INSTRUCTION_SEAT_LABELS[normalized] : String(value || '').trim();
}

export interface FichaHeaderField {
  label: string;
  value: string;
}

export type FichaHeaderRow = FichaHeaderField[];

export interface BuildFichaHeaderRowsParams {
  sessaoCodigo?: string | null;
  data?: string | null;
  horarioInicio?: string | null;
  horarioFim?: string | null;
  cargaHorariaTotal?: string | null;
  cargaHorariaPf?: string | null;
  cargaHorariaPm?: string | null;
  tripulanteNome?: string | null;
  tripulanteCodigoAnac?: string | null;
  tripulanteFuncao?: string | null;
  instrutorNome?: string | null;
  instrutorCodigoAnac?: string | null;
  simuladorDisplayName?: string | null;
  simuladorModelo?: string | null;
  equipamentoUtilizado?: string | null;
  dispositivoIdentificacao?: string | null;
  assentoInstrucaoUtilizado?: string | null;
}

function joinScheduleRange(
  horarioInicio: string | null | undefined,
  horarioFim: string | null | undefined,
): string {
  return [String(horarioInicio || '').trim(), String(horarioFim || '').trim()]
    .filter(Boolean)
    .join(' – ');
}

function getModeloDisplayValue(params: BuildFichaHeaderRowsParams): string {
  return (
    String(params.simuladorModelo || '').trim() ||
    String(params.equipamentoUtilizado || '').trim()
  );
}

export interface BuildFichaHeaderTitleParams {
  sessaoCodigo?: string | null;
  sessaoNome?: string | null;
}

export interface FichaHeaderTitle {
  title1: string;
  title2: string;
}

const FICHA_HEADER_TITLE_FIXO = 'FICHA DE TREINAMENTO DE VOO';

// title1 é sempre o texto fixo abaixo — inclusive para sessões especiais.
// Código e nome específicos ficam em title2 no formato "<código> — <nome>".
export function buildFichaHeaderTitle(params: BuildFichaHeaderTitleParams): FichaHeaderTitle {
  const specialDefinition = getSpecialEventSessionDefinition(params.sessaoCodigo);

  const codigo = String(params.sessaoCodigo || '').trim();
  const nome = String(specialDefinition?.headerTitle || params.sessaoNome || '').trim();

  const title2 = codigo && nome ? `${codigo} — ${nome}` : nome || codigo;

  return { title1: FICHA_HEADER_TITLE_FIXO, title2 };
}

export function buildFichaHeaderRows(params: BuildFichaHeaderRowsParams): FichaHeaderRow[] {
  const specialDefinition = getSpecialEventSessionDefinition(params.sessaoCodigo);
  const horario = joinScheduleRange(params.horarioInicio, params.horarioFim);
  const simulador = String(params.simuladorDisplayName || '').trim();

  if (specialDefinition) {
    const identityRows: FichaHeaderRow[] = [
      [
        { label: 'Data', value: String(params.data || '').trim() },
        { label: 'Horário', value: horario },
        { label: 'Carga Horária', value: String(params.cargaHorariaTotal || '').trim() },
        { label: 'Modelo', value: getModeloDisplayValue(params) },
      ],
      [
        {
          label: specialDefinition.participantLabel,
          value: String(params.tripulanteNome || '').trim(),
        },
        { label: 'ANAC', value: String(params.tripulanteCodigoAnac || '').trim() },
        {
          label: specialDefinition.supervisorLabel,
          value: String(params.instrutorNome || '').trim(),
        },
        { label: 'ANAC', value: String(params.instrutorCodigoAnac || '').trim() },
      ],
    ];

    if (specialDefinition.kind === 'instructor') {
      return [
        ...identityRows,
        [
          { label: 'Simulador', value: simulador },
          {
            label: 'Dispositivo/Matrícula',
            value: String(params.dispositivoIdentificacao || '').trim(),
          },
          {
            label: 'Assento',
            value: getInstructionSeatLabel(params.assentoInstrucaoUtilizado),
          },
        ],
      ];
    }

    return [
      ...identityRows,
      [
        { label: 'Simulador', value: simulador },
        {
          label: 'Dispositivo/Matrícula',
          value: String(params.dispositivoIdentificacao || '').trim(),
        },
      ],
    ];
  }

  return [
    [
      { label: 'Data', value: String(params.data || '').trim() },
      { label: 'Horário', value: horario },
      { label: 'Carga Horária', value: String(params.cargaHorariaTotal || '').trim() },
      { label: 'PF', value: String(params.cargaHorariaPf || '').trim() },
      { label: 'PM', value: String(params.cargaHorariaPm || '').trim() },
    ],
    [
      { label: 'Tripulante', value: String(params.tripulanteNome || '').trim() },
      { label: 'ANAC', value: String(params.tripulanteCodigoAnac || '').trim() },
      { label: 'Função', value: String(params.tripulanteFuncao || '').trim() },
    ],
    [
      { label: 'Instrutor', value: String(params.instrutorNome || '').trim() },
      { label: 'ANAC', value: String(params.instrutorCodigoAnac || '').trim() },
      { label: 'Simulador', value: simulador },
      { label: 'Modelo', value: getModeloDisplayValue(params) },
    ],
  ];
}

export function buildSimulatorDisplayName({
  simulatorCode,
  simulatorName,
  simulatorModel,
}: {
  simulatorCode?: string | null;
  simulatorName?: string | null;
  simulatorModel?: string | null;
}): string {
  const name = String(simulatorName || '').trim();
  const code = String(simulatorCode || '').trim();
  const model = normalizeComparableText(simulatorModel);
  const comparableCode = normalizeComparableText(code);
  const comparableName = normalizeComparableText(name);

  const shouldUseCode =
    comparableCode &&
    comparableCode !== model &&
    comparableCode !== comparableName &&
    !comparableName.includes(comparableCode);

  if (shouldUseCode && name) {
    return `${code} — ${name}`;
  }

  if (name) return name;
  if (code) return code;
  if (simulatorModel) return String(simulatorModel).trim();
  return 'N/A';
}

export function resolveOperationalHours(params: {
  segmentTotalMinutes?: number | null;
  segmentPfMinutes?: number | null;
  segmentPmMinutes?: number | null;
  canonicalPfHours?: string | number | null;
  canonicalPmHours?: string | number | null;
  fallbackTotalMinutes?: number | null;
  participantCount?: number | null;
}): {
  totalMinutes: number;
  pfMinutes: number;
  pmMinutes: number;
} {
  const segmentTotal = Number(params.segmentTotalMinutes || 0);
  const segmentPf = Number(params.segmentPfMinutes || 0);
  const segmentPm = Number(params.segmentPmMinutes || 0);

  if (segmentTotal > 0 || segmentPf > 0 || segmentPm > 0) {
    const totalMinutes = segmentTotal > 0 ? segmentTotal : segmentPf + segmentPm;
    return {
      totalMinutes,
      pfMinutes: segmentPf,
      pmMinutes: segmentPm,
    };
  }

  const canonicalPf = decimalHoursToMinutes(params.canonicalPfHours) ?? 0;
  const canonicalPm = decimalHoursToMinutes(params.canonicalPmHours) ?? 0;
  if (canonicalPf > 0 || canonicalPm > 0) {
    return {
      totalMinutes: canonicalPf + canonicalPm,
      pfMinutes: canonicalPf,
      pmMinutes: canonicalPm,
    };
  }

  const fallbackTotal = Math.max(0, Math.round(Number(params.fallbackTotalMinutes || 0)));
  if (fallbackTotal > 0 && Number(params.participantCount || 0) === 2) {
    const pfMinutes = Math.ceil(fallbackTotal / 2);
    const pmMinutes = fallbackTotal - pfMinutes;
    return {
      totalMinutes: fallbackTotal,
      pfMinutes,
      pmMinutes,
    };
  }

  return {
    totalMinutes: fallbackTotal,
    pfMinutes: 0,
    pmMinutes: 0,
  };
}
