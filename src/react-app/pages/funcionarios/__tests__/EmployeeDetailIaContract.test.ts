import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/react-app/App.tsx', 'utf8');
const legacyProfile = readFileSync(
  'src/react-app/pages/funcionarios/PerfilFuncionario.tsx',
  'utf8',
);

describe('employee detail IA contract', () => {
  it('keeps Ficha 360 as the canonical employee detail for current and legacy ficha URLs', () => {
    expect(app).toContain('path="/funcionarios/:id"');
    expect(app).toContain('path="/funcionarios/:id/ficha"');
    expect(app.match(/<FichaFuncionarioPage \/>/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('turns the old profile into compatibility routing instead of a second employee UI', () => {
    expect(legacyProfile).toContain('LEGACY_TAB_TO_CANONICAL');
    expect(legacyProfile).toContain('to={`/funcionarios/${id}?tab=${canonicalTab}`}');
    expect(legacyProfile).toContain('to={`/escalas?funcionario_id=${encodeURIComponent(id)}`}');
    expect(legacyProfile).not.toContain('fetch(');
    expect(legacyProfile).not.toContain('confirmDialog');
  });

  it('keeps old document/history/training tabs mapped to canonical 360 tabs', () => {
    expect(legacyProfile).toContain("documentos: 'pasta'");
    expect(legacyProfile).toContain("historico: 'auditoria'");
    expect(legacyProfile).toContain("treinamentos: 'qualificacoes'");
  });
});
