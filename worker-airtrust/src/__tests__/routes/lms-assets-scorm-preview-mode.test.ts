/**
 * Regression for cross-origin admin preview of Factory V3 SCORM packages.
 * Reading an enrollment's lesson location while the SCO is in preview should
 * never trigger the "EDIÇÃO INCOMPATÍVEL" warning or start a learner attempt.
 */
import { describe, expect, it } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';

const ENTRY = '/api/lms/scorm/assets/6/62/_candidates/hash/index.html';

function render(previewMode?: boolean, reviewMode?: boolean, url = ENTRY, buster?: string): string {
  return buildLaunchPage({
    matriculaId: previewMode ? null : 101,
    titulo: 'SCORM V3',
    launchUrl: url,
    commitUrl: previewMode ? null : '/api/lms/matriculas/scorm/commit',
    token: '',
    isScorm2004: false,
    initialCmiJson: '{}',
    hasResumeState: false,
    previewMode,
    reviewMode,
    assetCacheBuster: buster,
  });
}

function entry(html: string): URL {
  const match = html.match(/<iframe id="scorm-frame" src="([^"]+)"/);
  expect(match).not.toBeNull();
  return new URL(match![1].replace(/&amp;/g, '&'), 'https://api.airtrust.online');
}

describe('SCORM admin preview entry URL', () => {
  it('marks the SCO preview=1 so Factory V3 skips enrollment restoration', () => {
    const html = render(true);
    expect(entry(html).pathname).toBe(ENTRY);
    expect(entry(html).searchParams.get('preview')).toBe('1');
    expect(html).toContain('var PREVIEW_MODE = true;');
    expect(html).toContain('var MATRICULA_ID = null;');
    expect(html).toContain('var COMMIT_URL = null;');
  });

  it('preserves pre-existing asset query and version cache buster', () => {
    const url = entry(render(true, false, ENTRY + '?lang=pt-BR', 'SHA:abc'));
    expect(url.searchParams.get('lang')).toBe('pt-BR');
    expect(url.searchParams.get('airtrust_scorm')).toBe('SHA:abc');
    expect(url.searchParams.get('preview')).toBe('1');
  });

  it('never labels real enrollment or review as preview', () => {
    for (const reviewMode of [false, true]) {
      const html = render(false, reviewMode, ENTRY, 'sha-1');
      expect(entry(html).searchParams.has('preview')).toBe(false);
      expect(html).toContain('var MATRICULA_ID = 101;');
      expect(html).toContain('var PREVIEW_MODE = false;');
    }
  });

  it('supports absolute asset URLs without changing their origin', () => {
    const html = render(true, false, 'https://api.airtrust.online' + ENTRY, 'v1');
    expect(entry(html).origin).toBe('https://api.airtrust.online');
    expect(entry(html).searchParams.get('preview')).toBe('1');
  });
});
