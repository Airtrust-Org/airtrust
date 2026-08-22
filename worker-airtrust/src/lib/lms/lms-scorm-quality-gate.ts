import { strFromU8 } from 'fflate';

import type { ValidatedLmsPackage } from './lms-package-validator';

export const SCORM_QUALITY_GATE_VERSION = 'AIRTRUST_SCORM_PACKAGE_QUALITY_GATE_V1';
export const COMPLETION_CONTRACT = 'AIRTRUST_COMPLETION_CONTRACT_V1';
export const DIAGNOSTICS_VERSION = 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1';

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
  return stack.length === 0 && /<manifest\b/i.test(xml);
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
  const structural = pkg.tipoConteudo !== 'scorm' || pkg.scormVersao !== '1.2' || !pkg.launchFile || !manifestIsWellFormed(pkg)
    ? fail('O pacote deve ter imsmanifest.xml XML válido, ser SCORM 1.2 e possuir launch file válido')
    : pass();
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
