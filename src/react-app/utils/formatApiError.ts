export interface ApiErrorDetail {
  path?: string[];
  message: string;
}

export interface ApiErrorPayload {
  error?: string;
  details?: ApiErrorDetail[];
}

export function formatApiError(data: ApiErrorPayload | undefined, fallback: string): string {
  if (!data) return fallback;
  let msg = data.error || fallback;
  if (Array.isArray(data.details) && data.details.length > 0) {
    msg +=
      '\n' + data.details.map((d) => `- ${d.path?.join('.') || 'campo'}: ${d.message}`).join('\n');
  }
  return msg;
}
