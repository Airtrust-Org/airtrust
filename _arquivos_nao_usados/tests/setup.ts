/**
 * Setup global para testes
 */

import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup após cada teste
afterEach(() => {
  cleanup();
});

// Configurações globais
global.fetch = global.fetch || (() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
})) as any;
