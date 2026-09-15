import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE = 'src/react-app/pages/simuladores/planejamento/PlanejamentoSimuladoresV3.tsx';
const ROUTE = 'worker-airtrust/src/routes/simuladores-planejamento-v2.ts';
const CREW_ROUTE = 'worker-airtrust/src/routes/simuladores-planejamento-v2-crew.ts';

function source(path: string) {
  return readFileSync(`${process.cwd()}/${path}`, 'utf8');
}

describe('simulator planning V3 priority, aircraft filter and report UX', () => {
  it('exposes a dynamic aircraft filter and sends it to proposal generation', () => {
    const page = source(PAGE);
    const route = source(ROUTE);
    expect(page).toContain('Todas as aeronaves');
    expect(page).toContain('config?.equipment_options');
    expect(page).toMatch(/JSON\.stringify\([\s\S]*?equipment,[\s\S]*?\)/);
    expect(route).toContain('equipment_options: equipmentOptions');
    expect(route).toContain('equipment_filter: equipmentFilter');
  });

  it('separates participant replacement from session/training replacement', () => {
    const page = source(PAGE);
    const crew = source(CREW_ROUTE);
    expect(page).toContain('Trocar participante');
    expect(page).toContain('Trocar sessão');
    expect(page).toContain('openSessionSwap');
    expect(crew).toContain("'/alternativas-sessao'");
    expect(crew).toContain('canManuallyShareSimulatorTrainingSessions');
  });

  it('surfaces recurring-over-semiannual coverage instead of presenting mixed curricula as neutral', () => {
    const page = source(PAGE);
    const route = source(ROUTE);
    expect(page).toContain('Periódico prioritário');
    expect(page).toContain('renova');
    expect(route).toContain('RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL');
    expect(route).toContain('satisfies_qualification_type_ids');
  });

  it('uses the canonical legacy-completion rule before promoting Semestral to Periódico', () => {
    const route = source(ROUTE);
    expect(route).toContain('AND data_conclusao IS NOT NULL');
    expect(route).toContain("AND date(data_conclusao) <= date('now')");
    expect(route).toContain("'CONCLUIDA','CONCLUIDO','RENOVADA','VALIDA','VÁLIDA','VENCIDA','PROXIMA_VENCIMENTO','VENCENDO','VENCENDO_30'");
    expect(route).toContain("OR TRIM(COALESCE(status,'')) = ''");
  });

  it('renders the PDF with visual hierarchy, status palettes and summary cards', () => {
    const page = source(PAGE);
    expect(page).toContain("doc.setFillColor(...navy)");
    expect(page).toContain('summaryCards');
    expect(page).toContain('statusPalette');
    expect(page).toContain('roundedRect');
    expect(page).toContain('Aeronaves:');
    expect(page).toContain('CRITÉRIO OPERACIONAL');
  });
});
