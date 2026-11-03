import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());

vi.mock('../http-client', () => ({
  httpClient: { get: getMock },
}));

import { qualificacoesService } from '../qualificacoes';
import { listarFuncionariosAtivos } from '../qualificacoesService';

function funcionario(id: number) {
  return {
    id,
    nome: id === 150 ? 'Nery — Instrutor' : `Funcionário ${id}`,
    matricula: String(id).padStart(5, '0'),
    cpf: String(id).padStart(11, '0'),
    is_instrutor: id === 150 ? 1 : 0,
  };
}

function mockPaginatedEmployees(total: number) {
  const all = Array.from({ length: total }, (_, index) => funcionario(index + 1));
  getMock.mockImplementation(async (url: string) => {
    const params = new URL(url, 'https://airtrust.example').searchParams;
    expect(params.get('status')).toBe('ativos');
    expect(params.get('orderBy')).toBe('id');
    expect(params.get('order')).toBe('ASC');
    expect(Number(params.get('limit'))).toBe(100);
    const page = Number(params.get('page'));
    return {
      success: true,
      data: {
        success: true,
        data: all.slice((page - 1) * 100, page * 100),
        pagination: { page, totalPages: Math.ceil(total / 100), total },
      },
    };
  });
}

describe('qualificacoesService.lookups.funcionariosAtivos', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('preserves the success/data envelope consumed by the React Query employee hook', async () => {
    mockPaginatedEmployees(151);
    const response = await listarFuncionariosAtivos();
    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data).toHaveLength(151);
    expect(response.data?.find((item) => item.id === 150)?.is_instrutor).toBe(1);
  });

  it('loads employees beyond the backend 100-row cap including instructors as students', async () => {
    mockPaginatedEmployees(218);
    const result = await qualificacoesService.lookups.funcionariosAtivos();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(218);
    expect(result.data?.find((item) => item.nome === 'Nery — Instrutor')).toMatchObject({
      id: 150,
      is_instrutor: 1,
    });
    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it('does not silently truncate tenants with more than 1000 employees', async () => {
    mockPaginatedEmployees(1001);
    const result = await qualificacoesService.lookups.funcionariosAtivos();
    expect(result.data).toHaveLength(1001);
    expect(getMock).toHaveBeenCalledTimes(11);
  });

  it('honors an explicitly requested limit', async () => {
    mockPaginatedEmployees(218);
    const result = await qualificacoesService.lookups.funcionariosAtivos(120);
    expect(result.data).toHaveLength(120);
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed if a later page errors, instead of returning a partial dropdown', async () => {
    getMock
      .mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          data: Array.from({ length: 100 }, (_, index) => funcionario(index + 1)),
        },
      })
      .mockResolvedValueOnce({ success: false, error: 'Falha de rede' });
    const result = await qualificacoesService.lookups.funcionariosAtivos();
    expect(result).toMatchObject({ success: false, error: 'Falha de rede' });
    expect(result.data).toBeUndefined();
  });

  it('stops safely if an API repeats the same full page', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: Array.from({ length: 100 }, (_, index) => funcionario(index + 1)),
      },
    });
    const result = await qualificacoesService.lookups.funcionariosAtivos();
    expect(result.data).toHaveLength(100);
    expect(getMock).toHaveBeenCalledTimes(2);
  });
  it('rejects HTTP success with an invalid employee API envelope', async () => {
    getMock.mockResolvedValue({ success: true, data: { success: false, data: null } });
    const result = await qualificacoesService.lookups.funcionariosAtivos();
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

});
