import { describe, expect, it } from 'vitest';
import {
  buildNativeTerminalTransactionGuard, type NativeTerminalAnchor,
} from '../../services/lms-native-terminal-transaction-guard';

const anchor: NativeTerminalAnchor = {
  empresaId: 6, matriculaId: 101, cicloId: 1001, cursoId: 31,
  actorUserId: 900, funcionarioId: 51, edicaoId: 7,
  editionHash: 'a'.repeat(64), bindingId: 102,
  latestAttemptId: 88, latestAttemptNumber: 2,
  answersHash: 'b'.repeat(64), scorePct: 80,
  eventCount: 8, distinctLessonCount: 6,
  gerarQualificacaoAoConcluir: true, qualificacaoTipoId: 44,
  qualificacaoCategoriaId: 45,
};
describe('Native terminal guard is an atomic D1 assertion, NOT completion', () => {
  it('binds precise user, company, edition, grade and persisted proof snapshot', () => {
    const built=buildNativeTerminalTransactionGuard(anchor);
    expect(built.sql).toMatch(/^SELECT json\(CASE WHEN/);
    expect(built.bindings).toEqual([
      900,101,6,31,51,1001,102,7,'a'.repeat(64),
      88,2,'b'.repeat(64),80,8,6,1,1,44,1,45,
    ]);
    expect(built.sql).toContain("c.tipo_conteudo='scorm'");
    expect(built.sql).toContain('activation.empresa_id=c.empresa_id');
    expect(built.sql).toContain('u.active=1');
    expect(built.sql).toContain('f.empresa_id=m.empresa_id');
    expect(built.sql).toContain('ed.artifact_sha256=?');
    expect(built.sql).toContain('COUNT(DISTINCT e.unidade_id)');
    expect(built.sql).toContain('att.assessment_satisfied=1');
    expect(built.sql).toContain('newer.tentativa_numero>att.tentativa_numero');
    expect(built.sql).toContain('qc.empresa_id=qt.empresa_id');
    expect(built.sql).toContain('qc.lms_integrada=1');
    expect(built.sql).toContain('(?=0 OR COALESCE(c.qualificacao_tipo_id,0)=?)');
    expect(built.sql).not.toMatch(/(?:UPDATE|DELETE|INSERT)\s+(?:INTO|lms_)/);
  });
  it('declares an unqualified course only with zero qualification identifiers', () => {
    const built=buildNativeTerminalTransactionGuard({
      ...anchor, gerarQualificacaoAoConcluir: false, qualificacaoTipoId:null,
      qualificacaoCategoriaId:null, scorePct:null,
    });
    expect(built.bindings.slice(-7)).toEqual([8,6,0,0,0,0,0]);
    expect(built.sql).toContain('att.score_pct IS ?');
  });
  it('denies poisoned IDs, digests, count and score snapshots before D1', () => {
    for (const patch of [
      { matriculaId: 0 }, { actorUserId: 1.5 }, { empresaId: -6 },
      { editionHash: 'XYZ' }, { answersHash: 'x'.repeat(64) },
      { eventCount: 0 }, { distinctLessonCount: 9 },
      { scorePct: -1 }, { scorePct: 101 }, { scorePct: NaN },
    ]) {
      expect(() => buildNativeTerminalTransactionGuard({ ...anchor,...patch }))
        .toThrow('NATIVE_TERMINAL_INVALID_ANCHOR');
    }
  });
  it('rejects uncertain qualification identity rather than certifying', () => {
    for (const patch of [
      { qualificacaoTipoId: null }, { qualificacaoCategoriaId: 0 },
      { gerarQualificacaoAoConcluir: false }, { qualificacaoTipoId: 7.1 },
    ]) {
      expect(() => buildNativeTerminalTransactionGuard({ ...anchor,...patch }))
        .toThrow('NATIVE_TERMINAL_QUALIFICATION_ANCHOR_INVALID');
    }
  });
});
