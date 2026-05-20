import { API_BASE_URL } from '@/react-app/config/api';

const LOCAL_DEV_ADMIN_EMAIL = 'admin@airtrust.com';
const LOCAL_DEV_ADMIN_PASSWORD = 'Admin@123';

export function getDevLoginCredentials() {
  const envEmail =
    import.meta.env.VITE_DEV_AUTH_EMAIL || import.meta.env.VITE_DEFAULT_LOGIN_EMAIL || '';
  const envPassword =
    import.meta.env.VITE_DEV_AUTH_PASSWORD || import.meta.env.VITE_DEFAULT_LOGIN_PASSWORD || '';

  const explicitApiUrl = import.meta.env.VITE_API_URL?.trim() || '';
  const explicitProxyTarget = import.meta.env.VITE_DEV_PROXY_TARGET?.trim() || '';
  const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const isLocalFrontend = runtimeHost === 'localhost' || runtimeHost === '127.0.0.1';
  const isLocalApi = [explicitApiUrl, API_BASE_URL].some(
    (value) => value.includes('localhost') || value.includes('127.0.0.1'),
  );
  const isLocalProxyTarget =
    explicitProxyTarget.includes('localhost') || explicitProxyTarget.includes('127.0.0.1');
  const shouldUseLocalCredentials =
    isLocalApi || isLocalProxyTarget || (isLocalFrontend && explicitApiUrl.length === 0);

  if (shouldUseLocalCredentials) {
    return {
      email: envEmail || LOCAL_DEV_ADMIN_EMAIL,
      password: envPassword || LOCAL_DEV_ADMIN_PASSWORD,
    };
  }

  return {
    email: envEmail || 'admin@airtrust.com',
    password: envPassword || LOCAL_DEV_ADMIN_PASSWORD,
  };
}
