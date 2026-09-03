import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/react-app/styles/native-theme-controls.css', 'utf8');

describe('native theme controls contract', () => {
  it('keeps a visible semantic focus baseline for keyboard users', () => {
    expect(css).toContain(
      ".airtrust-global-standard :where(button, [role='button'], a[href], input, select, textarea):focus-visible",
    );
    expect(css).toContain('outline: 2px solid var(--at-focus)');
  });

  it('enforces 44px mobile touch targets without inflating checkbox and radio inputs', () => {
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain("input:not([type='checkbox']):not([type='radio']):not([type='hidden'])");
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('min-width: 44px');
  });
});
