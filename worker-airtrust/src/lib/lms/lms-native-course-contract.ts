/**
 * AirTrust Native Course V1: first strict contract for an authoring artifact.
 *
 * This is NOT an LMS completion decision or an upload acceptance endpoint.
 * Only the Worker may validate authoring artifacts. In particular the answer
 * key MUST NOT be sent to browsers or used to trust client-provided scores.
 */
export const NATIVE_COURSE_SCHEMA = 'AIRTRUST_NATIVE_COURSE_V1' as const;

export type NativeAsset = {
  id: string;
  path: string;
  sha256: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm' | 'audio/mpeg' | 'text/vtt';
};

export type NativeBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'image' | 'video'; assetId: string; alt: string };

export type NativeUnit = {
  id: string;
  title: string;
  kind: 'lesson' | 'assessment';
  blocks: NativeBlock[];
  questionIds: string[];
};

export type NativeQuestion = {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  feedbackCorrect: string;
  feedbackIncorrect: string;
};

export type NativeCourseArtifact = {
  schema: typeof NATIVE_COURSE_SCHEMA;
  courseId: string;
  packageVersion: string;
  title: string;
  locale: 'pt-BR';
  policy: { mode: 'FORMATIVE' } | { mode: 'SCORED'; masteryScore: number };
  assets: NativeAsset[];
  units: NativeUnit[];
  questions: NativeQuestion[];
};

/** Public projection. Answers and privileged grading feedback stay server-side. */
export type NativeLearnerQuestion = Omit<NativeQuestion, 'correctOptionId' | 'feedbackCorrect' | 'feedbackIncorrect'>;
export type NativeLearnerCourse = Omit<NativeCourseArtifact, 'questions'> & {
  questions: NativeLearnerQuestion[];
};

export class NativeCourseValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeCourseValidationError';
  }
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIME_SUFFIX: Record<NativeAsset['mime'], string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'audio/mpeg': ['.mp3'],
  'text/vtt': ['.vtt'],
};
const MAX_UNITS = 500;
const MAX_QUESTIONS = 500;
const MAX_ASSETS = 1000;

function fail(code: string): never {
  throw new NativeCourseValidationError(code);
}
function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  const expected = new Set([...required, ...optional]);
  if (!required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) ||
      Object.keys(value).some((key) => !expected.has(key))) fail('NATIVE_UNEXPECTED_FIELD');
}
function text(value: unknown, max = 8000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    fail('NATIVE_INVALID_TEXT');
  }
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail('NATIVE_INVALID_ID');
  return value;
}
function boundedArray(value: unknown, max: number, allowEmpty = false): unknown[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > max) {
    fail('NATIVE_INVALID_ARRAY');
  }
  return value;
}
function unique(values: string[]): void {
  if (new Set(values).size !== values.length) fail('NATIVE_DUPLICATE_ID');
}
function assetPath(value: unknown): string {
  const path = text(value, 256);
  if (path.startsWith('/') || path.includes('\\') || path.includes('%') ||
      path.includes('?') || path.includes('#') || path.includes('//') ||
      path.split('/').some((part) => part === '.' || part === '..' || !part) ||
      /^[a-z][a-z0-9+.-]*:/i.test(path) || /[^a-zA-Z0-9_./-]/.test(path)) {
    fail('NATIVE_INVALID_ASSET_PATH');
  }
  return path;
}

/**
 * Does NOT make an imported draft publishable or certify a training.
 * The package version and SHA must additionally be matched to the signed,
 * immutable publication record before delivery or progress writes.
 */
export function validateNativeCourseArtifact(input: unknown): NativeCourseArtifact {
  const raw = record(input, 'NATIVE_INVALID_ROOT');
  keys(raw, ['schema', 'courseId', 'packageVersion', 'title', 'locale', 'policy', 'assets', 'units', 'questions']);
  if (raw.schema !== NATIVE_COURSE_SCHEMA || raw.locale !== 'pt-BR') fail('NATIVE_UNSUPPORTED_SCHEMA');
  id(raw.courseId);
  id(raw.packageVersion);
  text(raw.title, 200);

  const policy = record(raw.policy, 'NATIVE_INVALID_POLICY');
  if (policy.mode === 'SCORED') {
    keys(policy, ['mode', 'masteryScore']);
    if (!Number.isInteger(policy.masteryScore) ||
        (policy.masteryScore as number) < 1 || (policy.masteryScore as number) > 100) {
      fail('NATIVE_INVALID_MASTERY');
    }
  } else if (policy.mode === 'FORMATIVE') {
    keys(policy, ['mode']);
  } else {
    fail('NATIVE_INVALID_POLICY');
  }

  const rawAssets = boundedArray(raw.assets, MAX_ASSETS, true);
  const assets = rawAssets.map((item) => {
    const entry = record(item, 'NATIVE_INVALID_ASSET');
    keys(entry, ['id', 'path', 'sha256', 'mime']);
    id(entry.id);
    const path = assetPath(entry.path);
    if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) fail('NATIVE_INVALID_ASSET_HASH');
    if (typeof entry.mime !== 'string' || !Object.prototype.hasOwnProperty.call(MIME_SUFFIX, entry.mime)) fail('NATIVE_INVALID_ASSET_MIME');
    if (!MIME_SUFFIX[entry.mime as NativeAsset['mime']].some((suffix) => path.toLowerCase().endsWith(suffix))) {
      fail('NATIVE_MIME_MISMATCH');
    }
    return entry as NativeAsset;
  });
  unique(assets.map((asset) => asset.id));
  unique(assets.map((asset) => asset.path));
  const assetIds = new Set(assets.map((asset) => asset.id));

  const rawQuestions = boundedArray(raw.questions, MAX_QUESTIONS, true);
  const questions = rawQuestions.map((item) => {
    const question = record(item, 'NATIVE_INVALID_QUESTION');
    keys(question, ['id', 'prompt', 'options', 'correctOptionId', 'feedbackCorrect', 'feedbackIncorrect']);
    id(question.id);
    text(question.prompt, 4000);
    text(question.feedbackCorrect, 4000);
    text(question.feedbackIncorrect, 4000);
    const options = boundedArray(question.options, 10);
    if (options.length < 2) fail('NATIVE_INVALID_OPTIONS');
    const ids = options.map((option) => {
      const entry = record(option, 'NATIVE_INVALID_OPTION');
      keys(entry, ['id', 'text']);
      id(entry.id);
      text(entry.text, 2000);
      return entry.id as string;
    });
    unique(ids);
    if (!ids.includes(id(question.correctOptionId))) fail('NATIVE_INVALID_ANSWER');
    return question as NativeQuestion;
  });
  unique(questions.map((q) => q.id));
  const knownQuestions = new Set(questions.map((q) => q.id));
  const referencedQuestions: string[] = [];

  const rawUnits = boundedArray(raw.units, MAX_UNITS);
  const units = rawUnits.map((item) => {
    const unit = record(item, 'NATIVE_INVALID_UNIT');
    keys(unit, ['id', 'title', 'kind', 'blocks', 'questionIds']);
    id(unit.id);
    text(unit.title, 200);
    if (unit.kind !== 'lesson' && unit.kind !== 'assessment') fail('NATIVE_INVALID_UNIT_KIND');
    const questionIds = boundedArray(unit.questionIds, MAX_QUESTIONS, true).map(id);
    unique(questionIds);
    if (unit.kind === 'lesson' && questionIds.length > 0) fail('NATIVE_QUESTIONS_IN_LESSON');
    if (unit.kind === 'assessment' && !questionIds.length) fail('NATIVE_EMPTY_ASSESSMENT');
    if (questionIds.some((q) => !knownQuestions.has(q))) fail('NATIVE_UNKNOWN_QUESTION');
    referencedQuestions.push(...questionIds);
    const blocks = boundedArray(unit.blocks, 100, unit.kind === 'assessment');
    for (const item of blocks) {
      const block = record(item, 'NATIVE_INVALID_BLOCK');
      if (block.type === 'heading' || block.type === 'paragraph') {
        keys(block, ['type', 'text']);
        text(block.text);
      } else if (block.type === 'bullets') {
        keys(block, ['type', 'items']);
        boundedArray(block.items, 40).forEach((t) => text(t, 1000));
      } else if (block.type === 'image' || block.type === 'video') {
        keys(block, ['type', 'assetId', 'alt']);
        const assetId = id(block.assetId);
        text(block.alt, 500);
        if (!assetIds.has(assetId)) fail('NATIVE_UNKNOWN_ASSET');
        const mime = assets.find((asset) => asset.id === assetId)!.mime;
        if (!(block.type === 'image' ? mime.startsWith('image/') : mime.startsWith('video/'))) {
          fail('NATIVE_ASSET_BLOCK_MISMATCH');
        }
      } else {
        fail('NATIVE_UNSUPPORTED_BLOCK');
      }
    }
    return unit as NativeUnit;
  });
  unique(units.map((unit) => unit.id));
  unique(referencedQuestions);
  if (referencedQuestions.length !== questions.length) fail('NATIVE_UNUSED_QUESTION');
  if (policy.mode === 'SCORED' && !questions.length) fail('NATIVE_SCORED_WITHOUT_QUESTIONS');
  return raw as NativeCourseArtifact;
}

export function toNativeLearnerCourse(input: NativeCourseArtifact): NativeLearnerCourse {
  const source = validateNativeCourseArtifact(input);
  return {
    schema: source.schema,
    courseId: source.courseId,
    packageVersion: source.packageVersion,
    title: source.title,
    locale: source.locale,
    policy: source.policy.mode === 'FORMATIVE'
      ? { mode: 'FORMATIVE' }
      : { mode: 'SCORED', masteryScore: source.policy.masteryScore },
    assets: source.assets.map((asset) => ({ ...asset })),
    units: source.units.map((unit) => ({
      ...unit,
      blocks: unit.blocks.map((block) => ({ ...block })),
      questionIds: [...unit.questionIds],
    })),
    questions: source.questions.map(({ id, prompt, options }) => ({
      id, prompt, options: options.map(({ id: optionId, text: label }) => ({ id: optionId, text: label })),
    })),
  };
}
