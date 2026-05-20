import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';

export interface GestorCopiaConvocacao {
  id: number;
  nome: string;
  email: string;
  cargo?: string | null;
  empresa?: string | null;
  ativo: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NotificacoesConvocacaoConfig {
  empresa_id: number;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_security: 'TLS' | 'SSL' | 'NONE';
  smtp_user?: string | null;
  smtp_password_configured: boolean;
  sender_name?: string | null;
  reply_to?: string | null;
  assunto_padrao: string;
  assinatura_html: string;
  template_html: string;
  batch_size: number;
  batch_interval_ms: number;
  updated_at?: string | null;
  gestores: GestorCopiaConvocacao[];
  defaults: {
    smtp_host?: string;
    smtp_port?: number;
    smtp_security?: 'TLS' | 'SSL' | 'NONE';
    smtp_user?: string;
    sender_name?: string;
    reply_to?: string;
    assunto_padrao: string;
    assinatura_html: string;
    template_html: string;
  };
}

export interface NotificacoesConvocacaoConfigInput {
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_security?: 'TLS' | 'SSL' | 'NONE';
  smtp_user?: string | null;
  smtp_password?: string | null;
  sender_name?: string | null;
  reply_to?: string | null;
  assunto_padrao?: string | null;
  assinatura_html?: string | null;
  template_html?: string | null;
  batch_size?: number | null;
  batch_interval_ms?: number | null;
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await apiFetch(`/api/notificacoes${path}`, {
    ...init,
    headers,
  });

  const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !json.success) {
    const error = new Error(json.error || `HTTP ${response.status}`) as Error & {
      code?: string;
      data?: unknown;
    };
    error.code = json.code;
    error.data = json.data;
    throw error;
  }

  return json.data as T;
}

const KEYS = {
  config: ['notificacoes-convocacao', 'config'] as const,
  gestores: ['notificacoes-convocacao', 'gestores'] as const,
};

export function useNotificacoesConvocacaoConfig() {
  return useQuery({
    queryKey: KEYS.config,
    queryFn: () => request<NotificacoesConvocacaoConfig>('/convocacoes/config'),
    staleTime: 30 * 1000,
  });
}

export function useSalvarNotificacoesConvocacaoConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NotificacoesConvocacaoConfigInput) =>
      request<NotificacoesConvocacaoConfig>('/convocacoes/config', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.config }),
        queryClient.invalidateQueries({ queryKey: KEYS.gestores }),
      ]);
    },
  });
}

export function useTestarConexaoConvocacao() {
  return useMutation({
    mutationFn: () =>
      request<{ status: string; provider: string }>('/convocacoes/config/testar-conexao', {
        method: 'POST',
      }),
  });
}

export function useEnviarEmailTesteConvocacao() {
  return useMutation({
    mutationFn: ({ emails, nome }: { emails: string[]; nome?: string }) =>
      request<{ sent: boolean }>('/convocacoes/config/enviar-teste', {
        method: 'POST',
        body: JSON.stringify({ emails, nome }),
      }),
  });
}

export function useCriarGestorCopiaConvocacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<GestorCopiaConvocacao, 'id'>) =>
      request<GestorCopiaConvocacao>('/convocacoes/gestores', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.config }),
        queryClient.invalidateQueries({ queryKey: KEYS.gestores }),
      ]);
    },
  });
}

export function useAtualizarGestorCopiaConvocacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Omit<GestorCopiaConvocacao, 'id'> }) =>
      request<GestorCopiaConvocacao>(`/convocacoes/gestores/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.config }),
        queryClient.invalidateQueries({ queryKey: KEYS.gestores }),
      ]);
    },
  });
}

export function useExcluirGestorCopiaConvocacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => request<void>(`/convocacoes/gestores/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.config }),
        queryClient.invalidateQueries({ queryKey: KEYS.gestores }),
      ]);
    },
  });
}
