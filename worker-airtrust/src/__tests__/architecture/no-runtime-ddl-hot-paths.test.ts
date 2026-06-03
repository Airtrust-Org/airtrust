import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_PATTERNS = [
  /\bCREATE TABLE\b/i,
  /\bCREATE INDEX\b/i,
  /\bALTER TABLE\b/i,
  /\bDROP TABLE\b/i,
  /\bensure[A-Za-z0-9_]*(?:Schema|Table|Column)\s*\(/,
];

const HOT_PATH_FILES = [
  ['routes/alertas.ts', new URL('../../routes/alertas.ts', import.meta.url)],
  ['routes/escalas-preferencias.ts', new URL('../../routes/escalas-preferencias.ts', import.meta.url)],
  ['routes/frms-fira.ts', new URL('../../routes/frms-fira.ts', import.meta.url)],
  ['routes/matriz-treinamento.ts', new URL('../../routes/matriz-treinamento.ts', import.meta.url)],
  ['routes/notificacoes-convocacao.ts', new URL('../../routes/notificacoes-convocacao.ts', import.meta.url)],
  ['routes/preferencias.ts', new URL('../../routes/preferencias.ts', import.meta.url)],
  ['routes/qualificacoes/historico-helpers.ts', new URL('../../routes/qualificacoes/historico-helpers.ts', import.meta.url)],
  ['routes/qualificacoes/tipos.ts', new URL('../../routes/qualificacoes/tipos.ts', import.meta.url)],
  ['routes/simuladores-modelos.ts', new URL('../../routes/simuladores-modelos.ts', import.meta.url)],
  ['routes/treinamentos-planejados.ts', new URL('../../routes/treinamentos-planejados.ts', import.meta.url)],
  [
    'services/treinamentos-planejados-integration.ts',
    new URL('../../services/treinamentos-planejados-integration.ts', import.meta.url),
  ],
  ['utils/alert-whatsapp-templates-store.ts', new URL('../../utils/alert-whatsapp-templates-store.ts', import.meta.url)],
] as const;

const DOCUMENTED_EXCEPTIONS = [
  'runtime/api-bootstrap.ts',
  'routes/qualificacoes/historico.ts',
  'routes/qualificacoes/historico-write.ts',
  'services/sigvoos-frms.ts',
] as const;

describe('runtime DDL hardening', () => {
  it('keeps the deferred runtime-DDL allowlist explicit', () => {
    expect([...DOCUMENTED_EXCEPTIONS]).toEqual([
      'runtime/api-bootstrap.ts',
      'routes/qualificacoes/historico.ts',
      'routes/qualificacoes/historico-write.ts',
      'services/sigvoos-frms.ts',
    ]);
  });

  for (const [label, ref] of HOT_PATH_FILES) {
    it(`blocks runtime DDL in ${label}`, () => {
      const source = readFileSync(fileURLToPath(ref), 'utf8');

      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
