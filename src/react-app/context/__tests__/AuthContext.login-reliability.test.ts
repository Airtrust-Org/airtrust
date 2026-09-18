import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/context/AuthContext.tsx'),
  'utf8',
);

describe('AuthContext login reliability', () => {
  it('nao aborta o login por um cronometro artificial do frontend', () => {
    expect(source).toContain('const AUTH_LOGIN_TIMEOUT_MS = 0');
    expect(source).toContain('timeoutMs <= 0');
    expect(source).toContain('AUTH_LOGIN_TIMEOUT_MS');
    expect(source).not.toContain(
      'Tempo limite ao entrar. Verifique a conexão e tente novamente.',
    );
  });
});
