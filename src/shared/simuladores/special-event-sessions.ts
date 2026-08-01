export type CanonicalExaminerSessionCode =
  | 'EXA-01/04'
  | 'EXA-02/04'
  | 'EXA-03/04'
  | 'EXA-04/04';
export type LegacyExaminerEventSessionCode = 'EXA-E01' | 'EXA-E02';
export type ExaminerEventSessionCode =
  | CanonicalExaminerSessionCode
  | LegacyExaminerEventSessionCode;
export type InstructorEventSessionCode = 'INST-E01' | 'INST-E02';
export type SpecialEventSessionCode = ExaminerEventSessionCode | InstructorEventSessionCode;

export interface SpecialTechnicalBlockDefinition {
  id: 'A' | 'B';
  title: string;
  startOrder: number;
  endOrder: number;
}

export interface SpecialEventSessionDefinition {
  code: SpecialEventSessionCode;
  kind: 'examiner' | 'instructor';
  headerTitle: string;
  headerSubtitle: string;
  fullTitle: string;
  durationMinutes: number;
  participantLabel: string;
  supervisorLabel: string;
  hideTripulanteBadge: true;
  legacy?: boolean;
  technicalBlocks: readonly [SpecialTechnicalBlockDefinition, SpecialTechnicalBlockDefinition?];
}

const SPECIAL_EVENT_SESSION_DEFINITIONS: Record<
  SpecialEventSessionCode,
  SpecialEventSessionDefinition
> = {
  'EXA-01/04': {
    code: 'EXA-01/04',
    kind: 'examiner',
    headerTitle: 'Treinamento Prático de Examinador 1/4',
    headerSubtitle: 'Procedimentos Normais e Condução sem Coaching',
    fullTitle:
      'Treinamento Prático de Examinador 1/4 — Procedimentos Normais e Condução sem Coaching',
    durationMinutes: 60,
    participantLabel: 'Examinador-aluno',
    supervisorLabel: 'Examinador supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Sessão 1 — Procedimentos Normais e Condução sem Coaching',
        startOrder: 1,
        endOrder: 18,
      },
    ],
  },
  'EXA-02/04': {
    code: 'EXA-02/04',
    kind: 'examiner',
    headerTitle: 'Treinamento Prático de Examinador 2/4',
    headerSubtitle: 'Procedimentos Não Normais e Avaliação',
    fullTitle:
      'Treinamento Prático de Examinador 2/4 — Procedimentos Não Normais e Avaliação',
    durationMinutes: 60,
    participantLabel: 'Examinador-aluno',
    supervisorLabel: 'Examinador supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Sessão 2 — Procedimentos Não Normais e Avaliação',
        startOrder: 1,
        endOrder: 18,
      },
    ],
  },
  'EXA-03/04': {
    code: 'EXA-03/04',
    kind: 'examiner',
    headerTitle: 'Treinamento Prático de Examinador 3/4',
    headerSubtitle: 'Emergências, Intervenção e Segurança',
    fullTitle:
      'Treinamento Prático de Examinador 3/4 — Emergências, Intervenção e Segurança',
    durationMinutes: 60,
    participantLabel: 'Examinador-aluno',
    supervisorLabel: 'Examinador supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Sessão 3 — Emergências, Intervenção e Segurança',
        startOrder: 1,
        endOrder: 18,
      },
    ],
  },
  'EXA-04/04': {
    code: 'EXA-04/04',
    kind: 'examiner',
    headerTitle: 'Treinamento Prático de Examinador 4/4',
    headerSubtitle: 'Condução Integral do Exame',
    fullTitle: 'Treinamento Prático de Examinador 4/4 — Condução Integral do Exame',
    durationMinutes: 60,
    participantLabel: 'Examinador-aluno',
    supervisorLabel: 'Examinador supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Sessão 4 — Condução Integral do Exame',
        startOrder: 1,
        endOrder: 18,
      },
    ],
  },
  'EXA-E01': {
    code: 'EXA-E01',
    kind: 'examiner',
    headerTitle: 'Treinamento Prático de Examinador 1/2',
    headerSubtitle: 'SOP Normal e Condução Inicial / SOP Anormal e Avaliação',
    fullTitle:
      'Treinamento Prático de Examinador 1/2 — SOP Normal e Condução Inicial / SOP Anormal e Avaliação',
    durationMinutes: 120,
    participantLabel: 'Participante',
    supervisorLabel: 'Supervisor',
    hideTripulanteBadge: true,
    legacy: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Bloco A — SOP Normal e Condução Inicial',
        startOrder: 1,
        endOrder: 9,
      },
      {
        id: 'B',
        title: 'Bloco B — SOP Anormal e Avaliação',
        startOrder: 10,
        endOrder: 18,
      },
    ],
  },
  'EXA-E02': {
    code: 'EXA-E02',
    kind: 'examiner',
    headerTitle: 'Treinamento Prático de Examinador 2/2',
    headerSubtitle: 'Emergência, Intervenção e Segurança / Atuação Integrada do Examinador',
    fullTitle:
      'Treinamento Prático de Examinador 2/2 — Emergência, Intervenção e Segurança / Atuação Integrada do Examinador',
    durationMinutes: 120,
    participantLabel: 'Participante',
    supervisorLabel: 'Supervisor',
    hideTripulanteBadge: true,
    legacy: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Bloco A — Emergência, Intervenção e Segurança',
        startOrder: 1,
        endOrder: 9,
      },
      {
        id: 'B',
        title: 'Bloco B — Atuação Integrada do Examinador',
        startOrder: 10,
        endOrder: 18,
      },
    ],
  },
  'INST-E01': {
    code: 'INST-E01',
    kind: 'instructor',
    headerTitle: 'Treinamento Prático de Instrutor 1/2',
    headerSubtitle: 'Procedimentos Normais e Técnica de Instrução',
    fullTitle:
      'Treinamento Prático de Instrutor 1/2 — Procedimentos Normais e Técnica de Instrução',
    durationMinutes: 60,
    participantLabel: 'Instrutor-aluno',
    supervisorLabel: 'Instrutor supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Sessão 1 — Procedimentos Normais e Técnica de Instrução',
        startOrder: 1,
        endOrder: 18,
      },
    ],
  },
  'INST-E02': {
    code: 'INST-E02',
    kind: 'instructor',
    headerTitle: 'Treinamento Prático de Instrutor 2/2',
    headerSubtitle: 'Procedimentos Anormais, Emergências e Atuação Integrada do Instrutor',
    fullTitle:
      'Treinamento Prático de Instrutor 2/2 — Procedimentos Anormais, Emergências e Atuação Integrada do Instrutor',
    durationMinutes: 120,
    participantLabel: 'Instrutor-aluno',
    supervisorLabel: 'Instrutor supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Sessão 2 — Procedimentos Anormais, Emergências e Atuação Integrada',
        startOrder: 1,
        endOrder: 18,
      },
    ],
  },
};

export function normalizeSpecialEventSessionCode(
  code: string | null | undefined,
): SpecialEventSessionCode | null {
  const normalized = String(code || '').trim().toUpperCase() as SpecialEventSessionCode;
  return Object.prototype.hasOwnProperty.call(SPECIAL_EVENT_SESSION_DEFINITIONS, normalized)
    ? normalized
    : null;
}

export function getSpecialEventSessionDefinition(
  code: string | null | undefined,
): SpecialEventSessionDefinition | null {
  const normalized = normalizeSpecialEventSessionCode(code);
  return normalized ? SPECIAL_EVENT_SESSION_DEFINITIONS[normalized] : null;
}

export function getExaminerEventSessionDefinition(
  code: string | null | undefined,
): SpecialEventSessionDefinition | null {
  const definition = getSpecialEventSessionDefinition(code);
  return definition?.kind === 'examiner' ? definition : null;
}

export function splitSpecialTechnicalBlocks<T extends { ordem: number }>(
  code: string | null | undefined,
  items: readonly T[],
): Array<{ definition: SpecialTechnicalBlockDefinition; items: T[] }> | null {
  const definition = getSpecialEventSessionDefinition(code);
  if (!definition) return null;

  return definition.technicalBlocks
    .filter(Boolean)
    .map((block) => ({
      definition: block as SpecialTechnicalBlockDefinition,
      items: items.filter(
        (item) => item.ordem >= block!.startOrder && item.ordem <= block!.endOrder,
      ),
    }));
}

export function splitExaminerTechnicalBlocks<T extends { ordem: number }>(
  code: string | null | undefined,
  items: readonly T[],
): Array<{ definition: SpecialTechnicalBlockDefinition; items: T[] }> | null {
  const definition = getExaminerEventSessionDefinition(code);
  if (!definition) return null;
  return splitSpecialTechnicalBlocks(code, items);
}
