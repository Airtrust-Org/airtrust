import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ValidatedLmsPackage } from '../lib/lms/lms-package-validator';
import { validateModernM8AuditContract } from '../lib/lms/lms-scorm-quality-gate';

const root = existsSync(resolve(process.cwd(), 'training-content'))
  ? process.cwd()
  : resolve(process.cwd(), '..');
const sourcePath = resolve(root, 'training-content/cultura-justa-m8/course-source.json');
const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, any>;
const encode = (value: string) => new TextEncoder().encode(value);

function packageFromSource(): ValidatedLmsPackage {
  const mediaPaths = new Set<string>();
  for (const slide of source.slides as Array<Record<string, any>>) {
    for (const media of (slide.media ?? []) as Array<{ src: string }>) mediaPaths.add(media.src);
  }
  const requiredSlides = (source.slides as Array<{ id: string }>).map((slide) => slide.id);
  const entries = [
    {
      path: 'course-model.js',
      data: encode(
        `window.AIRTRUST_COURSE_MODEL = ${JSON.stringify({
          schema: source.schema,
          courseId: source.courseId,
          packageVersion: source.packageVersion,
          title: source.title,
          navigationGate: source.navigationGate,
          masteryScore: source.masteryScore,
          auditClosure: source.auditClosure,
          slides: source.slides,
        })};`,
      ),
    },
    {
      path: 'airtrust-completion-manifest.json',
      data: encode(JSON.stringify({ content: { requiredSlides } })),
    },
    {
      path: 'app.js',
      data: encode(
        `LMSGetLastError();LMSGetErrorString('0');LMSGetDiagnostic('0');window.parent.postMessage({type:'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',payload:{}},'*');`,
      ),
    },
    { path: 'styles.css', data: encode('body{font-size:20px}.question{font-size:20px}') },
    ...Array.from(mediaPaths).map((path) => ({ path, data: encode('jpeg-fixture') })),
  ];
  return {
    tipoConteudo: 'scorm',
    entries,
    totalUncompressedBytes: entries.reduce((sum, entry) => sum + entry.data.byteLength, 0),
    launchFile: 'index.html',
    scormVersao: '1.2',
    tipoH5p: null,
  };
}

describe('Cultura Justa M8 course source', () => {
  it('keeps the controlled PRC-SSO-008 Rev05 assessment contract', () => {
    expect(source.courseId).toBe('JUST_CULTURE');
    expect(source.source.code).toBe('PRC-SSO-008');
    expect(source.source.revision).toBe('05');
    expect(source.source.date).toBe('2026-02-25');
    expect(source.masteryScore).toBe(70);
    expect(source.navigationGate).toBe('module-assessment');
  });

  it('contains required decision scenarios and six non-generic certifying questions', () => {
    const slides = source.slides as Array<Record<string, any>>;
    const scenarios = slides.filter((slide) => slide.kind === 'scenario');
    const assessments = slides.filter((slide) => slide.kind === 'assessment');
    expect(scenarios).toHaveLength(2);
    expect(scenarios.every((slide) => slide.requiredDecision === true)).toBe(true);
    expect(assessments).toHaveLength(6);
    for (const slide of assessments) {
      expect(String(slide.question ?? '')).not.toMatch(/^Na aplicação prática deste módulo/i);
      expect(slide.choices).toHaveLength(3);
      expect(slide.correctIndex).toBeGreaterThanOrEqual(0);
      expect(slide.feedback?.correct).toBeTruthy();
      expect(slide.feedback?.incorrect).toBeTruthy();
    }
  });

  it('uses only local packaged visual paths and meets the modern M8 audit contract', () => {
    const slides = source.slides as Array<Record<string, any>>;
    for (const slide of slides) {
      expect(slide.media?.length).toBeGreaterThan(0);
      for (const media of slide.media as Array<{ src: string }>) {
        expect(media.src).toMatch(/^assets\/[a-z0-9-]+\.jpg$/);
        expect(media.src).not.toMatch(/^https?:/);
      }
    }
    expect(validateModernM8AuditContract(packageFromSource())).toEqual({
      status: 'PASS',
      errors: [],
      warnings: [],
    });
  });
});
