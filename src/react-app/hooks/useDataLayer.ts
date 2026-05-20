/**
 * HOOKS REACT - Integração com API refatorada
 * Data: 2 de novembro de 2025
 *
 * Hooks para consumir dados do novo schema refatorado
 */

import { useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import type { Funcionario, Qualificacao, Certificado } from '../worker/services/queries';

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════
// HOOKS FUNCIONARIOS
// ═══════════════════════════════════════════════════════════════════

export function useFuncionarios(): UseAsyncState<Funcionario[]> & { data: Funcionario[] } {
  const [data, setData] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/funcionarios?t=${new Date().getTime()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(Array.isArray(result) ? result : result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Error fetching funcionarios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useFuncionarioById(id: number | null): UseAsyncState<Funcionario> {
  const [data, setData] = useState<Funcionario | null>(null);
  const [loading, setLoading] = useState(!id);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/funcionarios/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error(`Error fetching funcionario ${id}:`, err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useFuncionarioByMatricula(matricula: string | null): UseAsyncState<Funcionario> {
  const [data, setData] = useState<Funcionario | null>(null);
  const [loading, setLoading] = useState(!matricula);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!matricula) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/funcionarios/matricula/${matricula}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error(`Error fetching funcionario by matricula:`, err);
    } finally {
      setLoading(false);
    }
  }, [matricula]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ═══════════════════════════════════════════════════════════════════
// HOOKS QUALIFICACOES
// ═══════════════════════════════════════════════════════════════════

export function useQualificacoes(): UseAsyncState<Qualificacao[]> & {
  data: Qualificacao[];
} {
  const [data, setData] = useState<Qualificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/qualificacoes?t=${new Date().getTime()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(Array.isArray(result) ? result : result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Error fetching qualificacoes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useQualificacoesByFuncionario(funcionario_id: number | null): UseAsyncState<
  Qualificacao[]
> & {
  data: Qualificacao[];
} {
  const [data, setData] = useState<Qualificacao[]>([]);
  const [loading, setLoading] = useState(!funcionario_id);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!funcionario_id) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/funcionarios/${funcionario_id}/qualificacoes`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(Array.isArray(result) ? result : result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error(`Error fetching qualificacoes for funcionario ${funcionario_id}:`, err);
    } finally {
      setLoading(false);
    }
  }, [funcionario_id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useQualificacoesVencidas(): UseAsyncState<Qualificacao[]> & {
  data: Qualificacao[];
} {
  const [data, setData] = useState<Qualificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/qualificacoes/vencidas`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(Array.isArray(result) ? result : result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Error fetching vencidas qualificacoes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ═══════════════════════════════════════════════════════════════════
// HOOKS CERTIFICADOS
// ═══════════════════════════════════════════════════════════════════

export function useCertificados(): UseAsyncState<Certificado[]> & { data: Certificado[] } {
  const [data, setData] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/certificados`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(Array.isArray(result) ? result : result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Error fetching certificados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useCertificadosByQualificacao(qualificacao_id: number | null): UseAsyncState<
  Certificado[]
> & {
  data: Certificado[];
} {
  const [data, setData] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(!qualificacao_id);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!qualificacao_id) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/qualificacoes/${qualificacao_id}/certificados`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(Array.isArray(result) ? result : result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error(`Error fetching certificados for qualificacao ${qualificacao_id}:`, err);
    } finally {
      setLoading(false);
    }
  }, [qualificacao_id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ═══════════════════════════════════════════════════════════════════
// HOOKS COMPLEXOS
// ═══════════════════════════════════════════════════════════════════

export function useFuncionarioComQualificacoes(funcionario_id: number | null) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(!funcionario_id);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!funcionario_id) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/funcionarios/${funcionario_id}/completo`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error(`Error fetching funcionario completo:`, err);
    } finally {
      setLoading(false);
    }
  }, [funcionario_id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useQualificacaoComCertificados(qualificacao_id: number | null) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(!qualificacao_id);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!qualificacao_id) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/qualificacoes/${qualificacao_id}/completo`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error(`Error fetching qualificacao completo:`, err);
    } finally {
      setLoading(false);
    }
  }, [qualificacao_id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
