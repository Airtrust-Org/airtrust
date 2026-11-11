import { createHash } from 'node:crypto';

export function assertQaRunScope(runId, attempt) {
  const id = String(runId ?? '').trim();
  const nth = String(attempt ?? '').trim();
  if (!/^[1-9][0-9]{4,17}$/.test(id) || !/^[1-9][0-9]{0,3}$/.test(nth)) {
    throw new Error('QA_RUN_SCOPE_REQUIRED');
  }
  return { id, nth };
}

export function qaRunEmail(runId, attempt, browser) {
  const scope = assertQaRunScope(runId, attempt);
  if (!['chromium', 'webkit'].includes(browser)) throw new Error('QA_BROWSER_NOT_ALLOWLISTED');
  return `qa.lms.${scope.id}.${scope.nth}.${browser}@airtrust.online`;
}

export function qaRunLearners(runId, attempt, cpfGenerator) {
  const scope = assertQaRunScope(runId, attempt);
  return Object.fromEntries(['chromium','webkit'].map(browser => {
    const seed = `${scope.id}:${scope.nth}:${browser}`;
    const digest = createHash('sha256').update(seed).digest('hex');
    const code = browser === 'chromium' ? 'CHR' : 'WBK';
    const prefix = '9' + (BigInt('0x' + digest.slice(0,16)) % 100000000n).toString().padStart(8,'0');
    return [browser, Object.freeze({
      nome: `AIRTRUST_QA_LMS_${code}_${scope.id}_${scope.nth}`,
      matricula: `QA-LMS-${code}-${scope.id}-${scope.nth}`,
      email: qaRunEmail(scope.id,scope.nth,browser),
      cargo: 'Aluno de Teste QA', setor: 'Treinamento e Capacitação',
      perfil: 'ALUNO', cpf: cpfGenerator(prefix),
    })];
  }));
}
