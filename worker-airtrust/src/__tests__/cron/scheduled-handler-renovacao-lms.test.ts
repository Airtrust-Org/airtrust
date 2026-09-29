import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildQualificacoesEadRenovacaoResilienteQuery } from '../../cron/resilient/ead-renewal';

function compactSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('renovacao automatica LMS por qualificacao EAD', () => {
  it('inclui vencidas e vencendo com paginação keyset', () => {
    const sql = compactSql(buildQualificacoesEadRenovacaoResilienteQuery());

    expect(sql).toContain('COALESCE(qh.renovada, 0) = 0');
    expect(sql).toContain('FROM treinamento_requisitos tr');
    expect(sql).toContain("tr.obrigatoriedade='OBRIGATORIA'");
    expect(sql).toContain('COALESCE(tr.auto_matricular_ead, 0) = 1');
    expect(sql).toContain("WHEN 'FUNCIONARIO' THEN 5000");
    expect(sql).toContain("WHEN 'SETOR_FUNCAO' THEN 40");
    expect(sql).toContain('funcionarios_compliance_condicoes');
    expect(sql).toContain('tr.condicao_id');
    expect(sql).toContain('AND NOT EXISTS ( SELECT 1 FROM qualificacoes_historico qh2');
    expect(sql).toContain(")) <= date('now', '+' || ? || ' days')");
    expect(sql).not.toContain("BETWEEN date('now')");
    expect(sql).toContain('AND qh.id > ?');
    expect(sql).toContain('ORDER BY qh.id ASC');
    expect(sql).toContain('LIMIT ?');
  });

  it('reabre matrícula terminal em novo ciclo e nunca marca renovação inativa como sucesso', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/cron/resilient/ead-renewal.ts'),
      'utf8',
    );

    expect(source).toContain('canReuseMatriculaCycle(existing)');
    expect(source).toContain('resetMatriculaForNewCycle(db');
    expect(source).toContain("origin: 'AUTO_RENOVACAO'");
    expect(source).not.toContain('ensureRenewalNotification(db');
    expect(source).toContain('MATRICULA_CYCLE_READY');
    expect(source).not.toContain('EXISTING_INACTIVE_PRESERVED');
    expect(source).toContain('EAD_RENEWAL_EXISTING_MATRICULA_NOT_REUSABLE');
  });

  it('renovação EAD não envia email nem notificação paralela', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/cron/resilient/ead-renewal.ts'),
      'utf8',
    );

    expect(source).not.toContain("import { sendEmail } from '../../lib/email';");
    expect(source).not.toContain('ensureRenewalEmail(');
    expect(source).not.toContain('ensureRenewalNotification(');
    expect(source).not.toContain('INSERT OR IGNORE INTO notificacoes_inapp');
    expect(source).toContain('responsabilidade exclusiva da régua canônica diária');
  });
});
