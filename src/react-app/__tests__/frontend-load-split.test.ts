import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('frontend initial-load budget preconditions', () => {
  it('loads Material Symbols from one source, without a second network stylesheet', () => {
    const main = read('src/react-app/main.tsx');
    const index = read('index.html');
    expect(main).toContain("import 'material-symbols/outlined.css';");
    expect(index).not.toContain('family=Material+Symbols+Outlined');
    expect(index).toContain('family=Inter');
    expect(read('src/react-app/index.css')).not.toContain("@import url('https://fonts.googleapis.com/css2?family=Inter:");
  });

  it('defers authenticated home and auxiliary pages until their routes are opened', () => {
    const app = read('src/react-app/App.tsx');
    const main = read('src/react-app/main.tsx');
    expect(app).toMatch(/lazyWithRetry\(\(\) => import\('\.\/pages\/HomeRouter'\)/);
    expect(app).not.toContain("import HomeRouter from './pages/HomeRouter'");
    for (const name of ['InstallAppPage', 'ForgotPasswordPage', 'ResetPasswordPage']) {
      expect(main).toContain("'" + name + "'");
      expect(main).not.toContain("import " + name + " from");
    }
    expect(main).toContain('<Suspense fallback=');
  });
});
