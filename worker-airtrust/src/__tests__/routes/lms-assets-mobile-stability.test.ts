import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

describe('SCORM mobile stability — autosave e resume', () => {
  it('só agenda commit quando o valor de lesson_location/suspend_data realmente muda (SCORM 1.2)', () => {
    expect(source).toContain("changed=' + (previousValue === nextValue ? '0' : '1')");
    expect(source).toContain('if (previousValue !== nextValue) scheduleCommit(800);');
  });

  it('só agenda commit quando o valor de location/suspend_data realmente muda (SCORM 2004)', () => {
    const scorm2004Block = source.slice(source.indexOf('var SCORM2004 = {'));
    expect(scorm2004Block).toMatch(
      /emitProgress\(\{ location: getScormLocation\(\) \}\);\s*\n\s*if \(previousValue !== nextValue\) scheduleCommit\(800\);/,
    );
  });

  it('exclui session_time/total_time (inclusive dentro de cmi_json) do fingerprint de dedup', () => {
    expect(source).toContain('function fingerprintPayload(data) {');
    const fn = source.slice(
      source.indexOf('function fingerprintPayload(data) {'),
      source.indexOf('function fingerprintPayload(data) {') + 400,
    );
    expect(fn).not.toContain('session_time');
    expect(fn).not.toContain('total_time');
    expect(fn).not.toContain('cmi_json');
    expect(fn).toContain('getScormLocation()');
  });

  it('preserva session_time/total_time no payload real enviado ao servidor', () => {
    expect(source).toMatch(/session_time: cmi\['cmi\.core\.session_time'\] \|\| null,/);
    expect(source).toMatch(/total_time: cmi\['cmi\.core\.total_time'\] \|\| null,/);
  });

  it('só permite autosave depois que o restore terminar (flag autosaveReady)', () => {
    expect(source).toContain('var autosaveReady = false;');
    expect(source).toMatch(
      /function scheduleCommit\(delayMs\) \{\s*if \(PREVIEW_MODE \|\| MATRICULA_ID == null \|\| !autosaveReady\) return;/,
    );
  });

  it('marca autosaveReady em todo caminho de saída de restoreResumeLocation', () => {
    const fn = source.slice(
      source.indexOf('function restoreResumeLocation(remainingAttempts) {'),
      source.indexOf('function scheduleInteractionProbe'),
    );
    const readyMarks = fn.match(/autosaveReady = true;/g) ?? [];
    // no-target, no-frame-dom (else), already-at-target, final attempt (else) e catch (else)
    expect(readyMarks.length).toBeGreaterThanOrEqual(5);
  });

  it('restaura a localização salva uma única vez por carregamento real do wrapper', () => {
    expect(source).toContain('var resumeAppliedThisLoad = false;');
    expect(source).toMatch(
      /if \(!resumeAppliedThisLoad && !userNavigatedManually\) \{\s*resumeAppliedThisLoad = true;\s*restoreResumeLocation\(12\);\s*\} else \{\s*autosaveReady = true;\s*\}/,
    );
  });

  it('não repete o restore depois que o usuário navegou manualmente', () => {
    expect(source).toContain('var userNavigatedManually = false;');
    expect(source).toMatch(
      /if \(event\.data\.type === 'lms:navigate' && \(event\.data\.direction === 'prev' \|\| event\.data\.direction === 'next'\)\) \{\s*userNavigatedManually = true;/,
    );
  });
});
