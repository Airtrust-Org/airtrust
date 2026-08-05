import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runtimeModules = [
  'src/react-app/pages/qualificacoes/LicencasTab.tsx',
  'src/react-app/components/licencas/ModalLicenca.tsx',
  'src/react-app/pages/BackupRestore.tsx',
  'src/react-app/pages/Configuracoes/Backup.tsx',
  'src/react-app/components/shared/BackupRestoreModal.tsx',
  'src/react-app/pages/Configuracoes/LimparDados.tsx',
];

describe('authenticated live modules', () => {
  it.each(runtimeModules)('%s has no raw fetch or direct low-level apiFetch', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/(^|[^\w.])fetch\s*\(/m);
    expect(source).not.toMatch(/(^|[^\w.])apiFetch\s*\(/m);
    expect(source).toMatch(/\b(appFetch|apiJson|apiEnvelope|apiBlob)\b/);
  });

  it('does not replace a Backup failure with fabricated history rows', () => {
    const source = readFileSync('src/react-app/pages/BackupRestore.tsx', 'utf8');
    expect(source).not.toContain("operacao: 'Backup Completo'");
    expect(source).toContain('setBackupError(frontendErrorMessage(error))');
  });

  it.each([
    'src/react-app/pages/BackupRestore.tsx',
    'src/react-app/components/shared/BackupRestoreModal.tsx',
  ])('%s exposes classified 401/403/500 failures instead of an empty state', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('frontendErrorMessage');
    expect(source).toMatch(/\b(appFetch|apiJson|apiEnvelope|apiBlob)\b/);
  });

  it('reloads licenses and dashboard only after a successful save', () => {
    const tab = readFileSync('src/react-app/pages/qualificacoes/LicencasTab.tsx', 'utf8');
    const modal = readFileSync('src/react-app/components/licencas/ModalLicenca.tsx', 'utf8');

    expect(modal).toMatch(/await apiJson<unknown>\([\s\S]*?onSalvar\(\)/);
    expect(tab).toMatch(
      /const handleSalvar = \(\) => \{[\s\S]*?carregarLicencas\(\)[\s\S]*?carregarDashboard\(\)/,
    );
    expect(tab).toContain('onSalvar={handleSalvar}');
  });

  it('never presents a failed clear-data counter request as zero records', () => {
    const source = readFileSync('src/react-app/pages/Configuracoes/LimparDados.tsx', 'utf8');
    expect(source).toContain('loadError || contador === null');
    expect(source).toContain("? '—'");
    expect(source).toContain('setContadores(null)');
    expect(source).not.toContain('if (!contadores) return 0');
  });
});
