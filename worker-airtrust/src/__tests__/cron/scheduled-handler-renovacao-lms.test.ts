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
    expect(source).toContain('ensureRenewalNotification(db');
    expect(source).toContain('MATRICULA_CYCLE_NOTIFICATION_READY');
    expect(source).not.toContain('EXISTING_INACTIVE_PRESERVED');
    expect(source).toContain('EAD_RENEWAL_EXISTING_MATRICULA_NOT_REUSABLE');
  });

  it('envia email focado da renovação somente após matrícula e notificação, sem tornar o job bloqueante', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/cron/resilient/ead-renewal.ts'),
      'utf8',
    );

    expect(source).toContain("import { sendEmail } from '../../lib/email';");
    expect(source).toContain('async function ensureRenewalEmail(');
    expect(source).toContain('await ensureRenewalNotification(db, payload, result.matriculaId);');
    expect(source).toContain('await ensureRenewalEmail(env, db, payload);');
    expect(
      source.indexOf('await ensureRenewalNotification(db, payload, result.matriculaId);'),
    ).toBeLessThan(source.indexOf('await ensureRenewalEmail(env, db, payload);'));
    expect(source).toContain(
      "console.warn('[ead-renewal] Falha ao enviar email de renovação:', err);",
    );
    expect(source).toContain('`${frontendUrl}/lms/cursos/${payload.curso_id}`');
  });
});
