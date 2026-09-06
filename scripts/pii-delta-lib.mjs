const REAL_TENANT_EMAIL = /\b[A-Z0-9._%+-]+@voecostadosol\.com\.br\b/i;
const CPF_CANDIDATE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

export function isValidCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calc = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

export function parseUnifiedDiffAddedLines(diffText) {
  const added = [];
  let file = null;
  let newLine = 0;

  for (const raw of String(diffText || '').split('\n')) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice(6);
      continue;
    }
    if (raw.startsWith('+++ /dev/null')) {
      file = null;
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (!file) continue;

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      added.push({ file, line: newLine, text: raw.slice(1) });
      newLine += 1;
      continue;
    }
    if (raw.startsWith('-') && !raw.startsWith('---')) {
      continue;
    }
    if (raw.startsWith(' ') || raw === '') {
      newLine += 1;
    }
  }

  return added;
}

export function scanAddedLines(lines) {
  const violations = [];

  for (const entry of lines) {
    const text = String(entry.text || '');

    if (REAL_TENANT_EMAIL.test(text)) {
      violations.push({
        file: entry.file,
        line: entry.line,
        ruleId: 'REAL_TENANT_EMAIL',
        message: 'novo e-mail literal de domínio real de cliente não pode ser versionado',
      });
    }

    const cpfMatches = text.match(CPF_CANDIDATE) || [];
    if (cpfMatches.some(isValidCpf)) {
      violations.push({
        file: entry.file,
        line: entry.line,
        ruleId: 'VALID_CPF_LITERAL',
        message: 'novo CPF válido literal não pode ser versionado',
      });
    }
  }

  return violations;
}
