import { describe, it, expect } from 'vitest';
import { HistoricoQualificacaoSchema } from '@/react-app/schemas/qualificacoes';

describe('HistoricoQualificacaoSchema', () => {
  it('valida payload correto', () => {
    const parsed = HistoricoQualificacaoSchema.parse({
      funcionario_cpf: '12345678901',
      qualificacao_codigo: 'QUAL-001',
      data_conclusao: '2025-11-22',
      data_vencimento: '2026-11-22',
      observacoes: 'ok',
    });
    expect(parsed.funcionario_cpf).toBe('12345678901');
  });

  it('falha em data inválida', () => {
    expect(() =>
      HistoricoQualificacaoSchema.parse({
        funcionario_id: 1,
        qualificacao_id: 2,
        data_conclusao: '22-11-2025',
      }),
    ).toThrow();
  });
});
