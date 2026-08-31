import { describe, expect, it } from 'vitest';

import type { ValidatedLmsPackage } from '../lib/lms/lms-package-validator';
import { validateModernM8AuditContract } from '../lib/lms/lms-scorm-quality-gate';

const encode = (value: string) => new TextEncoder().encode(value);

function packageWith(params: {
  model?: Record<string, unknown>;
  completionSlides?: string[];
  js?: string;
  css?: string;
  includeSecondAsset?: boolean;
  extraEntries?: Array<{ path: string; data: Uint8Array }>;
} = {}): ValidatedLmsPackage {
  const model = params.model ?? {
    schema: 'AIRTRUST_TRAINING_MODEL_M8',
    courseId: 'TEST_M8',
    title: 'Teste M8',
    navigationGate: 'module-assessment',
    auditClosure: {
      version: 'M8-FINAL-100-AUDIT',
      typographyMinPx: 14,
      semanticVisualCoverage: 'all-originally-unvisualized-slides',
      moduleGate: true,
      certifyingScoreChanged: false,
      storageScope: 'course+enrollment+active-cycle',
    },
    slides: [
      {
        id: 's001',
        kind: 'concept_map',
        title: 'Conceito',
        media: [{ src: 'assets/s001.svg', alt: 'Visual semântico' }],
      },
      {
        id: 's002',
        kind: 'scenario',
        title: 'Cenário',
        requiredDecision: true,
        media: [{ src: 'assets/s002.svg', alt: 'Visual do cenário' }],
      },
    ],
  };
  const completionSlides = params.completionSlides ?? ['s001', 's002'];
  const js = params.js ?? `
    function check(){ LMSGetLastError(); LMSGetErrorString('0'); LMSGetDiagnostic('0'); }
    window.parent.postMessage({ type: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1', payload: {} }, '*');
  `;
  const css = params.css ?? '.body{font-size:14px}.legend{font-size:14px}';

  const entries = [
    { path: 'course-model.js', data: encode(`window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`) },
    {
      path: 'airtrust-completion-manifest.json',
      data: encode(JSON.stringify({ content: { requiredSlides: completionSlides } })),
    },
    { path: 'app.js', data: encode(js) },
    { path: 'styles.css', data: encode(css) },
    { path: 'assets/s001.svg', data: encode('<svg xmlns="http://www.w3.org/2000/svg"/>') },
    ...(params.extraEntries ?? []),
  ];
  if (params.includeSecondAsset !== false) {
    entries.push({ path: 'assets/s002.svg', data: encode('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  }

  return {
    tipoConteudo: 'scorm',
    entries,
    totalUncompressedBytes: entries.reduce((sum, item) => sum + item.data.byteLength, 0),
    launchFile: 'index.html',
    scormVersao: '1.2',
    tipoH5p: null,
  };
}

function modelFrom(pkg: ValidatedLmsPackage): Record<string, unknown> {
  const raw = new TextDecoder().decode(pkg.entries.find((item) => item.path === 'course-model.js')!.data);
  return JSON.parse(raw.slice(raw.indexOf('=') + 1).trim().replace(/;$/, '')) as Record<string, unknown>;
}

describe('modern M8 audit contract', () => {
  it('passes a conforming M8 package', () => {
    expect(validateModernM8AuditContract(packageWith())).toEqual({ status: 'PASS', errors: [], warnings: [] });
  });

  it('accepts an AW139 historical source ref when the packaged asset is canonically rooted under media/', () => {
    const pkg = packageWith({
      extraEntries: [
        { path: 'media/cap01/p010_img02.webp', data: encode('image-bytes') },
      ],
    });
    const model = modelFrom(pkg);
    (model.slides as Array<Record<string, unknown>>)[0]!.source = {
      image: 'cap01/p010_img02.webp',
    };
    pkg.entries.find((item) => item.path === 'course-model.js')!.data = encode(
      `window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`,
    );
    expect(validateModernM8AuditContract(pkg)).toEqual({ status: 'PASS', errors: [], warnings: [] });
  });

  it('fails completion-manifest/deck drift', () => {
    const result = validateModernM8AuditContract(packageWith({ completionSlides: ['s001'] }));
    expect(result.status).toBe('FAIL');
    expect(result.errors.join('\n')).toMatch(/paridade exata/i);
  });

  it('fails scenario without required decision and missing media', () => {
    const pkg = packageWith({ includeSecondAsset: false });
    const model = modelFrom(pkg);
    const slides = model.slides as Array<Record<string, unknown>>;
    slides[1]!.requiredDecision = false;
    pkg.entries.find((item) => item.path === 'course-model.js')!.data = encode(
      `window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`,
    );
    const result = validateModernM8AuditContract(pkg);
    expect(result.status).toBe('FAIL');
    expect(result.errors.join('\n')).toMatch(/não exigem decisão/i);
    expect(result.errors.join('\n')).toMatch(/asset\(s\) de mídia ausente/i);
  });

  it('fails generic question prefix, tiny text and unsafe close', () => {
    const pkg = packageWith({
      css: '.legend{font-size:12px}',
      js: `LMSGetLastError();LMSGetErrorString('0');LMSGetDiagnostic('0');window.parent.postMessage({type:'AIRTRUST_COMPLETION_DIAGNOSTICS_V1'}, '*');window.close();`,
    });
    const model = modelFrom(pkg);
    (model.slides as Array<Record<string, unknown>>)[0]!.question =
      'Na aplicação prática deste módulo, qual alternativa atende corretamente ao critério técnico a seguir? Qual é a ação?';
    pkg.entries.find((item) => item.path === 'course-model.js')!.data = encode(
      `window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`,
    );
    const result = validateModernM8AuditContract(pkg);
    expect(result.status).toBe('FAIL');
    const errors = result.errors.join('\n');
    expect(errors).toMatch(/prefixo genérico proibido/i);
    expect(errors).toMatch(/font-size abaixo de 14px/i);
    expect(errors).toMatch(/window\.close/i);
  });

  it('fails missing SCORM diagnostics APIs or player postMessage', () => {
    const result = validateModernM8AuditContract(packageWith({ js: 'console.log("no diagnostics")' }));
    expect(result.status).toBe('FAIL');
    const errors = result.errors.join('\n');
    expect(errors).toMatch(/LMSGetLastError/);
    expect(errors).toMatch(/LMSGetErrorString/);
    expect(errors).toMatch(/LMSGetDiagnostic/);
    expect(errors).toMatch(/postMessage/);
  });

  it('fails a postMessage with the wrong diagnostics contract identifier', () => {
    const result = validateModernM8AuditContract(packageWith({
      js: `LMSGetLastError();LMSGetErrorString('0');LMSGetDiagnostic('0');window.parent.postMessage({type:'AIRTRUST_SCORM_DIAGNOSTICS'}, '*');`,
    }));
    expect(result.status).toBe('FAIL');
    expect(result.errors.join('\n')).toMatch(/AIRTRUST_COMPLETION_DIAGNOSTICS_V1/);
  });

  it('fails a modern M8 package without enrollment+active-cycle storage scope', () => {
    const pkg = packageWith();
    const model = modelFrom(pkg);
    (model.auditClosure as Record<string, unknown>).storageScope = 'course-only';
    pkg.entries.find((item) => item.path === 'course-model.js')!.data = encode(
      `window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`,
    );
    const result = validateModernM8AuditContract(pkg);
    expect(result.status).toBe('FAIL');
    expect(result.errors.join('\n')).toMatch(/course\+enrollment\+active-cycle/);
  });

  it('does not impose the M8 audit contract on legacy packages', () => {
    const pkg = packageWith();
    const model = modelFrom(pkg);
    model.schema = 'LEGACY_MODEL';
    delete model.auditClosure;
    pkg.entries.find((item) => item.path === 'course-model.js')!.data = encode(
      `window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`,
    );
    expect(validateModernM8AuditContract(pkg)).toEqual({ status: 'PASS', errors: [], warnings: [] });
  });
});
