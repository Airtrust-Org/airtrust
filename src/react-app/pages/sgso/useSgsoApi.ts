import { useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL, getAccessToken } from '../../config/api';

export function useSgsoApi() {
  const { token, refreshToken, logout } = useAuth();

  return useCallback(
    async (path: string, options: RequestInit = {}) => {
      const url = `${API_BASE_URL}${path}`;
      const headers = new Headers(options.headers ?? {});
      const hasFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      if (!hasFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      let response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        try {
          await refreshToken();
          const refreshedToken = getAccessToken() || token;
          if (refreshedToken) {
            headers.set('Authorization', `Bearer ${refreshedToken}`);
          }
          response = await fetch(url, { ...options, headers });
        } catch {
          logout();
          throw new Error('Sessão expirada');
        }
      }

      const text = await response.text();
      if (!text) {
        return {
          success: response.ok,
          error: response.ok ? null : `Erro HTTP ${response.status}`,
          code: response.ok ? undefined : 'SGSO_API_EMPTY_RESPONSE',
        };
      }

      try {
        return JSON.parse(text);
      } catch {
        return {
          success: false,
          error: `Resposta inválida da API (HTTP ${response.status})`,
          code: 'SGSO_API_INVALID_JSON',
        };
      }
    },
    [logout, refreshToken, token],
  );
}
