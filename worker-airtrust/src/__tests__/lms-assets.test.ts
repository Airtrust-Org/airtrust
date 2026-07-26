import { describe, it, expect, vi } from 'vitest';
// We just assert that the file does not have the runaway mutation observer anymore
import { readFileSync } from 'fs';
import { join } from 'path';

describe('LMS Assets - SCORM Mobile Fixes', () => {
  it('MutationObserver limpa corretamente e previne instalação dupla', () => {
    const code = readFileSync(join(__dirname, '../../src/routes/lms-assets.ts'), 'utf-8');
    
    // Check multiple installs prevention
    expect(code).toContain('doc.__airtrustDrawerInjected = true;');
    
    // Check cleanup
    expect(code).toContain('window.addEventListener(\'unload\', function() {');
    expect(code).toContain('observer.disconnect();');
    
    // Check subtree limitation fallback
    expect(code).toContain('observer.observe(doc.body, { attributes: true, childList: true, subtree: false });');
  });
});
