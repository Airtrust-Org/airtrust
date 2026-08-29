import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/react-app/pages/Configuracoes.tsx', 'utf8');

describe('Configuracoes information architecture', () => {
  it('opens organization settings instead of company administration by default', () => {
    expect(source).toContain("const [activeTab, setActiveTab] = useState<ConfigTab>('cadastros')");
    expect(source).not.toContain("canAccessCompanyManagement ? 'empresas' : 'cadastros'");
  });

  it('separates organization configuration from administration/maintenance', () => {
    expect(source).toContain('Configuração da organização');
    expect(source).toContain('Administração e manutenção');
    expect(source).toContain('aria-label="Configuração da organização"');
    expect(source).toContain('aria-label="Administração e manutenção"');
  });

  it('uses the canonical PageHeader and semantic theme tokens', () => {
    expect(source).toContain("import PageHeader from '../components/PageHeader'");
    expect(source).toContain('bg-[var(--at-bg-surface)]');
    expect(source).toContain('text-[var(--at-text-secondary)]');
  });
});
