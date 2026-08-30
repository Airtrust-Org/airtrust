import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync('src/react-app/main.tsx', 'utf8');
const login = readFileSync('src/react-app/pages/LoginSimple.tsx', 'utf8');

describe('password recovery routing contract', () => {
  it('keeps forgot/reset pages public and outside the authenticated app shell', () => {
    expect(main).toContain("pathname === '/forgot-password'");
    expect(main).toContain("pathname === '/reset-password'");
    expect(main).toContain('<ForgotPasswordPage />');
    expect(main).toContain('<ResetPasswordPage />');
  });

  it('does not leave the login forgot-password control as a dead hash link', () => {
    expect(login).toContain('href="/forgot-password"');
    expect(login).not.toContain('href="#"');
  });
});
