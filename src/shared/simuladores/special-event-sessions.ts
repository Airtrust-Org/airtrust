export type ExaminerEventSessionCode = 'EXA-E01' | 'EXA-E02';
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
  durationMinutes: 120;
  participantLabel: string;
  supervisorLabel: string;
  hideTripulanteBadge: true;
  technicalBlocks: readonly [SpecialTechnicalBlockDefinition, SpecialTechnicalBlockDefinition?];
}

const SPECIAL_EVENT_SESSION_DEFINITIONS: Record<
  SpecialEventSessionCode,
  SpecialEventSessionDefinition
> = {
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
    headerSubtitle:
      'Procedimentos Normais e Técnica de Instrução / Procedimentos Anormais e Gerenciamento do Erro',
    fullTitle:
      'Treinamento Prático de Instrutor 1/2 — Procedimentos Normais e Técnica de Instrução / Procedimentos Anormais e Gerenciamento do Erro',
    durationMinutes: 120,
    participantLabel: 'Instrutor-aluno',
    supervisorLabel: 'Instrutor supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Módulo 1 — Procedimentos Normais e Técnica de Instrução',
        startOrder: 1,
        endOrder: 9,
      },
      {
        id: 'B',
        title: 'Módulo 2 — Procedimentos Anormais e Gerenciamento do Erro',
        startOrder: 10,
        endOrder: 18,
      },
    ],
  },
  'INST-E02': {
    code: 'INST-E02',
    kind: 'instructor',
    headerTitle: 'Treinamento Prático de Instrutor 2/2',
    headerSubtitle: 'Emergências, Intervenção e Atuação Integrada do Instrutor',
    fullTitle:
      'Treinamento Prático de Instrutor 2/2 — Emergências, Intervenção e Atuação Integrada do Instrutor',
    durationMinutes: 120,
    participantLabel: 'Instrutor-aluno',
    supervisorLabel: 'Instrutor supervisor',
    hideTripulanteBadge: true,
    technicalBlocks: [
      {
        id: 'A',
        title: 'Módulo 3 — Emergências, Intervenção e Atuação Integrada',
        startOrder: 1,
        endOrder: 18,
      },
    ],
  },
};

export function normalizeSpecialEventSessionCode(
  code: string | null | undefined,
): SpecialEventSessionCode | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (
    normalized === 'EXA-E01' ||
    normalized === 'EXA-E02' ||
    normalized === 'INST-E01' ||
    normalized === 'INST-E02'
  ) {
    return normalized;
  }
  return null;
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
