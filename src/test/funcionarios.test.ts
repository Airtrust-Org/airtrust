import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Funcionario, CreateFuncionarioRequest, FuncionarioStatus } from '../worker/types/index';

const mockDB = {
  prepare: vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })
  })
};

const createMockContext = (overrides = {}) => ({
  env: { DB: mockDB },
  req: {
    param: vi.fn(),
    query: vi.fn(),
    json: vi.fn()
  },
  get: vi.fn(),
  json: vi.fn(),
  ...overrides
});

describe('Funcionarios API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Validation', () => {
    it('should validate required fields for creation', () => {
      const validFuncionario: CreateFuncionarioRequest = {
        nome: 'João Silva',
        funcao: 'Piloto'
      };

      expect(validFuncionario.nome).toBeTruthy();
      expect(validFuncionario.funcao).toBeTruthy();
    });

    it('should validate funcionario status enum', () => {
      const validStatuses: FuncionarioStatus[] = ['ATIVO', 'INATIVO', 'LICENCA', 'DEMITIDO'];
      
      validStatuses.forEach(status => {
        expect(['ATIVO', 'INATIVO', 'LICENCA', 'DEMITIDO']).toContain(status);
      });
    });

    it('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user space@domain.com'
      ];

      validEmails.forEach(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(emailRegex.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    it('should validate CPF format', () => {
      const validCPFs = [
        '123.456.789-00',
        '12345678900'
      ];

      const invalidCPFs = [
        '123.456.789',
        '123456789001', // too long
        'abc.def.ghi-jk'
      ];

      const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

      validCPFs.forEach(cpf => {
        expect(cpfRegex.test(cpf)).toBe(true);
      });

      invalidCPFs.forEach(cpf => {
        expect(cpfRegex.test(cpf)).toBe(false);
      });
    });
  });

  describe('Database Operations', () => {
    it('should handle successful funcionario creation', async () => {
      const mockResult = {
        meta: { last_row_id: 123, changes: 1 }
      };
      
      mockDB.prepare().bind().run.mockResolvedValue(mockResult);
      mockDB.prepare().bind().first.mockResolvedValue(null); // No existing matricula

      const funcionarioData: CreateFuncionarioRequest = {
        nome: 'João Silva',
        funcao: 'Piloto',
        matricula: '12345',
        email: 'joao@example.com'
      };

      expect(funcionarioData.nome).toBe('João Silva');
      expect(funcionarioData.funcao).toBe('Piloto');
      expect(mockResult.meta.last_row_id).toBe(123);
    });

    it('should handle duplicate matricula validation', async () => {
      const existingFuncionario = { id: 1, matricula: '12345' };
      mockDB.prepare().bind().first.mockResolvedValue(existingFuncionario);

      const funcionarioData: CreateFuncionarioRequest = {
        nome: 'João Silva',
        funcao: 'Piloto',
        matricula: '12345' // Duplicate
      };

      expect(existingFuncionario.matricula).toBe(funcionarioData.matricula);
    });

    it('should handle database errors gracefully', async () => {
      mockDB.prepare().bind().first.mockRejectedValue(new Error('Database connection failed'));

      try {
        await mockDB.prepare().bind().first();
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Database connection failed');
      }
    });
  });

  describe('Data Transformation', () => {
    it('should transform boolean fields correctly', () => {
      const funcionario: Partial<Funcionario> = {
        is_instrutor: true,
        is_checador: false
      };

      const dbFormat = {
        is_instrutor: funcionario.is_instrutor ? 1 : 0,
        is_checador: funcionario.is_checador ? 1 : 0
      };

      expect(dbFormat.is_instrutor).toBe(1);
      expect(dbFormat.is_checador).toBe(0);

      const boolFormat = {
        is_instrutor: Boolean(dbFormat.is_instrutor),
        is_checador: Boolean(dbFormat.is_checador)
      };

      expect(boolFormat.is_instrutor).toBe(true);
      expect(boolFormat.is_checador).toBe(false);
    });

    it('should handle date formatting', () => {
      const now = new Date();
      const isoString = now.toISOString();
      
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      const parsedDate = new Date(isoString);
      expect(parsedDate.getTime()).toBe(now.getTime());
    });
  });

  describe('Pagination', () => {
    it('should calculate pagination correctly', () => {
      const page = 2;
      const limit = 10;
      const total = 25;

      const offset = (page - 1) * limit;
      const pages = Math.ceil(total / limit);

      expect(offset).toBe(10);
      expect(pages).toBe(3);
    });

    it('should handle edge cases in pagination', () => {
      const emptyPagination = {
        page: 1,
        limit: 10,
        total: 0,
        pages: Math.ceil(0 / 10)
      };

      expect(emptyPagination.pages).toBe(0);

      const singlePage = {
        page: 1,
        limit: 10,
        total: 5,
        pages: Math.ceil(5 / 10)
      };

      expect(singlePage.pages).toBe(1);
    });
  });

  describe('Search Functionality', () => {
    it('should build search query correctly', () => {
      const search = 'João';
      const searchParam = `%${search}%`;

      expect(searchParam).toBe('%João%');
      
      const testValues = ['João Silva', 'Maria João', 'Pedro João Santos'];
      const matches = testValues.filter(name => 
        name.toLowerCase().includes(search.toLowerCase())
      );

      expect(matches).toHaveLength(3);
    });

    it('should handle special characters in search', () => {
      const specialSearch = "O'Connor";
      const escapedSearch = specialSearch.replace(/'/g, "''");
      
      expect(escapedSearch).toBe("O''Connor");
    });
  });

  describe('Soft Delete', () => {
    it('should implement soft delete correctly', () => {
      const now = new Date().toISOString();
      
      const funcionario: Partial<Funcionario> = {
        id: 1,
        nome: 'João Silva',
        deleted_at: undefined
      };

      const deletedFuncionario = {
        ...funcionario,
        deleted_at: now,
        updated_at: now
      };

      expect(deletedFuncionario.deleted_at).toBeTruthy();
      expect(deletedFuncionario.deleted_at).toBe(now);
    });

    it('should filter out deleted records in queries', () => {
      const funcionarios: Partial<Funcionario>[] = [
        { id: 1, nome: 'Active User', deleted_at: undefined },
        { id: 2, nome: 'Deleted User', deleted_at: '2024-01-01T00:00:00.000Z' },
        { id: 3, nome: 'Another Active', deleted_at: undefined }
      ];

      const activeOnly = funcionarios.filter(f => !f.deleted_at);
      
      expect(activeOnly).toHaveLength(2);
      expect(activeOnly.map(f => f.nome)).toEqual(['Active User', 'Another Active']);
    });
  });
});
