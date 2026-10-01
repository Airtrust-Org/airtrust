import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { TrainingComplianceSnapshot } from '../../routes/compliance-treinamentos';
import {
  buildTrainingComplianceReportRows,
  complianceReportScheduleWindow,
  generateTrainingComplianceReportPdf,
  normalizeComplianceReportAutomationPolicy,
  type ComplianceReportAutomationPolicy,
} from '../../services/training-compliance-reports';

const policy: ComplianceReportAutomationPolicy = {
  enabled: true,
  frequency: 'WEEKLY',
  weekday: 1,
  day_of_month: 1,
  time: '08:00',
  timezone: 'America/Sao_Paulo',
  sector_ids: [10],
  statuses: ['VENCIDO', 'NAO_REALIZADO', 'VENCENDO', 'EM_ANDAMENTO'],
  critical_only: false,
  due_within_days: null,
};

const snapshot = {
  people: [
    {
      id: 1,
      nome: 'Ana Piloto',
      matricula: '00001',
      setor_id: 10,
      setor_nome: 'Operações',
      funcao_id: 20,
      funcao_nome: 'Piloto',
      requisitos: [
        {
          qualificacao_tipo_id: 100,
          qualificacao_tipo_nome: 'CRM',
          qualificacao_tipo_codigo: 'CRM',
          obrigatoriedade: 'OBRIGATORIA',
          status_compliance: 'CONFORME',
          data_validade: '2027-01-01',
          dias_para_vencer: 92,
          ultima_data: '2026-01-01',
          critico_operacional: false,
          referencia_normativa: 'PTO',
        },
      ],
    },
    {
      id: 2,
      nome: 'Bruno Copiloto',
      matricula: '00002',
      setor_id: 10,
      setor_nome: 'Operações',
      funcao_id: 21,
      funcao_nome: 'Copiloto',
      requisitos: [
        {
          qualificacao_tipo_id: 100,
          qualificacao_tipo_nome: 'CRM',
          qualificacao_tipo_codigo: 'CRM',
          obrigatoriedade: 'OBRIGATORIA',
          status_compliance: 'VENCIDO',
          data_validade: '2026-09-15',
          dias_para_vencer: -16,
          ultima_data: '2025-09-15',
          critico_operacional: true,
          referencia_normativa: 'PTO',
        },
        {
          qualificacao_tipo_id: 200,
          qualificacao_tipo_nome: 'SOP',
          qualificacao_tipo_codigo: 'SOP',
          obrigatoriedade: 'RECOMENDADA',
          status_compliance: 'NAO_REALIZADO',
          data_validade: null,
          dias_para_vencer: null,
          ultima_data: null,
          critico_operacional: false,
          referencia_normativa: null,
        },
      ],
    },
  ],
} as unknown as TrainingComplianceSnapshot;

describe('training compliance reports', () => {
  it('normaliza a programação sem hardcode do dia/horário escolhido pelo usuário', () => {
    const normalized = normalizeComplianceReportAutomationPolicy({
      enabled: true,
      frequency: 'MONTHLY',
      day_of_month: 12,
      time: '14:35',
      timezone: 'America/Sao_Paulo',
      sector_ids: [10, 10, -2, '11'],
      statuses: ['CONFORME', 'VENCIDO', 'INVALIDO'],
      due_within_days: 30,
    });
    expect(normalized).toMatchObject({
      enabled: true,
      frequency: 'MONTHLY',
      day_of_month: 12,
      time: '14:35',
      sector_ids: [10, 11],
      statuses: ['CONFORME', 'VENCIDO'],
      due_within_days: 30,
    });
  });

  it('dispara a janela semanal apenas no dia e após o horário configurado', () => {
    expect(complianceReportScheduleWindow(policy, new Date('2026-10-05T10:59:00Z')).due).toBe(
      false,
    );
    const due = complianceReportScheduleWindow(policy, new Date('2026-10-05T11:00:00Z'));
    expect(due).toMatchObject({
      due: true,
      localDate: '2026-10-05',
      triggerKey: 'WEEKLY:2026-10-05',
    });
    expect(complianceReportScheduleWindow(policy, new Date('2026-10-06T11:00:00Z')).due).toBe(
      false,
    );
  });

  it('filtra por funcionário, treinamento, situação e obrigatoriedade', () => {
    const completed = buildTrainingComplianceReportRows(snapshot, {
      setor_id: 10,
      funcionario_id: 1,
      qualificacao_tipo_id: 100,
      statuses: ['CONFORME'],
    });
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      funcionario_nome: 'Ana Piloto',
      qualificacao_tipo_nome: 'CRM',
      status_compliance: 'CONFORME',
    });

    const criticalPending = buildTrainingComplianceReportRows(snapshot, {
      setor_id: 10,
      statuses: ['VENCIDO', 'NAO_REALIZADO'],
      critico: true,
    });
    expect(criticalPending).toHaveLength(1);
    expect(criticalPending[0].funcionario_nome).toBe('Bruno Copiloto');
    expect(criticalPending.some((row) => row.qualificacao_tipo_nome === 'SOP')).toBe(false);
  });

  it('gera PDF válido para envio aos gestores', async () => {
    const rows = buildTrainingComplianceReportRows(snapshot, {
      setor_id: 10,
      statuses: ['CONFORME', 'VENCIDO'],
    });
    const report = await generateTrainingComplianceReportPdf({
      rows,
      empresaNome: 'Costa do Sol',
      setorNome: 'Operações',
      generatedAt: new Date('2026-10-01T12:00:00Z'),
    });
    expect(report.bytes.length).toBeGreaterThan(500);
    expect(report.filename).toContain('operacoes');
    const parsed = await PDFDocument.load(report.bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
