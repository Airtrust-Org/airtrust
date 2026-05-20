import { fetchWithAuth } from '@/react-app/config/api';

export interface PptxViewerSession {
  assetUrl: string;
  embedUrl: string;
  openUrl: string;
  expiresIn: number;
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

export function canUseOfficePptxViewer() {
  if (typeof window === 'undefined') return false;
  return !isLocalHostname(window.location.hostname);
}

export async function fetchPptxViewerSession(cursoId: number): Promise<PptxViewerSession> {
  const response = await fetchWithAuth(`/api/lms/pptx/viewer/${cursoId}`);
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: PptxViewerSession;
    error?: string;
  } | null;

  if (!response.ok || !json?.success || !json.data) {
    throw new Error(json?.error || `Falha ao preparar visualização (${response.status})`);
  }

  return json.data;
}
