/**
 * DEV AUTH HELPER
 * Auto-login em desenvolvimento com credenciais admin
 */

import { getAccessToken } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getDevLoginCredentials } from './devCredentials';

export async function ensureDevAuth(): Promise<void> {
  // Só funciona em desenvolvimento
  if (import.meta.env.MODE === 'production') {
    return;
  }

  const { email, password } = getDevLoginCredentials();
  if (!email || !password) {
    return;
  }

  // Se já tem token, não faz nada
  const existingToken = getAccessToken();
  if (existingToken) {
    console.log('[DEV AUTH] ✅ Token já existe');
    return;
  }

  console.log('[DEV AUTH] 🔐 Fazendo login automático...');

  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: password }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.data?.accessToken) {
      sessionStorage.setItem('airtrust_token', data.data.accessToken);
      sessionStorage.setItem('airtrust_refresh_token', data.data.refreshToken);
      sessionStorage.setItem('airtrust_user', JSON.stringify(data.data.user));
      console.log('[DEV AUTH] ✅ Login automático concluído - Admin bypass ativo');
    } else {
      console.error('[DEV AUTH] ❌ Login failed:', data);
    }
  } catch (error) {
    console.error('[DEV AUTH] ❌ Erro no login automático:', error);
  }
}
