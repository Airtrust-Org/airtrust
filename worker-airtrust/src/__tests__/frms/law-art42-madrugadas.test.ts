import { describe, expect, it } from 'vitest';
import { buildArt42DutiesByCrew, evaluateLawArt42Madrugadas } from '../../lib/frms/law-art42-madrugadas';

const duty = (data: string, hora_apresentacao: string | null, hora_termino: string | null) => ({
  data, hora_apresentacao, hora_termino,
});

describe('Lei 13.475 art. 42 — madrugadas', () => {
  it('apresentação às 07:00 não toca madrugada', () => {
    const result = evaluateLawArt42Madrugadas('2026-11-03', [duty('2026-11-03', '07:00', '17:00')]);
    expect(result.touchesMadrugada).toBe(false);
    expect(result.violations).toEqual([]);
  });

  it('§4º: toque parcial (05:30) conta como madrugada', () => {
    const result = evaluateLawArt42Madrugadas('2026-11-03', [duty('2026-11-03', '05:30', '15:00')]);
    expect(result).toMatchObject({ touchesMadrugada: true, consecutiveMadrugadas: 1, madrugadasIn168h: 1 });
  });

  it('jornada 22:00–02:00 toca a madrugada do dia seguinte', () => {
    const result = evaluateLawArt42Madrugadas('2026-11-03', [duty('2026-11-03', '22:00', '02:00')]);
    expect(result.touchesMadrugada).toBe(true);
  });

  it('duas madrugadas consecutivas são permitidas; a terceira viola o caput', () => {
    const history = [
      duty('2026-11-01', '05:30', '14:00'),
      duty('2026-11-02', '05:30', '14:00'),
      duty('2026-11-03', '05:30', '14:00'),
    ];
    expect(evaluateLawArt42Madrugadas('2026-11-02', history).violations).toEqual([]);
    const third = evaluateLawArt42Madrugadas('2026-11-03', history);
    expect(third.consecutiveMadrugadas).toBe(3);
    expect(third.violations).toContain('LAW_ART42_CONSECUTIVE');
  });

  it('quinta madrugada em 168 h viola mesmo sem 3 consecutivas', () => {
    // Madrugadas em 01, 02, 04, 05 e 07: nunca 3 seguidas, 5 dentro de 168 h a partir de 01 05:30.
    const history = ['01', '02', '04', '05', '07'].map((d) => duty(`2026-11-${d}`, '05:30', '13:00'));
    const fourth = evaluateLawArt42Madrugadas('2026-11-05', history);
    expect(fourth.madrugadasIn168h).toBe(4);
    expect(fourth.violations).toEqual([]);
    const fifth = evaluateLawArt42Madrugadas('2026-11-07', history);
    expect(fifth.consecutiveMadrugadas).toBe(1);
    expect(fifth.madrugadasIn168h).toBe(5);
    expect(fifth.violations).toEqual(['LAW_ART42_168H']);
  });

  it('§2º: 48 h livres reiniciam a contagem de 168 h', () => {
    const history = [
      duty('2026-11-01', '05:30', '13:00'),
      duty('2026-11-02', '05:30', '13:00'),
      // 02 13:00 → 05 05:30 = 64h30 livres → reinicia
      duty('2026-11-05', '05:30', '13:00'),
      duty('2026-11-06', '05:30', '13:00'),
      duty('2026-11-07', '22:00', '04:00'),
    ];
    const result = evaluateLawArt42Madrugadas('2026-11-07', history);
    // Após o reinício, apenas 05, 06 e 08 (jornada de 07 22:00 toca a madrugada de 08).
    expect(result.madrugadasIn168h).toBe(3);
    expect(result.violations).toEqual([]);
  });

  it('jornada sem horário não é presumida livre: fica registrada como incompleta', () => {
    const result = evaluateLawArt42Madrugadas('2026-11-03', [
      duty('2026-11-02', null, null),
      duty('2026-11-03', '05:30', '14:00'),
    ]);
    expect(result.incompleteDuties).toBe(1);
    expect(result.consecutiveMadrugadas).toBe(1);
  });

  it('virada de mês e ano não quebra a sequência', () => {
    const history = [
      duty('2026-12-30', '05:00', '12:00'),
      duty('2026-12-31', '05:00', '12:00'),
      duty('2027-01-01', '05:00', '12:00'),
    ];
    expect(evaluateLawArt42Madrugadas('2027-01-01', history).violations).toContain('LAW_ART42_CONSECUTIVE');
  });

  it('jornada realizada prevalece sobre a escala do mesmo dia; escala antecipa dias futuros', () => {
    const map = buildArt42DutiesByCrew(
      [{ data_operacional: '2026-11-03', funcionario_id: 7, hora_apresentacao: '07:00', hora_termino: '15:00', has_operational_data: 1 }],
      [
        { data_operacional: '2026-11-03', funcionario_id: 7, hora_apresentacao: '05:30', hora_termino: '14:00' },
        { data_operacional: '2026-11-04', funcionario_id: 7, hora_apresentacao: '05:30', hora_termino: '14:00' },
      ],
    );
    expect(map.get(7)).toEqual([
      { data: '2026-11-03', hora_apresentacao: '07:00', hora_termino: '15:00' },
      { data: '2026-11-04', hora_apresentacao: '05:30', hora_termino: '14:00' },
    ]);
  });
});
