/**
 * submitted_at do check-in é gravado pelo Worker em UTC
 * (formato SQLite YYYY-MM-DD HH:mm:ss). Nunca tratar a hora legada
 * HH:mm como hora local: ela não contém offset nem data confiável.
 */
export function formatFrmsCheckinTime(submittedAt: string | null | undefined): string | null {
  const raw = submittedAt?.trim();
  if (!raw) return null;
  const utcSql = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(raw);
  const normalized = utcSql
    ? `${utcSql[1]}T${utcSql[2]}Z`
    : /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)
      ? raw
      : null;
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  const hour = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
  return `${hour} (Brasília)`;
}
