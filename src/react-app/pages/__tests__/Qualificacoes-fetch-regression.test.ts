import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Qualificacoes Page - Fetch Regression', () => {
  it('should not contain raw fetch() calls in the component (must use fetchWithAuth)', () => {
    const filePath = path.join(__dirname, '../Qualificacoes.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Remove comments to avoid false positives
    const withoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    // Match raw fetch calls like `await fetch(` or ` fetch(` but ignore `fetchWithAuth`
    // The regex looks for `fetch(` preceded by space, await, or symbol, but NOT a word character
    const rawFetchRegex = /(?<!\w)fetch\s*\(/g;
    
    const matches = [...withoutComments.matchAll(rawFetchRegex)];
    
    if (matches.length > 0) {
      console.error('Found raw fetch calls at indices:', matches.map(m => m.index));
    }

    expect(matches.length).toBe(0);
  });
});
