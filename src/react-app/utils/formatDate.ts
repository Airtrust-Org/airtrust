/**
 * FIX-06: Função centralizada de formatação de datas para exibição ao usuário.
 * Regra: SEMPRE DD/MM/YYYY para o usuário. YYYY-MM-DD apenas para inputs.
 *
 * Usa DatesBrasil internamente para consistência.
 */

/**
 * Formata data ISO (YYYY-MM-DD ou ISO 8601) para formato brasileiro DD/MM/YYYY.
 * Se inválida retorna '—'.
 */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    let d: Date;
    if (iso instanceof Date) {
      d = iso;
    } else {
      // Date-only strings must be treated as local
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
          return '—';
        }
      } else {
        d = new Date(iso);
      }
    }
    if (isNaN(d.getTime())) return '—';
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
  } catch {
    return '—';
  }
}

/**
 * Formata data com hora: DD/MM/YYYY HH:mm
 */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    const hr = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()} ${hr}:${min}`;
  } catch {
    return '—';
  }
}

/**
 * Formata data curta: DD/MM (sem ano)
 */
export function formatDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    let d: Date;
    if (iso instanceof Date) {
      d = iso;
    } else {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
          return '—';
        }
      } else {
        d = new Date(iso);
      }
    }
    if (isNaN(d.getTime())) return '—';
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dia}/${mes}`;
  } catch {
    return '—';
  }
}

/**
 * Retorna "há X dias", "daqui a X dias" etc. para exibição amigável.
 */
export function formatDateRelative(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    if (diff > 0) return `Daqui a ${diff} dias`;
    return `Há ${Math.abs(diff)} dias`;
  } catch {
    return '—';
  }
}
