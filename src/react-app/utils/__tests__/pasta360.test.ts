import { describe, expect, it } from 'vitest';
import { buildPasta360Url, requirePasta360Url } from '../pasta360';

describe('pasta360 url helpers', () => {
  it('monta URL da Pasta 360 para qualificacoes preservando contexto', () => {
    const url = buildPasta360Url(123, {
      tab: 'pasta',
      origem: 'qualificacoes',
      historicoId: 456,
      certificadoId: 789,
      tenantId: 7,
    });

    expect(url).toBe(
      '/funcionarios/123/ficha?tab=pasta&origem=qualificacoes&historico_id=456&certificado_id=789&tenant_id=7',
    );
    expect(url).not.toContain('/pasta-virtual/');
  });

  it('monta URL da Pasta 360 para icones de funcionario', () => {
    expect(buildPasta360Url('ABC-123', { tab: 'pasta' })).toBe(
      '/funcionarios/ABC-123/ficha?tab=pasta',
    );
  });

  it('falha de forma explicita quando funcionario e invalido', () => {
    expect(buildPasta360Url(null)).toBeNull();
    expect(() => requirePasta360Url(null)).toThrow('Funcionário inválido para abrir Pasta 360');
  });
});
