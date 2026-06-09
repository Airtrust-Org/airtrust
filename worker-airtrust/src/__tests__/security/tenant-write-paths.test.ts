/**
 * Regression guard for tenant-aware write paths.
 *
 * These static checks protect the operational writers hardened after the
 * multi-tenant data-integrity audit. They intentionally focus on code paths
 * that can create new production data with DEFAULT empresa_id = 1.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));

function src(relPath: string): string {
  return readFileSync(join(testDir, '../../', relPath), 'utf8');
}

function compact(relPath: string): string {
  return src(relPath).replace(/\s+/g, ' ');
}

describe('tenant-aware write paths', () => {
  it('qualificacoes historico manual/renewal writes bind empresa_id explicitly', () => {
    const source = compact('routes/qualificacoes/historico-write.ts');

    expect(source).toContain('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ?');
    expect(source).toContain('FROM qualificacoes_tipos WHERE codigo = ? AND empresa_id = ?');
    expect(source).toMatch(/INSERT INTO qualificacoes_historico .* empresa_id .* VALUES/i);
    expect(source).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
  });

  it('qualification assignment and G1-SEM writers include tenant columns and scopes', () => {
    const atribuicao = compact('routes/qualificacoes/atribuicao.ts');
    const g1Sem = compact('services/qualificacoes-g1-sem.ts');

    expect(atribuicao).toContain('FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ?');
    expect(atribuicao).toMatch(/INSERT INTO qualificacoes_historico .* empresa_id/i);
    expect(g1Sem).toMatch(/INSERT INTO qualificacoes_historico .* empresa_id/i);
    expect(g1Sem).toContain('AND empresa_id = ?');
  });

  it('qualification type imports and CRUD never rely on qualificacoes_tipos default tenant', () => {
    const tiposRoute = compact('routes/qualificacoes/tipos.ts');
    const importacao = compact('services/importacao/QualificacaoTipoImportacao.ts');
    const importacaoRefactored = compact(
      'services/importacao/QualificacaoTipoImportacaoRefactored.ts',
    );

    expect(tiposRoute).toMatch(/INSERT INTO qualificacoes_tipos .* empresa_id/i);
    expect(importacao).toMatch(/INSERT INTO qualificacoes_tipos .* empresa_id/i);
    expect(importacao).toContain("WHERE UPPER(codigo) = UPPER(?) AND empresa_id = ?");
    expect(importacaoRefactored).toMatch(/INSERT INTO qualificacoes_tipos .* empresa_id/i);
    expect(importacaoRefactored).toContain("WHERE UPPER(codigo) = UPPER(?) AND empresa_id = ?");
  });

  it('spreadsheet imports write tenant explicitly for funcionarios, historico, and tipos', () => {
    const source = compact('routes/importacao-xlsx.ts');

    expect(source).toContain('getTenantContext(c)');
    expect(source).toMatch(/INSERT INTO funcionarios .* empresa_id/i);
    expect(source).toMatch(/INSERT INTO qualificacoes_historico .* empresa_id/i);
    expect(source).toMatch(/INSERT INTO qualificacoes_tipos .* empresa_id/i);
    expect(source).not.toContain('FROM tipos_qualificacoes');
  });

  it('documents and pasta virtual cascades write with tenant scope', () => {
    const pastaVirtual = compact('routes/pasta-virtual.ts');
    const pastaVirtualExtra = compact('routes/pasta-virtual-extra.ts');
    const certificados = compact('routes/qualificacoes-certificados.ts');

    expect(pastaVirtual).toMatch(/INSERT INTO documentos .* empresa_id/i);
    expect(pastaVirtualExtra).toMatch(/INSERT INTO documentos .* empresa_id/i);
    expect(certificados).toContain('UPDATE documentos SET deleted_at = datetime');
    expect(certificados).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(pastaVirtual).toContain('WHERE documento_id = ? AND empresa_id = ?');
  });

  it('setores and funcoes updates/deletes remain tenant-scoped at write time', () => {
    const setores = compact('routes/setores.ts');
    const funcoes = compact('routes/funcoes.ts');

    expect(setores).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(funcoes).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(setores).toContain('UPDATE setores SET deleted_at = datetime("now") WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(funcoes).toContain('UPDATE funcoes SET deleted_at = datetime("now") WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
  });

  it('FRMS and simulator operational writers do not create tenantless parent rows', () => {
    const frms = compact('lib/frms/db-service-jornadas.ts');
    const escalasStatus = compact('routes/escalas-status.ts');
    const sessoes = compact('routes/simuladores-sessoes.ts');
    const sessoesUpdate = compact('routes/simuladores-sessoes-update.ts');
    const fichas = compact('routes/simuladores-fichas.ts');

    expect(frms).toMatch(/INSERT INTO frms_jornada .* empresa_id/i);
    expect(frms).toMatch(/INSERT OR IGNORE INTO frms_jornada .* empresa_id/i);
    expect(escalasStatus).toMatch(/INSERT OR IGNORE INTO frms_jornada .* empresa_id/i);
    expect(sessoes).toMatch(/INSERT INTO simulador_agendamentos .* empresa_id/i);
    expect(sessoes).toMatch(/INSERT INTO fichas_sessao .* empresa_id/i);
    expect(sessoes).toContain('const { empresaId } = getTenantContext(c)');
    expect(sessoesUpdate).toMatch(/INSERT INTO fichas_sessao .* empresa_id/i);
    expect(sessoesUpdate).toContain('WHERE id=? AND empresa_id = ? AND deleted_at IS NULL');
    expect(fichas).toMatch(/INSERT INTO fichas_sessao.*empresa_id/i);
    expect(fichas).toContain('Aluno ou instrutor fora do tenant');
    expect(fichas).toContain('WHERE id=? AND empresa_id = ? AND deleted_at IS NULL');
    expect(fichas).toContain('SELECT id FROM modelos_sessao WHERE codigo = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1');
    expect(fichas).toContain('SELECT id FROM modelos_sessao WHERE nome = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1');
    expect(fichas).toContain('AND ts.empresa_id = ?');
  });
});
