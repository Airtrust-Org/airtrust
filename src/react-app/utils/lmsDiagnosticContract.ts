/**
 * AIRTRUST_COMPLETION_DIAGNOSTICS_V1 — contrato de diagnóstico granular emitido
 * pelo pacote SCORM via postMessage.
 *
 * IMPORTANTE: este payload é INFORMATIVO. Ele nunca altera lesson_status, score,
 * status de matrícula, qualificação ou certificado. A autoridade canônica
 * permanece em `completion_diagnostic` (backend,
 * worker-airtrust/src/services/lms-progress-guardrails.ts).
 */

export const DIAGNOSTICS_VERSION = 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1';

/** Limite defensivo do payload serializado (bytes aproximados via length). */
export const MAX_DIAGNOSTIC_PAYLOAD_CHARS = 64_000;
/** Limite de itens por coleção, para evitar explosão de UI. */
export const MAX_ITEMS_PER_COLLECTION = 200;
/** Limite de caracteres por string sanitizada. */
export const MAX_TEXT_LENGTH = 200;

export type LmsPendingCategory =
  | 'CONTENT'
  | 'ASSESSMENT'
  | 'SCORE'
  | 'SCORM_STATUS'
  | 'ADMIN'
  | 'UNKNOWN';

export interface LmsDiagnosticSlideRef {
  id: string | null;
  index: number | null;
  title: string | null;
}

export type LmsDiagnosticModuleRef = LmsDiagnosticSlideRef;

export interface LmsDiagnosticModuleResult {
  module: LmsDiagnosticModuleRef;
  assessment: {
    required: boolean;
    completed: boolean;
    scoreRaw: number | null;
    masteryScore: number | null;
    passed: boolean | null;
  };
}

export interface LmsGranularDiagnostic {
  version: 1;
  courseId: string | null;
  currentSlide: LmsDiagnosticSlideRef | null;
  slides: {
    totalRequired: number | null;
    completedRequired: number | null;
    missing: LmsDiagnosticSlideRef[];
  };
  assessment: {
    required: boolean;
    completed: boolean;
    scoreRaw: number | null;
    masteryScore: number | null;
    passed: boolean | null;
    unanswered: LmsDiagnosticSlideRef[];
    incomplete: LmsDiagnosticSlideRef[];
  };
  /**
   * Resultados por módulo. Campo opcional no payload bruto para preservar
   * compatibilidade com pacotes Diagnostics V1 já publicados; o parser sempre
   * normaliza a ausência para [].
   */
  moduleResults: LmsDiagnosticModuleResult[];
  packageStatus: {
    lessonStatus: string | null;
    finishRequested: boolean;
  };
  updatedAt: string | null;
}

export interface LmsPendingItem {
  category: LmsPendingCategory;
  /** Texto pronto para exibição ao aluno. Nunca contém respostas corretas. */
  label: string;
  /** Referência opcional ao slide/questão/módulo, quando o pacote informou. */
  ref: LmsDiagnosticSlideRef | null;
  /** true quando o item é responsabilidade do administrador, não do aluno. */
  adminActionable: boolean;
}

export interface LmsCompletionExplanation {
  canComplete: boolean;
  category: LmsPendingCategory;
  summary: string;
  items: LmsPendingItem[];
  /** Itens de responsabilidade administrativa, rastreados separadamente. */
  adminItems: LmsPendingItem[];
  /** false quando nenhum payload granular V1 válido está disponível (pacote legado). */
  diagnosticsAvailable: boolean;
}

export const GENERIC_PENDING_FALLBACK =
  'O curso informou que ainda há pendências, mas não identificou quais itens.';

/* -------------------------------------------------------------------------- */
/* Sanitização                                                                 */
/* -------------------------------------------------------------------------- */

/** Remove controles, colapsa espaços e limita o tamanho. Nunca lança. */
export function sanitizeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function sanitizeFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function sanitizeBoolean(value: unknown): boolean {
  return value === true;
}

function sanitizeSlideRef(value: unknown): LmsDiagnosticSlideRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = sanitizeText(raw.id, 120);
  const index = sanitizeFiniteNumber(raw.index);
  const title = sanitizeText(raw.title);
  if (id === null && index === null && title === null) return null;
  return { id, index, title };
}

function sanitizeSlideRefList(value: unknown): LmsDiagnosticSlideRef[] {
  if (!Array.isArray(value)) return [];
  const out: LmsDiagnosticSlideRef[] = [];
  for (const entry of value.slice(0, MAX_ITEMS_PER_COLLECTION)) {
    const ref = sanitizeSlideRef(entry);
    if (ref) out.push(ref);
  }
  return out;
}

function sanitizeModuleResultList(value: unknown): LmsDiagnosticModuleResult[] {
  if (!Array.isArray(value)) return [];
  const out: LmsDiagnosticModuleResult[] = [];

  for (const entry of value.slice(0, MAX_ITEMS_PER_COLLECTION)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const module = sanitizeSlideRef(raw.module);
    if (!module) continue;

    const assessmentRaw =
      raw.assessment && typeof raw.assessment === 'object' && !Array.isArray(raw.assessment)
        ? (raw.assessment as Record<string, unknown>)
        : {};
    const passedRaw = assessmentRaw.passed;

    out.push({
      module,
      assessment: {
        required: sanitizeBoolean(assessmentRaw.required),
        completed: sanitizeBoolean(assessmentRaw.completed),
        scoreRaw: sanitizeFiniteNumber(assessmentRaw.scoreRaw),
        masteryScore: sanitizeFiniteNumber(assessmentRaw.masteryScore),
        passed: typeof passedRaw === 'boolean' ? passedRaw : null,
      },
    });
  }

  return out;
}

/**
 * Valida e normaliza um payload bruto vindo de postMessage.
 *
 * Retorna `null` para qualquer payload inválido/malformado — o chamador deve
 * simplesmente ignorar, sem quebrar o curso.
 *
 * Campos desconhecidos são descartados. Qualquer id de matrícula/empresa/curso
 * que o payload tente afirmar é IGNORADO para fins de contexto: `courseId` é
 * mantido apenas como rótulo informativo e nunca deve ser usado para
 * autorização ou roteamento.
 */
export function parseGranularDiagnostic(raw: unknown): LmsGranularDiagnostic | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;

  if (data.version !== 1) return null;

  // Cap defensivo de tamanho.
  try {
    const serialized = JSON.stringify(data);
    if (typeof serialized !== 'string' || serialized.length > MAX_DIAGNOSTIC_PAYLOAD_CHARS) {
      return null;
    }
  } catch {
    // Estruturas circulares / não serializáveis são rejeitadas.
    return null;
  }

  const slidesRaw =
    data.slides && typeof data.slides === 'object' && !Array.isArray(data.slides)
      ? (data.slides as Record<string, unknown>)
      : {};
  const assessmentRaw =
    data.assessment && typeof data.assessment === 'object' && !Array.isArray(data.assessment)
      ? (data.assessment as Record<string, unknown>)
      : {};
  const statusRaw =
    data.packageStatus && typeof data.packageStatus === 'object' && !Array.isArray(data.packageStatus)
      ? (data.packageStatus as Record<string, unknown>)
      : {};

  const passedRaw = assessmentRaw.passed;

  return {
    version: 1,
    courseId: sanitizeText(data.courseId, 120),
    currentSlide: sanitizeSlideRef(data.currentSlide),
    slides: {
      totalRequired: sanitizeFiniteNumber(slidesRaw.totalRequired),
      completedRequired: sanitizeFiniteNumber(slidesRaw.completedRequired),
      missing: sanitizeSlideRefList(slidesRaw.missing),
    },
    assessment: {
      required: sanitizeBoolean(assessmentRaw.required),
      completed: sanitizeBoolean(assessmentRaw.completed),
      scoreRaw: sanitizeFiniteNumber(assessmentRaw.scoreRaw),
      masteryScore: sanitizeFiniteNumber(assessmentRaw.masteryScore),
      passed: typeof passedRaw === 'boolean' ? passedRaw : null,
      unanswered: sanitizeSlideRefList(assessmentRaw.unanswered),
      incomplete: sanitizeSlideRefList(assessmentRaw.incomplete),
    },
    moduleResults: sanitizeModuleResultList(data.moduleResults),
    packageStatus: {
      lessonStatus: sanitizeText(statusRaw.lessonStatus, 60),
      finishRequested: sanitizeBoolean(statusRaw.finishRequested),
    },
    updatedAt: sanitizeText(data.updatedAt, 40),
  };
}

/* -------------------------------------------------------------------------- */
/* Formatação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Nome amigável de um item. Usa o título fornecido pelo pacote quando existir
 * ("Slide 12 — Sistema Hidráulico"); caso contrário, cai para um rótulo
 * genérico. Nunca inventa títulos.
 */
export function formatPendingItemDisplay(
  ref: LmsDiagnosticSlideRef | null,
  kind: 'slide' | 'question',
): string {
  const noun = kind === 'question' ? 'Questão' : 'Slide';
  if (!ref) return noun;
  const position = ref.index !== null ? `${noun} ${ref.index}` : ref.id ? `${noun} ${ref.id}` : noun;
  return ref.title ? `${position} — ${ref.title}` : position;
}

export function formatPendingModuleDisplay(ref: LmsDiagnosticModuleRef): string {
  const position =
    ref.index !== null ? `Módulo ${ref.index}` : ref.id ? `Módulo ${ref.id}` : 'Módulo';
  return ref.title ? `${position} — ${ref.title}` : position;
}

/* -------------------------------------------------------------------------- */
/* Motor de explicação                                                         */
/* -------------------------------------------------------------------------- */

/** Subconjunto do diagnóstico canônico do backend usado pelo motor. */
export interface CanonicalCompletionDiagnosticLike {
  status?: string | null;
  code?: string | null;
  can_finalize?: boolean | null;
  explicit_failure?: boolean | null;
  mastery_score?: number | null;
  score_pct?: number | null;
}

function adminItem(label: string): LmsPendingItem {
  return { category: 'ADMIN', label, ref: null, adminActionable: true };
}

function moduleAssessmentFailed(result: LmsDiagnosticModuleResult): boolean {
  if (!result.assessment.required) return false;
  if (!result.assessment.completed) return false; // incomplete is not a failure of score
  if (result.assessment.passed === false) return true;
  const { scoreRaw, masteryScore } = result.assessment;
  return scoreRaw !== null && masteryScore !== null && scoreRaw < masteryScore;
}

function formatModuleFailure(result: LmsDiagnosticModuleResult): string {
  const moduleLabel = formatPendingModuleDisplay(result.module);
  const { scoreRaw, masteryScore } = result.assessment;
  if (scoreRaw != null && masteryScore != null) {
    return `${moduleLabel} — Nota obtida ${formatScore(scoreRaw)} — mínimo exigido ${formatScore(masteryScore)}.`;
  }
  return `${moduleLabel} — avaliação abaixo da nota mínima.`;
}

/**
 * Explica, para o aluno, por que a conclusão não foi aceita.
 *
 * Prioridade: ADMIN > reprovação/nota > questões pendentes > slides pendentes >
 * incomplete sem granularidade > UNKNOWN.
 *
 * Função pura: não faz I/O e nunca altera estado canônico.
 */
export function resolveCompletionExplanation(params: {
  canonical?: CanonicalCompletionDiagnosticLike | null;
  granular?: LmsGranularDiagnostic | null;
}): LmsCompletionExplanation {
  const canonical = params?.canonical ?? null;
  const granular = params?.granular ?? null;
  const diagnosticsAvailable = granular !== null;

  const canComplete = canonical?.can_finalize === true;
  if (canComplete) {
    return {
      canComplete: true,
      category: 'CONTENT',
      summary: 'Todos os requisitos para conclusão foram atendidos.',
      items: [],
      adminItems: [],
      diagnosticsAvailable,
    };
  }

  const adminItems: LmsPendingItem[] = [];

  // --- Prioridade 1: ADMIN (configuração do curso/pacote) -------------------
  if (canonical?.code === 'SCORM_STATUS_INCONSISTENT') {
    adminItems.push(
      adminItem(
        'O pacote do curso reportou um estado inconsistente. Contate o administrador do treinamento.',
      ),
    );
  }
  if (canonical?.code === 'SCORM_FINAL_COMMIT_MISSING') {
    adminItems.push(
      adminItem(
        'O curso não registrou o envio final. Se o problema persistir, contate o administrador do treinamento.',
      ),
    );
  }
  if (adminItems.length > 0) {
    return {
      canComplete: false,
      category: 'ADMIN',
      summary: 'Há uma pendência de configuração ou registro que precisa de suporte administrativo.',
      items: [],
      adminItems,
      diagnosticsAvailable,
    };
  }

  // Autoridade canônica: score/mastery/decisão canônicos, quando presentes,
  // vencem o snapshot granular (que é apenas explicativo e pode estar stale).
  const scorePct = canonical?.score_pct ?? null;
  const masteryCanonical = canonical?.mastery_score ?? null;
  const canonicalScoreEvidence = scorePct !== null && masteryCanonical !== null;
  const canonicalIndicatesPass = canonicalScoreEvidence && (scorePct as number) >= (masteryCanonical as number);
  // "decisão canônica atual que não indique reprovação"
  const canonicalNonFailure = canonical?.explicit_failure === false || canonicalIndicatesPass;

  // --- Prioridade 2A: módulos identificados (reprovados ou incompletos) -----
  // moduleResults stale não pode contradizer uma decisão canônica atual de não-reprovação.
  const failedModules = canonicalNonFailure
    ? []
    : (granular?.moduleResults ?? []).filter(moduleAssessmentFailed);
    
  const incompleteModules = canonicalNonFailure
    ? []
    : (granular?.moduleResults ?? []).filter((r) => r.assessment.required && !r.assessment.completed);

  const pendingModules = [...failedModules, ...incompleteModules];

  if (pendingModules.length > 0) {
    return {
      canComplete: false,
      category: failedModules.length > 0 ? 'SCORE' : 'CONTENT',
      summary:
        pendingModules.length === 1 && failedModules.length === 1
          ? 'Há 1 módulo com avaliação abaixo do mínimo exigido.'
          : pendingModules.length === failedModules.length
          ? `Há ${failedModules.length} módulos com avaliação abaixo do mínimo exigido.`
          : pendingModules.length === 1
          ? 'Há 1 módulo com pendência na avaliação.'
          : `Há ${pendingModules.length} módulos com pendências nas avaliações.`,
      items: pendingModules.map((result) => {
        const isFailed = moduleAssessmentFailed(result);
        const moduleLabel = formatPendingModuleDisplay(result.module);
        const label = isFailed
          ? formatModuleFailure(result)
          : `${moduleLabel} — avaliação não concluída.`;
        return {
          category: isFailed ? 'SCORE' : ('CONTENT' as const),
          label,
          ref: result.module,
          adminActionable: false,
        };
      }),
      adminItems,
      diagnosticsAvailable,
    };
  }

  // --- Prioridade 2B: reprovação / nota global abaixo da mínima -------------
  const granularScore = granular?.assessment?.scoreRaw ?? null;
  const granularMastery = granular?.assessment?.masteryScore ?? null;
  // Canônico ganha sempre que presente; granular é só fallback quando ausente.
  const obtained = scorePct ?? granularScore;
  const minimum = masteryCanonical ?? granularMastery;

  // O flag de reprovação granular (passed === false) só é considerado quando o
  // canônico não apresenta evidência atual de aprovação/não-reprovação.
  const trustGranularFailFlag = !canonicalNonFailure && granular?.assessment?.passed === false;
  const failedByFlag = canonical?.explicit_failure === true || trustGranularFailFlag;
  const failedByScore =
    !canonicalIndicatesPass && obtained !== null && minimum !== null && obtained < minimum;

  if (failedByFlag || failedByScore) {
    const label =
      obtained !== null && minimum !== null
        ? `Nota obtida ${formatScore(obtained)} — mínimo exigido ${formatScore(minimum)}.`
        : 'A avaliação do curso não atingiu a nota mínima exigida.';
    return {
      canComplete: false,
      category: 'SCORE',
      summary: 'A nota obtida na avaliação está abaixo do mínimo exigido.',
      items: [{ category: 'SCORE', label, ref: null, adminActionable: false }],
      adminItems,
      diagnosticsAvailable,
    };
  }

  // --- Prioridade 3: questões pendentes ------------------------------------
  const unanswered = granular?.assessment?.unanswered ?? [];
  const incompleteQuestions = granular?.assessment?.incomplete ?? [];
  const questionRefs = [...unanswered, ...incompleteQuestions];
  if (questionRefs.length > 0) {
    return {
      canComplete: false,
      category: 'ASSESSMENT',
      summary:
        questionRefs.length === 1
          ? 'Há 1 questão pendente de resposta.'
          : `Há ${questionRefs.length} questões pendentes de resposta.`,
      items: questionRefs.map((ref) => ({
        category: 'ASSESSMENT' as const,
        label: formatPendingItemDisplay(ref, 'question'),
        ref,
        adminActionable: false,
      })),
      adminItems,
      diagnosticsAvailable,
    };
  }

  // --- Prioridade 4: slides pendentes --------------------------------------
  const missingSlides = granular?.slides?.missing ?? [];
  if (missingSlides.length > 0) {
    return {
      canComplete: false,
      category: 'CONTENT',
      summary:
        missingSlides.length === 1
          ? 'Há 1 conteúdo obrigatório ainda não concluído.'
          : `Há ${missingSlides.length} conteúdos obrigatórios ainda não concluídos.`,
      items: missingSlides.map((ref) => ({
        category: 'CONTENT' as const,
        label: formatPendingItemDisplay(ref, 'slide'),
        ref,
        adminActionable: false,
      })),
      adminItems,
      diagnosticsAvailable,
    };
  }

  // --- Prioridade 5: incompleto sem granularidade --------------------------
  return {
    canComplete: false,
    category: diagnosticsAvailable ? 'SCORM_STATUS' : 'UNKNOWN',
    summary: GENERIC_PENDING_FALLBACK,
    items: [],
    adminItems,
    diagnosticsAvailable,
  };
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}
