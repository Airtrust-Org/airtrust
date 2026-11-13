/**
 * Contrato: todo caminho que cria/calcula vencimento de CMA usa o helper unico
 * (utils/cma-validity -> src/shared/utils/cma-validity) e nenhum calcula idade/60 anos por conta propria.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

const PATHS_USING_HELPER: Array<[string, RegExp]> = [
  ['src/routes/qualificacoes/historico-write.ts', /resolveCmaValidityForEmployee/],
  ['src/services/qualification-history-atomic.ts', /resolveCmaValidity\(/],
  ['src/services/qualificacoes-tipos-sync.ts', /resolveCmaValidity\(/],
  ['src/services/qualificacoes/export-expiry.ts', /resolveCmaValidity\(/],
  ['src/routes/qualificacoes/historico.ts', /resolveCmaValidity\(/],
  ['src/routes/importacao.ts', /resolveCmaValidity/],
  ['src/services/importacao/QualificacaoHistoricoImportacao.ts', /resolveCmaValidity\(/],
  ['src/services/lms-completion.ts', /resolveCmaValidityForEmployee/],
  ['src/services/treinamentos-planejados-integration.ts', /resolveCmaValidityForEmployee/],
  ['src/routes/solicitacoes-treinamento.ts', /resolveCmaValidityForEmployee/],
];

describe('CMA validity single source', () => {
  it.each(PATHS_USING_HELPER)('%s usa o helper unico', (file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it.each(PATHS_USING_HELPER.map(([f]) => f))('%s nao reimplementa a regra dos 60 anos', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/sixtiethBirthday|aniversario60|setFullYear\([^)]*\+ 60\)|setUTCFullYear\([^)]*\+ 60\)/);
    expect(src).not.toMatch(/isCmaSemestral/);
  });

  it('a regra pura vive no modulo compartilhado com o frontend', () => {
    const shared = read('../src/shared/utils/cma-validity.ts');
    expect(shared).toMatch(/CMA_AGE_THRESHOLD_YEARS = 60/);
    expect(shared).toMatch(/CMA_VALIDITY_MONTHS_AGE_60_PLUS = 6/);
    expect(shared).toMatch(/CMA_VALIDITY_MONTHS_DEFAULT = 12/);
    const front = read('../src/react-app/components/modals/ModalAtribuirQualificacao.tsx');
    expect(front).toMatch(/@\/shared\/utils\/cma-validity/);
  });
});
