import { describe, expect, it } from 'vitest';
import {
  buildFrmsCaseResolutionNotes,
  buildFrmsCaseTreatmentNotes,
  readFrmsPendingTreatment,
} from '../../lib/frms/case-resolution';

const treatment = {
  responsavel: 'Coordenação Operacional',
  prazo: '2026-10-15',
  acao_mitigacao: 'Reposicionar tripulante e confirmar repouso do período.',
  justificativa: 'Mitigação necessária diante do histórico de jornada.',
  evidencia_referencia: 'FRMS-REFERENCIA-001',
};

describe('FRMS — tratamento separado de encerramento', () => {
  it('registra responsável, prazo e ação sem alegar resolução', () => {
    const raw = buildFrmsCaseTreatmentNotes(treatment, 'user-19');
    expect(raw).not.toBeNull();
    const obj = JSON.parse(raw!);
    expect(obj.schema).toBe('FRMS_CASE_TREATMENT_V1');
    expect(obj.registrado_por).toBe('user-19');
    expect(obj).not.toHaveProperty('fechado_em');
    expect(readFrmsPendingTreatment(raw)).toMatchObject(treatment);
  });

  it('rejeita formulário incompleto e JSON legado como tratamento pendente', () => {
    expect(buildFrmsCaseTreatmentNotes({ ...treatment, acao_mitigacao: 'curta' }, 'user-1')).toBeNull();
    expect(readFrmsPendingTreatment('not-json')).toBeNull();
    expect(readFrmsPendingTreatment(JSON.stringify({
      schema: 'FRMS_CASE_RESOLUTION_V1', ...treatment,
    }))).toBeNull();
  });

  it('exige avaliação de eficácia válida ao encerrar', () => {
    const pending = readFrmsPendingTreatment(buildFrmsCaseTreatmentNotes(treatment, 'user-1'));
    expect(pending).toMatchObject(treatment);
    expect(buildFrmsCaseResolutionNotes({ ...pending, avaliacao_eficacia: 'sem prova' }, 'user-2')).toBeNull();
    const resolution = buildFrmsCaseResolutionNotes({
      ...pending,
      avaliacao_eficacia: 'Repouso e jornada conferidos por revisão registrada.',
    }, 'user-2');
    expect(JSON.parse(resolution!)).toMatchObject({
      schema: 'FRMS_CASE_RESOLUTION_V1', fechado_por: 'user-2',
    });
  });
});
