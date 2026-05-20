/**
 * UTILS - Dates
 *
 * Parsing robusto de datas para importação.
 * Aceita múltiplos formatos:
 * - ISO: YYYY-MM-DD
 * - BR: DD/MM/YYYY, DD/MM/YY, D/M/YYYY
 * - Excel serial number (44562)
 */

/**
 * Parse flexível de datas
 *
 * Retorna string ISO (YYYY-MM-DD) ou null se inválido
 *
 * Exemplos:
 * - "2025-11-26" → "2025-11-26" (já ISO)
 * - "26/11/2025" → "2025-11-26" (DD/MM/YYYY)
 * - "26/11/25" → "2025-11-26" (DD/MM/YY, assume 20XX se < 50, 19XX se >= 50)
 * - "1/2/2025" → "2025-02-01" (D/M/YYYY)
 * - 45623 → "2024-11-26" (Excel serial number)
 */
export function parseFlexibleDate(value: unknown): string | null {
  if (!value) return null;

  // 1. Já é ISO (YYYY-MM-DD)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Validar se é data real
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return value;
    }
    return null;
  }

  // 2. Excel serial number (número > 1000)
  // Excel epoch: 1900-01-01 (mas com bug: considera 1900 bissexto)
  // Serial 1 = 1900-01-01, Serial 60 = 1900-02-29 (inválido!), Serial 61 = 1900-03-01
  if (typeof value === 'number' && value > 1000) {
    try {
      // Excel usa epoch 1899-12-30 (25569 dias antes de Unix epoch 1970-01-01)
      // Usar Date.UTC para evitar problemas de timezone
      const unixEpoch = Date.UTC(1970, 0, 1); // 1970-01-01 00:00:00 UTC
      const excelEpochOffset = 25569; // Dias entre 1899-12-30 e 1970-01-01
      const daysFromUnixEpoch = value - excelEpochOffset;
      const timestamp = daysFromUnixEpoch * 86400000; // ms

      const date = new Date(unixEpoch + timestamp);

      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    } catch {
      return null;
    }
  }

  // 3. String de data - tentar múltiplos formatos
  const dateStr = String(value).trim();

  // DD/MM/YYYY, DD/MM/YY, D/M/YYYY, etc
  const brDateMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (brDateMatch) {
    let [, day, month, year] = brDateMatch;

    // Completar ano de 2 dígitos
    if (year.length === 2) {
      const yearNum = parseInt(year);
      // Se < 50, assume 20XX; se >= 50, assume 19XX
      year = yearNum < 50 ? `20${year}` : `19${year}`;
    }

    // Padronizar dia e mês
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');

    // Validar se data é válida (não aceita 31/02, etc)
    // IMPORTANTE: Usar Date.UTC para evitar problemas de timezone
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);

    const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));

    if (!isNaN(date.getTime())) {
      // Verificar se não houve overflow (ex: 31/02 → 03/03)
      if (
        date.getUTCFullYear() === yearNum &&
        date.getUTCMonth() + 1 === monthNum &&
        date.getUTCDate() === dayNum
      ) {
        return `${year}-${month}-${day}`;
      }
    }
  }

  return null;
}

/**
 * Valida se string é data ISO válida
 */
export function isValidISODate(value: unknown): boolean {
  if (!value) return false;

  const str = String(value);

  // Formato ISO
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;

  // Data válida
  const date = new Date(str);
  return !isNaN(date.getTime());
}

/**
 * Formata data ISO para formato BR
 *
 * Exemplo: "2025-11-26" → "26/11/2025"
 */
export function formatDateBR(dateISO: string): string {
  const [year, month, day] = dateISO.split('-');
  return `${day}/${month}/${year}`;
}
