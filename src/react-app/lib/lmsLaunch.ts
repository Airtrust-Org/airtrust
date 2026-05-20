import { fetchWithAuth, getAccessToken } from '@/react-app/config/api';

function shouldUseSameOriginProtectedFetch(url: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!url.startsWith('/api/')) return false;

  const host = window.location.hostname;
  return host === 'airtrust.online' || host === 'www.airtrust.online';
}

async function fetchProtectedHtml(url: string): Promise<string> {
  const response = shouldUseSameOriginProtectedFetch(url)
    ? await (async () => {
        const token = getAccessToken();

        if (!token) {
          throw new Error('Authentication required');
        }

        return window.fetch(url, {
          credentials: 'include',
          headers: {
            Accept: 'text/html',
            Authorization: `Bearer ${token}`,
          },
        });
      })()
    : await fetchWithAuth(url, {
        headers: {
          Accept: 'text/html',
        },
      });

  if (!response.ok) {
    const message = (await response.text().catch(() => '')).trim();
    throw new Error(message || 'Falha ao carregar o conteúdo protegido.');
  }

  return response.text();
}

export async function createProtectedLaunchBlobUrl(url: string): Promise<string> {
  const html = await fetchProtectedHtml(url);
  const blob = new Blob([html], { type: 'text/html' });
  return URL.createObjectURL(blob);
}

export async function openProtectedLaunchPage(url: string): Promise<void> {
  try {
    const blobUrl = await createProtectedLaunchBlobUrl(url);
    window.location.assign(blobUrl);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    throw error;
  }
}
