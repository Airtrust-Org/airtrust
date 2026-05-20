import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * UNIT TESTS - Schemas de Validação
 */

// Schemas de teste
const FuncionarioSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(3),
  email: z.string().email(),
  cpf: z.string().regex(/^\d{11}$/),
  cargo: z.string().optional(),
  funcao: z.string().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

const QualificacaoSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(3),
  descricao: z.string().optional(),
  validade_meses: z.number().int().positive(),
  deleted_at: z.string().datetime().nullable().optional(),
});

const PaginacaoSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().optional(),
});

describe('Schema Validation Tests', () => {
  describe('FuncionarioSchema', () => {
    it('deve validar funcionário correto', () => {
      const valido = {
        nome: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
      };

      const result = FuncionarioSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar email inválido', () => {
      const invalido = {
        nome: 'João Silva',
        email: 'email-invalido',
        cpf: '12345678901',
      };

      const result = FuncionarioSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar CPF inválido', () => {
      const invalido = {
        nome: 'João Silva',
        email: 'joao@test.com',
        cpf: '123-456-789',
      };

      const result = FuncionarioSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve aceitar deleted_at null', () => {
      const valido = {
        nome: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
        deleted_at: null,
      };

      const result = FuncionarioSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });
  });

  describe('QualificacaoSchema', () => {
    it('deve validar qualificação correta', () => {
      const valido = {
        nome: 'Qualificação XYZ',
        validade_meses: 12,
      };

      const result = QualificacaoSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar validade_meses negativa', () => {
      const invalido = {
        nome: 'Qualificação XYZ',
        validade_meses: -5,
      };

      const result = QualificacaoSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve aceitar deleted_at null (ativo)', () => {
      const valido = {
        nome: 'Qualificação XYZ',
        validade_meses: 12,
        deleted_at: null,
      };

      const result = QualificacaoSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });
  });

  describe('PaginacaoSchema', () => {
    it('deve validar paginação padrão', () => {
      const valido = {
        page: 1,
        limit: 20,
      };

      const result = PaginacaoSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar limit > 100', () => {
      const invalido = {
        page: 1,
        limit: 200,
      };

      const result = PaginacaoSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve aplicar defaults', () => {
      const vazio = {};

      const result = PaginacaoSchema.safeParse(vazio);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });
  });
});

describe('Error Response Format', () => {
  const ErrorSchema = z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.any()).optional(),
    }),
  });

  it('deve validar erro padronizado', () => {
    const erro = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Campos obrigatórios inválidos',
        details: [{ field: 'email', message: 'Inválido' }],
      },
    };

    const result = ErrorSchema.safeParse(erro);
    expect(result.success).toBe(true);
  });
});

describe('Success Response Format', () => {
  const SuccessSchema = z.object({
    success: z.literal(true),
    data: z.any(),
    stats: z
      .object({
        total: z.number().optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      })
      .optional(),
  });

  it('deve validar sucesso com dados', () => {
    const sucesso = {
      success: true,
      data: [{ id: '1', nome: 'Test' }],
      stats: {
        total: 1,
        page: 1,
        limit: 20,
      },
    };

    const result = SuccessSchema.safeParse(sucesso);
    expect(result.success).toBe(true);
  });

  it('deve validar sucesso simples (sem stats)', () => {
    const sucesso = {
      success: true,
      data: { id: '1', nome: 'Test' },
    };

    const result = SuccessSchema.safeParse(sucesso);
    expect(result.success).toBe(true);
  });
});
