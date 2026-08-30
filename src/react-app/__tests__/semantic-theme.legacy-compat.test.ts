import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/react-app/styles/semantic-theme.css', 'utf8');

describe('semantic theme legacy compatibility', () => {
  it('translates legacy light-only neutral utilities only when no explicit dark variant exists', () => {
    expect(css).toContain(".dark .bg-white:not([class*='dark:bg-'])");
    expect(css).toContain(".dark .text-slate-900:not([class*='dark:text-'])");
    expect(css).toContain(".dark .border-slate-200:not([class*='dark:border-'])");
  });

  it('keeps operational severity semantics stable in dark mode', () => {
    expect(css).toContain(".dark .bg-green-50:not([class*='dark:bg-'])");
    expect(css).toContain('background-color: var(--at-success-soft)');
    expect(css).toContain(".dark .bg-amber-50:not([class*='dark:bg-'])");
    expect(css).toContain('background-color: var(--at-attention-soft)');
    expect(css).toContain(".dark .bg-red-50:not([class*='dark:bg-'])");
    expect(css).toContain('background-color: var(--at-critical-soft)');
  });

  it('bridges legacy gradients and native white controls without overriding authored dark variants', () => {
    expect(css).toContain(".dark .from-white:not([class*='dark:from-'])");
    expect(css).toContain(".dark .to-white:not([class*='dark:to-'])");
    expect(css).toContain(".dark select.bg-white:not([class*='dark:bg-'])");
    expect(css).toContain('background-color: var(--at-bg-field)');
  });
});
