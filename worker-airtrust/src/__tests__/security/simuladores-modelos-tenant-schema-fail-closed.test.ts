import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('simulator model tenant schema introspection', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/simuladores-modelos.ts'), 'utf8');

  it('never removes tenant joins when PRAGMA fails or columns are absent', () => {
    expect(source).toContain("throw new Error('SIMULADORES_TENANT_SCHEMA_REQUIRED')");
    expect(source).toContain("const tiposJoinOn = 'ms.tipo_sessao_id = ts.id AND ts.empresa_id = ?'");
    expect(source).toContain(
      "'LEFT JOIN qualificacoes_tipos qt ON ms.qualificacao_tipo_id = qt.id AND qt.empresa_id = ?'",
    );
    expect(source).not.toContain('hasQualificacoesEmpresaId = false');
    expect(source).not.toContain('hasTiposEmpresaId = false');
    expect(source).not.toContain(": 'ms.tipo_sessao_id = ts.id'");
  });
});
