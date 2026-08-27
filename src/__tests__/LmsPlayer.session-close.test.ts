/**
 * Fixes 2 / 3 / 5 — governed "Sair do curso" and completion-error preservation.
 *
 * LmsPlayer.tsx is a large component; following the existing test style for this
 * file (pure exports + source assertions), this pins:
 *   - sanitizeDiagnosticCode keeps a safe short token and drops anything else;
 *   - handleLeave performs a bounded lms:session-close handshake, is idempotent,
 *     waits for the ack (or a timeout) before navigating, and never fabricates
 *     completion;
 *   - the lms:completion-error handler preserves code/reason/message instead of
 *     collapsing everything into generic text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeDiagnosticCode } from '@/react-app/pages/lms/LmsPlayer';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/lms/LmsPlayer.tsx'),
  'utf8',
);

describe('sanitizeDiagnosticCode', () => {
  it('keeps an uppercase A-Z0-9_.- token', () => {
    expect(sanitizeDiagnosticCode('SCORM_FINAL_COMMIT_MISSING')).toBe('SCORM_FINAL_COMMIT_MISSING');
    expect(sanitizeDiagnosticCode(' http-500 ')).toBe('HTTP-500');
  });

  it('strips unsafe content and rejects empty / non-strings', () => {
    expect(sanitizeDiagnosticCode('<script>alert(1)</script>')).toBe('SCRIPTALERT1SCRIPT');
    expect(sanitizeDiagnosticCode('SELECT * FROM users;')).toBe('SELECTFROMUSERS');
    expect(sanitizeDiagnosticCode('')).toBeNull();
    expect(sanitizeDiagnosticCode('   ')).toBeNull();
    expect(sanitizeDiagnosticCode(null)).toBeNull();
    expect(sanitizeDiagnosticCode(42)).toBeNull();
  });

  it('caps the token length', () => {
    expect(sanitizeDiagnosticCode('A'.repeat(200))?.length).toBe(64);
  });
});

describe('governed session close wiring', () => {
  it('handleLeave runs a bounded, idempotent lms:session-close handshake', () => {
    expect(SOURCE).toContain("frameWindow.postMessage({ type: 'lms:session-close', reason: 'user-exit' }, launchOrigin)");
    expect(SOURCE).toContain('leavingRef');
    expect(SOURCE).toContain("event.data.type === 'lms:session-close:ack'");
    expect(SOURCE).toContain('window.setTimeout(finish, 4500)');
    // ack listener is source-checked against the course iframe
    expect(SOURCE).toContain('if (event.source !== frameWindow) return;');
  });

  it('falls back to a direct navigate when there is no live SCORM iframe', () => {
    expect(SOURCE).toMatch(/if \(!isScormContent \|\| !iframeLoaded \|\| !frameWindow[\s\S]*?navigate\('\/lms\/cursos'\)/);
  });

  it('preserves completion-error code/reason for diagnostics', () => {
    expect(SOURCE).toContain('setCompletionErrorInfo({ code, reason, message: baseMessage })');
    expect(SOURCE).toContain('const code = sanitizeDiagnosticCode(event.data.code)');
    expect(SOURCE).toContain('(código: ${code})');
    expect(SOURCE).toContain('Código de diagnóstico:');
  });
});
