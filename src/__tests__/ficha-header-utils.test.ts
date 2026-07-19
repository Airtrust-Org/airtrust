import { describe, expect, it } from 'vitest';

import {
  buildFichaHeaderRows,
  buildFichaHeaderTitle,
  buildSimulatorDisplayName,
  formatMinutesAsHHMM,
  getInstructionSeatLabel,
  normalizeInstructionSeatValue,
  resolveOperationalHours,
} from '@/shared/simuladores/ficha-header';

describe('ficha-header utils', () => {
  it('formats minutes as HH:MM', () => {
    expect(formatMinutesAsHHMM(120)).toBe('02:00');
    expect(formatMinutesAsHHMM(90)).toBe('01:30');
  });

  it('ignores aircraft model masquerading as simulator code', () => {
    expect(
      buildSimulatorDisplayName({
        simulatorCode: 'AW139',
        simulatorName: 'FFS AW139',
        simulatorModel: 'AW139',
      }),
    ).toBe('FFS AW139');
    expect(
      buildSimulatorDisplayName({
        simulatorCode: 'SIM-AW139-01',
        simulatorName: 'FFS AW139',
        simulatorModel: 'AW139',
      }),
    ).toBe('SIM-AW139-01 — FFS AW139');
  });

  it('resolves operational hours with segment priority and equal split fallback', () => {
    expect(
      resolveOperationalHours({
        segmentTotalMinutes: 90,
        segmentPfMinutes: 60,
        segmentPmMinutes: 30,
        canonicalPfHours: 1,
        canonicalPmHours: 1,
        fallbackTotalMinutes: 120,
        participantCount: 2,
      }),
    ).toEqual({
      totalMinutes: 90,
      pfMinutes: 60,
      pmMinutes: 30,
    });

    expect(
      resolveOperationalHours({
        fallbackTotalMinutes: 120,
        participantCount: 2,
      }),
    ).toEqual({
      totalMinutes: 120,
      pfMinutes: 60,
      pmMinutes: 60,
    });
  });

  it('normalizes and labels instruction seat values', () => {
    expect(normalizeInstructionSeatValue('estacao_instrutor')).toBe('ESTACAO_INSTRUTOR');
    expect(getInstructionSeatLabel('ESTACAO_INSTRUTOR')).toBe('Estação do instrutor');
  });

  it('builds operational header rows with total, PF/PM, separate equipment and simulator', () => {
    expect(
      buildFichaHeaderRows({
        data: '14/07/2026',
        horarioInicio: '08:00',
        horarioFim: '09:30',
        cargaHorariaTotal: '01:30',
        cargaHorariaPf: '01:00',
        cargaHorariaPm: '00:30',
        tripulanteNome: 'Tripulante Teste',
        tripulanteCodigoAnac: '123456',
        tripulanteFuncao: 'PF',
        instrutorNome: 'Instrutor Teste',
        instrutorCodigoAnac: '654321',
        simuladorDisplayName: 'SIM-AW139-01 — FFS AW139',
        simuladorModelo: 'AW139',
      }),
    ).toEqual([
      [
        { label: 'Data', value: '14/07/2026' },
        { label: 'Horário', value: '08:00 – 09:30' },
        { label: 'Carga Horária', value: '01:30' },
        { label: 'PF', value: '01:00' },
        { label: 'PM', value: '00:30' },
      ],
      [
        { label: 'Tripulante', value: 'Tripulante Teste' },
        { label: 'ANAC', value: '123456' },
        { label: 'Função', value: 'PF' },
      ],
      [
        { label: 'Instrutor', value: 'Instrutor Teste' },
        { label: 'ANAC', value: '654321' },
        { label: 'Simulador', value: 'SIM-AW139-01 — FFS AW139' },
        { label: 'Modelo', value: 'AW139' },
      ],
    ]);
  });

  it('builds instructor-special header rows without PF/PM and with readable seat label', () => {
    expect(
      buildFichaHeaderRows({
        sessaoCodigo: 'INST-E01',
        data: '14/07/2026',
        horarioInicio: '10:00',
        horarioFim: '12:00',
        cargaHorariaTotal: '02:00',
        tripulanteNome: 'Instrutor-aluno Teste',
        tripulanteCodigoAnac: '111111',
        instrutorNome: 'Supervisor Teste',
        instrutorCodigoAnac: '222222',
        simuladorDisplayName: 'SIM-S76-01 — FFS S76',
        equipamentoUtilizado: 'S76',
        dispositivoIdentificacao: 'MAT-PTXYZ',
        assentoInstrucaoUtilizado: 'ESTACAO_INSTRUTOR',
      }),
    ).toEqual([
      [
        { label: 'Data', value: '14/07/2026' },
        { label: 'Horário', value: '10:00 – 12:00' },
        { label: 'Carga Horária', value: '02:00' },
        { label: 'Modelo', value: 'S76' },
      ],
      [
        { label: 'Instrutor-aluno', value: 'Instrutor-aluno Teste' },
        { label: 'ANAC', value: '111111' },
        { label: 'Instrutor supervisor', value: 'Supervisor Teste' },
        { label: 'ANAC', value: '222222' },
      ],
      [
        { label: 'Simulador', value: 'SIM-S76-01 — FFS S76' },
        { label: 'Dispositivo/Matrícula', value: 'MAT-PTXYZ' },
        { label: 'Assento', value: 'Estação do instrutor' },
      ],
    ]);
  });

  it('builds the same fixed title1 regardless of session data, keeping frontend/worker parity', () => {
    expect(buildFichaHeaderTitle({}).title1).toBe('FICHA DE TREINAMENTO DE VOO');
    expect(
      buildFichaHeaderTitle({ sessaoTitulo: 'Qualquer Sessão' }).title1,
    ).toBe('FICHA DE TREINAMENTO DE VOO');
    expect(
      buildFichaHeaderTitle({ sessaoCodigo: 'EXA-E01' }).title1,
    ).toBe('FICHA DE TREINAMENTO DE VOO');
  });

  it('prefers the special-event subtitle for title2 over raw session title fields', () => {
    expect(
      buildFichaHeaderTitle({
        sessaoCodigo: 'EXA-E01',
        sessaoTitulo: 'Deveria ser ignorado',
        sessaoTituloLinha1: 'Também ignorado',
      }).title2,
    ).toBe('SOP Normal e Condução Inicial / SOP Anormal e Avaliação');
  });

  it('falls back to sessaoTituloLinha2, then linha1, then sessaoTitulo when there is no special definition', () => {
    expect(
      buildFichaHeaderTitle({
        sessaoTituloLinha2: 'Linha 2',
        sessaoTituloLinha1: 'Linha 1',
        sessaoTitulo: 'Título Único',
      }).title2,
    ).toBe('Linha 2');

    expect(
      buildFichaHeaderTitle({
        sessaoTituloLinha1: 'Linha 1',
        sessaoTitulo: 'Título Único',
      }).title2,
    ).toBe('Linha 1');

    expect(buildFichaHeaderTitle({ sessaoTitulo: 'Título Único' }).title2).toBe('Título Único');
  });

  it('returns an empty title2 when no session data is available', () => {
    expect(buildFichaHeaderTitle({}).title2).toBe('');
    expect(buildFichaHeaderTitle({ sessaoCodigo: null }).title2).toBe('');
  });
});
