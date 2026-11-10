import { describe, expect, it } from 'vitest';
import { validateModernM8AuditContract } from '../../lib/lms/lms-scorm-quality-gate';
import type { ValidatedLmsPackage } from '../../lib/lms/lms-package-validator';

const encoder = new TextEncoder();
type Slide = Record<string, unknown> & { id: string; title: string; kind: string };
const baseSlides: Slide[] = [
  { id: 'cover', kind: 'cover', title: 'MEL', outcomes: ['A', 'B'] },
  { id: 'cards', kind: 'cards', title: 'Exemplos', cards: ['A', 'B'] },
  { id: 'compare', kind: 'compare', title: 'Comparação', columns: ['A', 'B'] },
  { id: 'check', kind: 'checklist', title: 'Verificação', items: ['A', 'B'] },
  { id: 'process', kind: 'process', title: 'Fluxo', steps: ['A', 'B'] },
  { id: 'practice', kind: 'practice', title: 'Aplicação', practiceOptions: ['A', 'B'] },
  { id: 'decision', kind: 'scenario', title: 'Fixação', question: 'Qual opção?', requiredDecision: true,
    scenarioOptions: [{ text: 'A' }, { text: 'B' }] },
  { id: 'image', kind: 'image', title: 'Foto técnica',
    media: [{ src: 'media/documento-local.jpg', alt: 'Página da MEL' }] },
];

const auditClosure = {
  typographyMinPx: 14, moduleGate: true, certifyingScoreChanged: false,
  semanticVisualCoverage: 'semantic structures or local media',
  storageScope: 'course+enrollment+active-cycle',
};

function fixture(slides: Slide[], opts: { includeImage?: boolean; fontSize?: number } = {}): ValidatedLmsPackage {
  const model = { schema: 'AIRTRUST_TRAINING_MODEL_M8',
    navigationGate: 'module-assessment', auditClosure, slides };
  const files = [
    { path: 'course-model.js', data: encoder.encode('window.AIRTRUST_COURSE_MODEL = ' + JSON.stringify(model) + ';') },
    { path: 'airtrust-completion-manifest.json',
      data: encoder.encode(JSON.stringify({ content: { requiredSlides: slides.map(slide => slide.id) } })) },
    { path: 'runtime.js',
      data: encoder.encode('LMSGetLastError LMSGetErrorString LMSGetDiagnostic ' +
        "parent.postMessage({type: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1'},'*')") },
    { path: 'styles.css', data: encoder.encode('.text {font-size:' + (opts.fontSize ?? 14) + 'px;}') },
  ];
  if (opts.includeImage !== false) files.push({
    path: 'media/documento-local.jpg', data: encoder.encode('local image'),
  });
  return {
    tipoConteudo: 'scorm', scormVersao: '1.2', launchFile: 'index.html',
    totalUncompressedBytes: files.reduce((n, file) => n + file.data.length, 0),
    tipoH5p: null, entries: files,
  };
}

describe('M8 visual gate: existing structured layout counts as semantic visual', () => {
  it('accepts rendered structures and an original local reference without duplicating images', () => {
    const result = validateModernM8AuditContract(fixture(baseSlides));
    expect(result.status).toBe('PASS');
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an empty/faked structure and an unillustrated plain slide', () => {
    const result = validateModernM8AuditContract(fixture([
      ...baseSlides, { id: 'fake', kind: 'cards', title: 'Sem cartões', cards: [] },
    ]));
    expect(result.status).toBe('FAIL');
    expect(result.errors.join(' ')).toContain('1 tela(s) sem recurso visual local');
  });

  it('still requires real local media for image slides', () => {
    const result = validateModernM8AuditContract(fixture(baseSlides, { includeImage: false }));
    expect(result.status).toBe('FAIL');
    expect(result.errors.join(' ')).toContain('media/documento-local.jpg');
  });

  it('does not waive type-size accessibility violations', () => {
    const result = validateModernM8AuditContract(fixture(baseSlides, { fontSize: 12 }));
    expect(result.status).toBe('FAIL');
    expect(result.errors.join(' ')).toContain('font-size abaixo de 14px');
  });

  it('rejects a scenario without a mandatory decision, even if choices exist', () => {
    const slides = baseSlides.map(slide => slide.id === 'decision'
      ? { ...slide, requiredDecision: false } : slide);
    const result = validateModernM8AuditContract(fixture(slides));
    expect(result.status).toBe('FAIL');
    expect(result.errors.join(' ')).toContain('cenário(s) não exigem decisão');
  });
});
