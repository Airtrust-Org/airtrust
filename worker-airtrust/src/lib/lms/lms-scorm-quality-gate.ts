import { strFromU8 } from 'fflate';

import type { ValidatedLmsPackage } from './lms-package-validator';

export const SCORM_QUALITY_GATE_VERSION = 'AIRTRUST_SCORM_PACKAGE_QUALITY_GATE_V1';
export const COMPLETION_CONTRACT = 'AIRTRUST_COMPLETION_CONTRACT_V1';
export const DIAGNOSTICS_VERSION = 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1';

const MODERN_M8_SCHEMA = 'AIRTRUST_TRAINING_MODEL_M8';
const GENERIC_QUESTION_PREFIX =
  'Na aplicação prática deste módulo, qual alternativa atende corretamente ao critério técnico a seguir?';
const VISUAL_ASSET_RE = /\.(?:svg|png|jpe?g|webp|gif|avif|mp4|webm)(?:[?#].*)?$/i;
const LOCAL_ASSET_RE = /\.(?:svg|png|jpe?g|webp|gif|avif|mp4|webm|vtt|mp3|ogg|wav)(?:[?#].*)?$/i;

export type GateStatus = 'PASS' | 'FAIL' | 'NOT_SUPPORTED' | 'TIMEOUT' | 'ERROR';
export type GateSection = { status: GateStatus; errors: string[]; warnings: string[] };
export type ConformanceTest = { name: string; status: GateStatus; detail: string };
export type ScormQualityGateResult = {
  validatorVersion: string;
  structural: GateSection;
  completionManifest: GateSection;
  diagnostics: GateSection;
  conformance: { status: GateStatus; tests: ConformanceTest[] };
  publishable: boolean;
};

export type ScormRuntimeConformance = {
  status: 'PASS' | 'FAIL' | 'TIMEOUT' | 'ERROR';
  candidateSha256: string;
  startedAt: string;
  finishedAt: string;
  initializeObserved: boolean;
  commitObserved: boolean;
  finishObserved: boolean;
  completionReached: boolean;
  lessonStatus: string | null;
  scoreRaw: string | null;
  masteryScore: string | null;
  lessonLocation: string | null;
  trace: Array<{ method: string; key?: string; value?: string }>;
  errors: string[];
  runnerVersion: string;
};

function pass(): GateSection {
  return { status: 'PASS', errors: [], warnings: [] };
}

function fail(...errors: string[]): GateSection {
  return { status: 'FAIL', errors, warnings: [] };
}

function entry(pkg: ValidatedLmsPackage, filename: string) {
  const matches = pkg.entries.filter((item) => item.path.toLowerCase() === filename.toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uniqueStrings(value: unknown, label: string, errors: string[]) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push(`${label} deve ser uma lista de IDs não vazios`);
    return;
  }
  if (new Set(value.map((item) => item.toLocaleLowerCase('en-US'))).size !== value.length) {
    errors.push(`${label} contém IDs duplicados`);
  }
}

function parseJsonEntry(pkg: ValidatedLmsPackage, filename: string): Record<string, unknown> | null {
  const item = entry(pkg, filename);
  if (!item) return null;
  try {
    return asRecord(JSON.parse(strFromU8(item.data)));
  } catch {
    return null;
  }
}

function parseModernM8Model(pkg: ValidatedLmsPackage): { model: Record<string, unknown>; raw: string } | null {
  const item = entry(pkg, 'course-model.js');
  if (!item) return null;
  const raw = strFromU8(item.data);
  const assignment = raw.match(/window\.AIRTRUST_COURSE_MODEL\s*=\s*([\s\S]+?)\s*;?\s*$/);
  if (!assignment?.[1]) return null;
  try {
    const model = asRecord(JSON.parse(assignment[1]));
    return model?.schema === MODERN_M8_SCHEMA ? { model, raw } : null;
  } catch {
    return null;
  }
}

function normalizeAssetRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;
  if (/^(?:https?:)?\/\//i.test(trimmed)) return trimmed;
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? '';
  return withoutQuery.replace(/^\.\//, '').replace(/^\//, '');
}

function collectAssetRefs(value: unknown, refs: string[]): void {
  if (typeof value === 'string') {
    if (LOCAL_ASSET_RE.test(value.trim())) refs.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, refs);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, item] of Object.entries(record)) {
    if (/^(?:media|source|src|image|video|poster|track|figure|asset)$/i.test(key) || typeof item === 'object') {
      collectAssetRefs(item, refs);
    }
  }
}

function exactIdParity(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) return false;
  const left = [...expected].sort();
  const right = [...actual].sort();
  return left.every((id, index) => id === right[index]);
}

/**
 * Additional fail-closed contract for AirTrust's modern M8 authoring model.
 * Legacy packages are intentionally untouched: the checks activate only when
 * course-model.js explicitly declares AIRTRUST_TRAINING_MODEL_M8.
 */
export function validateModernM8AuditContract(pkg: ValidatedLmsPackage): GateSection {
  const parsed = parseModernM8Model(pkg);
  if (!parsed) return pass();

  const { model, raw } = parsed;
  const errors: string[] = [];
  const slides = Array.isArray(model.slides) ? model.slides.map(asRecord).filter(Boolean) as Record<string, unknown>[] : [];
  if (!slides.length) errors.push('M8: course-model.js não contém slides válidos');

  const slideIds = slides
    .map((slide) => (typeof slide.id === 'string' ? slide.id.trim() : ''))
    .filter(Boolean);
  if (slideIds.length !== slides.length || new Set(slideIds).size !== slideIds.length) {
    errors.push('M8: IDs de slides ausentes ou duplicados');
  }

  const completion = parseJsonEntry(pkg, 'airtrust-completion-manifest.json');
  const completionContent = asRecord(completion?.content);
  const requiredSlides = Array.isArray(completionContent?.requiredSlides)
    ? completionContent.requiredSlides.filter((item): item is string => typeof item === 'string')
    : [];
  if (!exactIdParity(slideIds, requiredSlides)) {
    errors.push('M8: airtrust-completion-manifest.json deve ter paridade exata com os IDs do deck');
  }

  if (model.navigationGate !== 'module-assessment') {
    errors.push('M8: navigationGate deve ser module-assessment');
  }

  const scenarios = slides.filter((slide) => slide.kind === 'scenario');
  const scenariosWithoutDecision = scenarios.filter((slide) => slide.requiredDecision !== true);
  if (scenariosWithoutDecision.length) {
    errors.push(`M8: ${scenariosWithoutDecision.length} cenário(s) não exigem decisão antes do avanço`);
  }

  const existingPaths = new Set(pkg.entries.map((item) => item.path.toLocaleLowerCase('en-US')));
  let slidesWithoutVisual = 0;
  const missingAssets = new Set<string>();
  const externalAssets = new Set<string>();
  for (const slide of slides) {
    const refs: string[] = [];
    collectAssetRefs(slide, refs);
    const visualRefs = refs.filter((ref) => VISUAL_ASSET_RE.test(ref));
    if (!visualRefs.length) slidesWithoutVisual += 1;
    for (const ref of refs) {
      const normalized = normalizeAssetRef(ref);
      if (!normalized) continue;
      if (/^(?:https?:)?\/\//i.test(normalized)) {
        externalAssets.add(ref);
      } else if (!existingPaths.has(normalized.toLocaleLowerCase('en-US'))) {
        missingAssets.add(normalized);
      }
    }
  }
  if (slidesWithoutVisual) errors.push(`M8: ${slidesWithoutVisual} tela(s) sem recurso visual local`);
  if (externalAssets.size) errors.push(`M8: dependência(s) de mídia externa não permitida(s): ${[...externalAssets].slice(0, 5).join(', ')}`);
  if (missingAssets.size) errors.push(`M8: asset(s) de mídia ausente(s): ${[...missingAssets].slice(0, 5).join(', ')}`);

  if (raw.includes(GENERIC_QUESTION_PREFIX)) {
    errors.push('M8: prefixo genérico proibido encontrado em questão');
  }

  const js = pkg.entries
    .filter((item) => item.path.toLowerCase().endsWith('.js'))
    .map((item) => strFromU8(item.data))
    .join('\n');
  for (const api of ['LMSGetLastError', 'LMSGetErrorString', 'LMSGetDiagnostic']) {
    if (!js.includes(api)) errors.push(`M8: wrapper SCORM sem ${api}`);
  }
  if (!/\.postMessage\s*\(/.test(js)) errors.push('M8: diagnostics runtime sem postMessage para o player');
  if (/window\s*\.\s*close\s*\(/i.test(js)) errors.push('M8: window.close() é proibido no fluxo SCORM');

  const tooSmallFonts = new Set<string>();
  for (const item of pkg.entries.filter((candidate) => candidate.path.toLowerCase().endsWith('.css'))) {
    const css = strFromU8(item.data);
    for (const match of css.matchAll(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/gi)) {
      const px = Number(match[1]);
      if (Number.isFinite(px) && px < 14) tooSmallFonts.add(`${item.path}:${px}px`);
    }
  }
  if (tooSmallFonts.size) {
    errors.push(`M8: font-size abaixo de 14px: ${[...tooSmallFonts].slice(0, 8).join(', ')}`);
  }

  const closure = asRecord(model.auditClosure);
  if (!closure) {
    errors.push('M8: auditClosure obrigatório para novos pacotes M8');
  } else {
    if (typeof closure.typographyMinPx !== 'number' || closure.typographyMinPx < 14) {
      errors.push('M8: auditClosure.typographyMinPx deve ser >= 14');
    }
    if (closure.moduleGate !== true) errors.push('M8: auditClosure.moduleGate deve ser true');
    if (closure.certifyingScoreChanged !== false) {
      errors.push('M8: auditClosure deve declarar certifyingScoreChanged=false');
    }
    if (!closure.semanticVisualCoverage) {
      errors.push('M8: auditClosure.semanticVisualCoverage ausente');
    }
  }

  return errors.length ? fail(...errors) : pass();
}

function completionManifest(pkg: ValidatedLmsPackage): GateSection {
  const manifest = entry(pkg, 'airtrust-completion-manifest.json');
  if (!manifest) return fail('AIRTRUST COMPLETION MANIFEST V1 ausente');
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = asRecord(JSON.parse(strFromU8(manifest.data)));
  } catch {
    // handled below
  }
  if (!parsed) return fail('airtrust-completion-manifest.json inválido');

  const errors: string[] = [];
  for (const key of ['schemaVersion', 'diagnosticsVersion', 'scormVersion', 'courseId', 'packageVersion', 'content', 'assessment', 'completion']) {
    if (parsed[key] === undefined || parsed[key] === null || parsed[key] === '') errors.push(`Campo obrigatório ausente: ${key}`);
  }
  if (parsed.schemaVersion !== 1) errors.push('schemaVersion deve ser 1');
  if (parsed.diagnosticsVersion !== DIAGNOSTICS_VERSION) errors.push(`diagnosticsVersion deve ser ${DIAGNOSTICS_VERSION}`);
  if (parsed.scormVersion !== '1.2') errors.push('scormVersion deve ser 1.2');
  const content = asRecord(parsed.content);
  const assessment = asRecord(parsed.assessment);
  const completion = asRecord(parsed.completion);
  if (!content) errors.push('content inválido');
  else uniqueStrings(content.requiredSlides, 'content.requiredSlides', errors);
  if (!assessment) errors.push('assessment inválido');
  else {
    uniqueStrings(assessment.requiredInteractions, 'assessment.requiredInteractions', errors);
    if (assessment.masteryScore !== undefined && (typeof assessment.masteryScore !== 'number' || assessment.masteryScore < 0 || assessment.masteryScore > 100)) errors.push('assessment.masteryScore inválido');
    for (const key of ['successStatus', 'failureStatus']) if (assessment[key] !== undefined && !['passed', 'completed', 'failed', 'incomplete'].includes(String(assessment[key]))) errors.push(`assessment.${key} inválido`);
  }
  if (!completion || completion.strategy !== COMPLETION_CONTRACT) errors.push(`completion.strategy deve ser ${COMPLETION_CONTRACT}`);
  return errors.length ? fail(...errors) : pass();
}

function diagnostics(pkg: ValidatedLmsPackage): GateSection {
  const manifest = entry(pkg, 'airtrust-completion-manifest.json');
  if (!manifest) return fail('Diagnostics V1 não declarado');
  try {
    const parsed = asRecord(JSON.parse(strFromU8(manifest.data)));
    const fields = asRecord(parsed?.diagnostics);
    if (!fields) return fail('Contrato diagnostics ausente');
    const expected = ['currentSlide', 'slides', 'assessment', 'packageStatus', 'updatedAt'];
    const missing = expected.filter((key) => fields[key] !== true);
    if (missing.length) return fail(`Diagnostics V1 sem campos obrigatórios: ${missing.join(', ')}`);
    if ('correctAnswers' in fields || 'answers' in fields) return fail('Diagnostics V1 não pode publicar respostas corretas');
    return pass();
  } catch {
    return fail('Contrato diagnostics inválido');
  }
}

function manifestIsWellFormed(pkg: ValidatedLmsPackage): boolean {
  const manifest = entry(pkg, 'imsmanifest.xml');
  if (!manifest) return false;
  const xml = strFromU8(manifest.data);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return false;
  const stack: string[] = [];
  const tags = xml.matchAll(/<([^>]+)>/g);
  for (const match of tags) {
    const token = match[1]!.trim();
    if (!token || token.startsWith('?') || token.startsWith('!')) continue;
    if (token.startsWith('/')) {
      if (stack.pop() !== token.slice(1).trim().split(/\s/, 1)[0]) return false;
      continue;
    }
    if (!token.endsWith('/')) stack.push(token.split(/\s/, 1)[0]!);
  }
  // The root element may carry an XML namespace prefix (e.g. <ns0:manifest>)
  // — a valid SCORM 1.2 authoring pattern; see scorm-manifest-parser.ts.
  return stack.length === 0 && /<(?:[A-Za-z][\w.-]*:)?manifest\b/i.test(xml);
}

/**
 * Dynamic SCORM execution is intentionally not implemented in the Worker.
 * This explicit result prevents a static inspection from being misrepresented
 * as behavioral proof and keeps a candidate non-publishable until an isolated
 * runner is wired in.
 */
function conformanceNotSupported(): ScormQualityGateResult['conformance'] {
  const names = ['FIRST_ACCESS', 'RESUME', 'INCOMPLETE_EXIT', 'PASSED_ASSESSMENT', 'DOUBLE_FINALIZE', 'NO_STATUS_DOWNGRADE', 'DIAGNOSTICS_V1'];
  return {
    status: 'NOT_SUPPORTED',
    tests: names.map((name) => ({ name, status: 'NOT_SUPPORTED', detail: 'Runner isolado de conformance ainda não configurado' })),
  };
}

export function validateScormPackageQuality(pkg: ValidatedLmsPackage): ScormQualityGateResult {
  const baseStructural = pkg.tipoConteudo !== 'scorm' || pkg.scormVersao !== '1.2' || !pkg.launchFile || !manifestIsWellFormed(pkg)
    ? fail('O pacote deve ter imsmanifest.xml XML válido, ser SCORM 1.2 e possuir launch file válido')
    : pass();
  const modernM8 = validateModernM8AuditContract(pkg);
  const structural = baseStructural.status === 'PASS' && modernM8.status === 'PASS'
    ? pass()
    : fail(...baseStructural.errors, ...modernM8.errors);
  const completion = completionManifest(pkg);
  const diagnostic = diagnostics(pkg);
  const conformance = conformanceNotSupported();
  return {
    validatorVersion: SCORM_QUALITY_GATE_VERSION,
    structural,
    completionManifest: completion,
    diagnostics: diagnostic,
    conformance,
    publishable: structural.status === 'PASS' && completion.status === 'PASS' && diagnostic.status === 'PASS' && conformance.status === 'PASS',
  };
}

export function applyRuntimeConformance(
  staticResult: ScormQualityGateResult,
  runtime: ScormRuntimeConformance,
  expectedSha256: string,
): ScormQualityGateResult {
  const shaMatches = runtime.candidateSha256 === expectedSha256;
  const conformance = {
    status: shaMatches ? runtime.status : 'ERROR' as const,
    tests: runtime.trace.map((item) => ({ name: item.method, status: shaMatches ? runtime.status : 'ERROR' as GateStatus, detail: item.key ? `${item.key}${item.value === undefined ? '' : `=${item.value}`}` : '' })),
  };
  if (!shaMatches) conformance.tests.push({ name: 'CANDIDATE_SHA256', status: 'ERROR', detail: 'Resultado pertence a SHA diferente' });
  return {
    ...staticResult,
    conformance,
    publishable: shaMatches && staticResult.structural.status === 'PASS' && staticResult.completionManifest.status === 'PASS' && staticResult.diagnostics.status === 'PASS' && runtime.status === 'PASS',
  };
}
