import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseArgs,
  assertGuards,
  buildSyntheticFiraText,
} from '../../../../scripts/staging/frms-fira-canonical-qa.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const runnerSource = readFileSync(
  join(testDir, '../../../../scripts/staging/frms-fira-canonical-qa.mjs'),
  'utf8',
);

describe('frms-fira-canonical-qa runner — guards (staging-only, tenant-only, fail-closed)', () => {
  it('A: production database id => ABORT', () => {
    const args = parseArgs(['--dry-run', '--db-id=7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae']);
    expect(() => assertGuards(args)).toThrow(/production\/dev blocklist/);
  });

  it('A2: production database name => ABORT even if id happens to be omitted', () => {
    const args = parseArgs(['--dry-run', '--db-name=airtrust-db']);
    expect(() => assertGuards(args)).toThrow(/not the expected staging D1/);
  });

  it('B: tenant != 999006 => ABORT (no generic empresa default accepted)', () => {
    const args = parseArgs(['--dry-run', '--empresa-id=1']);
    expect(() => assertGuards(args)).toThrow(/empresaId must be exactly 999006/);
  });

  it('C: wrong environment => ABORT', () => {
    const args = parseArgs(['--dry-run', '--environment=production']);
    expect(() => assertGuards(args)).toThrow(/environment must be exactly "staging"/);
  });

  it('D: default invocation (staging D1, empresa 999006) passes guards', () => {
    const args = parseArgs(['--dry-run']);
    const result = assertGuards(args);
    expect(result).toEqual({
      environment: 'staging',
      dbName: 'airtrust-db-staging-baseline-20260701',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      empresaId: 999006,
    });
  });

  it('default mode is dry-run; --apply is required to enable writes', () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(['--dry-run']).apply).toBe(false);
    expect(parseArgs(['--apply']).apply).toBe(true);
  });
});

describe('frms-fira-canonical-qa runner — canonical-service reuse (item G)', () => {
  it('imports processarUploadFira and confirmarImportacaoFira from the real, unmodified fira-service module', () => {
    expect(runnerSource).toMatch(
      /import\(\s*fileURLToPath\(new URL\('\.\.\/\.\.\/worker-airtrust\/src\/lib\/frms\/fira-service\.ts', import\.meta\.url\)\)\s*\)/,
    );
    expect(runnerSource).toMatch(/const \{ processarUploadFira, confirmarImportacaoFira \}/);
  });

  it('does not reimplement fatorização/effectiveness/calc logic locally (no calcFatorizacao/salvarJornada definitions)', () => {
    expect(runnerSource).not.toMatch(/function\s+calcFatorizacao/);
    expect(runnerSource).not.toMatch(/function\s+salvarJornada/);
    expect(runnerSource).not.toMatch(/function\s+calcularScoreFadiga/);
  });

  it('never inserts directly into frms_fatorizacao_jornada (no fabricated calculated result)', () => {
    expect(runnerSource).not.toMatch(/INSERT INTO frms_fatorizacao_jornada/i);
  });
});

describe('frms-fira-canonical-qa runner — fixture generation (item J: cross-tenant impossible by construction)', () => {
  it('builds a valid month of FIRA-shaped text with the requested duty days and off days', () => {
    const { texto, dutyDays } = buildSyntheticFiraText({
      ano: 2026,
      mes: 8,
      mesNome: 'AGOSTO',
      canac: '999006',
      nome: 'QA INSTRUTOR EXAMINADOR',
    });
    expect(texto).toContain('999006');
    expect(texto).toContain('TRIPULANTE');
    expect(texto).toContain('Ano 2026 Mês AGOSTO');
    expect(dutyDays).toEqual([2, 5, 9, 12, 16, 19, 23]);
    // 31 days in August, one line per day plus header/tripulante lines.
    const dayTokenCount = (texto.match(/\b\d{2} (DOM|SEG|TER|QUA|QUI|SEX|SAB) /g) || []).length;
    expect(dayTokenCount).toBe(31);
  });

  it('does not embed a literal "empresa_id" tag in the fixture text itself (tenant scoping happens entirely via the CANAC->funcionarios.empresa_id lookup in fira-service, not via any field in the FIRA text)', () => {
    const { texto } = buildSyntheticFiraText({
      ano: 2026, mes: 8, mesNome: 'AGOSTO', canac: '999006', nome: 'QA INSTRUTOR EXAMINADOR',
    });
    expect(texto).not.toMatch(/empresa_id/i);
  });

  it('is parseable by the real, unmodified parseFira function (no custom parser)', async () => {
    const { parseFira } = await import('../../lib/frms/fira-parser');
    const { texto } = buildSyntheticFiraText({
      ano: 2026, mes: 8, mesNome: 'AGOSTO', canac: '999006', nome: 'QA INSTRUTOR EXAMINADOR',
    });
    const result = parseFira(texto);
    expect(result.cabecalho.canac).toBe('999006');
    expect(result.cabecalho.ano).toBe(2026);
    expect(result.cabecalho.mes).toBe(8);
    expect(result.dias).toHaveLength(31);
    const dutyLines = result.dias.filter((d) => d.situacao === 'ES');
    expect(dutyLines.map((d) => d.dia)).toEqual([2, 5, 9, 12, 16, 19, 23]);
  });
});
