import { describe, expect, it } from 'vitest';
import {
  buildComplianceNarrative,
  complianceStatusLabel,
  type TrainingCompliancePendingRow,
} from '../training-compliance-report';

const baseRow: TrainingCompliancePendingRow = {
  funcionario_id: 1,
  funcionario_nome: 'Pessoa Teste',
  matricula: '001',
  setor_id: 10,
  setor_nome: 'Operações',
  funcao_id: 2,
  funcao_nome: 'Piloto',
  qualificacao_tipo_id: 100,
  qualificacao_tipo_nome: 'CRM',
  qualificacao_tipo_codigo: 'CRM',
  status_compliance: 'VENCIDO',
  data_validade: '2026-09-01',
  dias_para_vencer: -20,
  ultima_data: '2025-09-01',
  critico_operacional: true,
  referencia_normativa: 'PTO',
  curso_ead_titulo: 'CRM',
  tem_email: true,
  tem_whatsapp: true,
  avisos_enviados: 2,
  ultimo_aviso_em: '2026-09-20T10:00:00Z',
  ultimo_canal: 'EMAIL_COMPLIANCE',
  ultimo_status_envio: 'enviada',
};

describe('training compliance intelligent report', () => {
  it('distinguishes overdue, never done and due-soon statuses', () => {
    expect(complianceStatusLabel(baseRow)).toContain('Vencido há 20');
    expect(complianceStatusLabel({ ...baseRow, status_compliance: 'NAO_REALIZADO', dias_para_vencer: null })).toBe('Nunca realizou');
    expect(complianceStatusLabel({ ...baseRow, status_compliance: 'VENCENDO', dias_para_vencer: 7 })).toBe('Vence em 7 dia(s)');
  });

  it('builds deterministic management narrative from real aggregate counts', () => {
    const narrative = buildComplianceNarrative(
      {
        pessoas: 43,
        requisitos_obrigatorios: 100,
        conformes: 87,
        vencendo: 3,
        vencidos: 5,
        nao_realizados: 2,
        em_andamento: 3,
        compliance_pct: 87,
      },
      [baseRow, { ...baseRow, funcionario_id: 2, funcionario_nome: 'Outra Pessoa', status_compliance: 'NAO_REALIZADO' }],
      { empresaNome: 'Costa do Sol', usuarioNome: 'Administrador', setorNome: 'Operações' },
    );

    expect(narrative).toContain('O setor Operações possui 2 colaborador(es)');
    expect(narrative).toContain('5 requisito(s) estão vencidos');
    expect(narrative).toContain('2 ainda não foram realizados');
    expect(narrative).toContain('2 pendência(s) estão marcadas como críticas');
  });
});
