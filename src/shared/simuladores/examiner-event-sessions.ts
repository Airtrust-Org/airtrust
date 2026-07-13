export type ExaminerEventSessionCode = 'EXA-E01' | 'EXA-E02';

export interface ExaminerTechnicalBlockDefinition {
  id: 'A' | 'B';
  title: string;
  startOrder: number;
  endOrder: number;
}

export interface ExaminerEventSessionDefinition {
  code: ExaminerEventSessionCode;
  headerTitle: string;
  headerSubtitle: string;
  fullTitle: string;
  durationMinutes: 120;
  technicalBlocks: readonly [ExaminerTechnicalBlockDefinition, ExaminerTechnicalBlockDefinition];
}

const EXAMINER_EVENT_SESSION_DEFINITIONS: Record<
  ExaminerEventSessionCode,
  ExaminerEventSessionDefinition
> = {
  'EXA-E01': {
    code: 'EXA-E01',
    headerTitle: 'Treinamento Prático de Examinador 1/2',
    headerSubtitle: 'SOP Normal e Condução Inicial / SOP Anormal e Avaliação',
    fullTitle:
      'Treinamento Prático de Examinador 1/2 — SOP Normal e Condução Inicial / SOP Anormal e Avaliação',
    durationMinutes: 120,
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
    headerTitle: 'Treinamento Prático de Examinador 2/2',
    headerSubtitle: 'Emergência, Intervenção e Segurança / Atuação Integrada do Examinador',
    fullTitle:
      'Treinamento Prático de Examinador 2/2 — Emergência, Intervenção e Segurança / Atuação Integrada do Examinador',
    durationMinutes: 120,
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
};

export function normalizeExaminerEventSessionCode(
  code: string | null | undefined,
): ExaminerEventSessionCode | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized === 'EXA-E01' || normalized === 'EXA-E02') {
    return normalized;
  }
  return null;
}

export function getExaminerEventSessionDefinition(
  code: string | null | undefined,
): ExaminerEventSessionDefinition | null {
  const normalized = normalizeExaminerEventSessionCode(code);
  return normalized ? EXAMINER_EVENT_SESSION_DEFINITIONS[normalized] : null;
}

export function splitExaminerTechnicalBlocks<T extends { ordem: number }>(
  code: string | null | undefined,
  items: readonly T[],
): Array<{ definition: ExaminerTechnicalBlockDefinition; items: T[] }> | null {
  const definition = getExaminerEventSessionDefinition(code);
  if (!definition) return null;

  return definition.technicalBlocks.map((block) => ({
    definition: block,
    items: items.filter((item) => item.ordem >= block.startOrder && item.ordem <= block.endOrder),
  }));
}
