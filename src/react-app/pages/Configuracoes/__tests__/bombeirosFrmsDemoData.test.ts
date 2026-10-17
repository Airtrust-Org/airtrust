import { describe, expect, it } from 'vitest';
import {
  BOMBEIROS_DEMO_COMPANY, BOMBEIROS_FRMS_SCENARIOS,
  bombeirosDemoCrewCanBeReleased, bombeirosDemoSummary, mayPreviewBombeirosFrmsDemo,
} from '../bombeirosFrmsDemoData';

describe('prévia sintética Bombeiros isolada', () => {
  it('é explicitamente fictícia, não ativa um tenant e não inclui Costa do Sol', () => {
    expect(BOMBEIROS_DEMO_COMPANY).toMatchObject({
      codigo: 'bombeiros',
      ativo: false,
      maxFuncionarios: 130,
      natureza: 'DEMONSTRACAO_SEM_PERSISTENCIA',
    });
    expect(BOMBEIROS_DEMO_COMPANY.modulosAtivos).toEqual([]);
    expect(BOMBEIROS_FRMS_SCENARIOS.length).toBeGreaterThanOrEqual(5);
    expect(BOMBEIROS_FRMS_SCENARIOS.every(s => s.id.startsWith('QA-BOM-'))).toBe(true);
    expect(BOMBEIROS_FRMS_SCENARIOS.every(s => s.nome.startsWith('QA '))).toBe(true);
    expect(JSON.stringify(BOMBEIROS_FRMS_SCENARIOS).toLowerCase()).not.toContain('costa do sol');
  });

  it('não mostra bombeiros no contexto Costa do Sol ou em produção', () => {
    expect(mayPreviewBombeirosFrmsDemo(true, 'costadosol', 'staging.airtrust.pages.dev')).toBe(false);
    expect(mayPreviewBombeirosFrmsDemo(true, 'airtrust', 'airtrust.online')).toBe(false);
    expect(mayPreviewBombeirosFrmsDemo(true, 'airtrust', 'staging.airtrust.pages.dev.evil.com')).toBe(false);
    expect(mayPreviewBombeirosFrmsDemo(false, 'airtrust', 'staging.airtrust.pages.dev')).toBe(false);
    expect(mayPreviewBombeirosFrmsDemo(true, 'airtrust', 'staging.airtrust.pages.dev')).toBe(true);
  });

  it('mantém check-in ausente e risco acumulado críticos visíveis nos dados', () => {
    const s = bombeirosDemoSummary();
    expect(s.total).toBe(BOMBEIROS_FRMS_SCENARIOS.length);
    expect(s.recebidos + s.semCheckin).toBe(s.total);
    expect(s.semCheckin).toBeGreaterThan(0);
    expect(s.criticos).toBeGreaterThan(0);
  });

  it('não trata falta de check-in ou acúmulo crítico como liberação', () => {
    expect(bombeirosDemoCrewCanBeReleased(BOMBEIROS_FRMS_SCENARIOS)).toBe(false);
    expect(bombeirosDemoCrewCanBeReleased([])).toBe(false);
    const ok = BOMBEIROS_FRMS_SCENARIOS.filter(s => s.estado === 'SEM_ALERTA');
    expect(bombeirosDemoCrewCanBeReleased(ok)).toBe(true);
    expect(bombeirosDemoCrewCanBeReleased([
      { ...ok[0], checkin: 'PENDENTE' },
    ])).toBe(false);
  });
});
