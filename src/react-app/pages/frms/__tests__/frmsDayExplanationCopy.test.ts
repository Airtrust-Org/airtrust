import { describe, expect, it } from 'vitest';
import { buildFrmsOperatorExplanationCopy } from '../frmsDayExplanationCopy';

describe('buildFrmsOperatorExplanationCopy', () => {
  it('gera explicacao operacional simples sem linguagem de decisao automatica', () => {
    const copy = buildFrmsOperatorExplanationCopy({
      tripulanteNome: 'Tripulante Teste',
      effectivenessPct: 82.4,
      effectivenessLabel: 'Atenção',
      fatorPrincipal: 'Repouso',
      sonoEfetivoMin: 410,
      fonteSonoLabel: 'Fonte do sono: informado',
      tempoAtencaoMin: 45,
      recalcPendente: false,
    });

    expect(copy.resumo).toContain('82.4%');
    expect(copy.fatores).toContain('Principal influência registrada: Repouso.');
    expect(copy.fatores).toContain('Sono considerado no cálculo: 6h50.');
    expect(copy.interpretacao).toContain('não como liberação ou bloqueio automático');
    expect(copy.limitacao).toContain('triagem');
    expect(copy.limitacao).toContain('Não é diagnóstico médico');
    expect(copy.limitacao).toContain('não é validação SAFTE-FAST');
    expect(JSON.stringify(copy)).not.toMatch(/apto|inapto|cientificamente validado/i);
  });

  it('destaca recálculo pendente quando falta base de apresentação', () => {
    const copy = buildFrmsOperatorExplanationCopy({
      effectivenessPct: null,
      fatorPrincipal: null,
      sonoEfetivoMin: null,
      fonteSonoLabel: 'Fonte do sono: estimado',
      recalcPendente: true,
    });

    expect(copy.resumo).toContain('não recebeu base suficiente');
    expect(copy.atencaoOperacional).toContain('recálculo pendente');
  });
});
