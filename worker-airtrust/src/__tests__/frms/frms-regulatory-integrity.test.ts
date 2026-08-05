import { describe, expect, it } from 'vitest';
import {
  calcAcumuloRolling,
  calcDuracaoJornada,
  calcEffectiveness,
  calcFatorizacao,
} from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import type { FrmsJornada, LimitesMap } from '../../lib/frms/types';

const L = LIMITES_DEFAULT;

function jornada(
  data: string,
  apresentacao: string | null,
  termino: string | null,
  hv = 0,
  overrides: Partial<FrmsJornada> = {},
): FrmsJornada {
  return {
    id: `${data}-${apresentacao}-${termino}-${hv}`,
    tripulante_id: 1,
    data,
    status: 'ES',
    hora_apresentacao: apresentacao,
    hora_termino: termino,
    duracao_jornada_minutos: null,
    horas_voo_minutos: hv,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'SIGVOOS',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tripulacao_aumentada: 0,
    classe_cabine: null,
    local_base: null,
    tipo_base: 'HOME',
    aclimatado: 1,
    ...overrides,
  };
}

function rolling(
  dataReferencia: string,
  jornadasHistorico: FrmsJornada[],
  limites: LimitesMap = L,
  timeZone = 'America/Sao_Paulo',
) {
  return calcAcumuloRolling({
    tripulanteId: 1,
    dataReferencia,
    jornadasHistorico,
    limites,
    timeZone,
    momentoCalculoHvDia: 'REALIZADO_APOS_JORNADA',
  });
}

function effect(
  j: FrmsJornada,
  repousoMin: number | null,
  horaDormiu: string | null,
  horaAcordou: string | null,
  limites: LimitesMap = L,
) {
  const fatorizacao = calcFatorizacao({
    jornada: j,
    repousoAnteriorMin: repousoMin,
    limites,
    diasDoMes: 31,
    diaDoCiclo: 1,
  });
  return calcEffectiveness(fatorizacao, limites, {
    hora_apresentacao: j.hora_apresentacao,
    hora_primeira_decolagem: j.hora_primeira_decolagem,
    hora_ultimo_pouso: j.hora_ultimo_pouso,
    hora_termino: j.hora_termino,
    hora_dormiu: horaDormiu,
    hora_acordou: horaAcordou,
  });
}

describe('FRMS regulatory calculation integrity', () => {
  it('1. término 02:00 e apresentação 10:00 resulta em 8h, sem 24h extras', () => {
    const anterior = jornada('2026-08-03', '18:00', '02:00');
    const atual = jornada('2026-08-04', '10:00', '18:00');
    const result = rolling('2026-08-04', [atual, anterior]);
    expect(result.repouso_anterior_min).toBe(480);
    expect(result.repouso_estado).toBe('INSUFICIENTE');
  });

  it('2. término 23:00 e apresentação 10:00 resulta em 11h', () => {
    const anterior = jornada('2026-08-03', '14:00', '23:00');
    const atual = jornada('2026-08-04', '10:00', '18:00');
    expect(rolling('2026-08-04', [atual, anterior]).repouso_anterior_min).toBe(660);
  });

  it('3. duas jornadas na mesma data usam timestamps civis completos', () => {
    const atual = jornada('2026-08-04', '10:00', '18:00');
    const anterior = jornada('2026-08-04', '00:00', '02:00');
    expect(rolling('2026-08-04', [atual, anterior]).repouso_anterior_min).toBe(480);
  });

  it('4. múltiplos dias preservam todos os minutos intermediários', () => {
    const anterior = jornada('2026-08-01', '08:00', '18:00');
    const atual = jornada('2026-08-03', '10:00', '18:00');
    expect(rolling('2026-08-03', [atual, anterior]).repouso_anterior_min).toBe(2400);
  });

  it('5. repouso 5h, 8h, 12h e 16h é monotônico e não recebe bônus acima de 8h', () => {
    const base = jornada('2026-08-04', '08:00', '16:00', 180);
    const e5 = effect(base, 720, '01:00', '06:00').effectiveness_pct;
    const e8 = effect(base, 720, '22:00', '06:00').effectiveness_pct;
    const e12 = effect(base, 720, '18:00', '06:00').effectiveness_pct;
    const e16 = effect(base, 720, '14:00', '06:00').effectiveness_pct;
    expect(e5).toBeLessThanOrEqual(e8);
    expect(e8).toBe(e12);
    expect(e12).toBe(e16);
  });

  it('6. perfil diurno equivalente mantém baseline superior ao noturno', () => {
    const day = jornada('2026-08-04', '08:00', '16:00', 180, {
      hora_primeira_decolagem: '09:00',
      hora_ultimo_pouso: '15:00',
    });
    const night = jornada('2026-08-04', '20:00', '04:00', 180, {
      hora_primeira_decolagem: '23:00',
      hora_ultimo_pouso: '03:30',
    });
    expect(effect(night, 720, '12:00', '20:00').effectiveness_pct).toBeLessThan(
      effect(day, 720, '22:00', '06:00').effectiveness_pct,
    );
  });

  it('7. voo noturno nunca melhora o resultado em relação ao diurno equivalente', () => {
    const day = jornada('2026-08-04', '08:00', '16:00', 180, {
      hora_primeira_decolagem: '09:00',
      hora_ultimo_pouso: '15:00',
    });
    const night = { ...day, hora_primeira_decolagem: '23:00', hora_ultimo_pouso: '04:00' };
    expect(effect(night, 720, '22:00', '06:00').effectiveness_pct).toBeLessThanOrEqual(
      effect(day, 720, '22:00', '06:00').effectiveness_pct,
    );
  });

  it('8. despertar dentro da WOCL reduz effectiveness', () => {
    const base = jornada('2026-08-04', '07:00', '15:00', 180);
    const wocl = effect(base, 720, '19:00', '03:00');
    const normal = effect(base, 720, '22:00', '06:00');
    expect(wocl.acordou_na_wocl).toBe(true);
    expect(wocl.effectiveness_pct).toBeLessThan(normal.effectiveness_pct);
  });

  it('9. horário real de despertar prevalece sobre estimativa', () => {
    const base = jornada('2026-08-04', '08:00', '16:00', 180);
    const result = effect(base, 720, '21:00', '05:15');
    expect(result.hora_despertar).toBe('05:15');
    expect(result.fonte_sono).toBe('INFORMADO');
  });

  it('10. horário estimado é identificado quando dado real está ausente', () => {
    const base = jornada('2026-08-04', '08:00', '16:00', 180);
    const result = effect(base, 720, null, null);
    expect(result.hora_despertar).toBe('06:30');
    expect(result.fonte_sono).toBe('PADRAO');
  });

  it('11. repouso desconhecido falha fechado', () => {
    const atual = jornada('2026-08-04', '10:00', '18:00');
    const result = rolling('2026-08-04', [atual]);
    expect(result.repouso_estado).toBe('DESCONHECIDO');
    expect(result.repouso_suficiente).toBe(0);
  });

  it('12. janela realizada de 24h inclui a jornada corrente', () => {
    const atual = jornada('2026-08-04', '06:00', '17:00', 180);
    const result = rolling('2026-08-04', [atual]);
    expect(result.hv_dia_min).toBe(180);
    expect(result.momento_calculo_hv_dia).toBe('REALIZADO_APOS_JORNADA');
  });

  it('13. alteração do limite configurado muda o percentual na direção esperada', () => {
    const atual = jornada('2026-08-04', '06:00', '17:00', 240);
    const normal = rolling('2026-08-04', [atual], { ...L, HV_DIARIA_HORAS: 8 });
    const restrito = rolling('2026-08-04', [atual], { ...L, HV_DIARIA_HORAS: 4 });
    expect(restrito.pct_limite_dia).toBeGreaterThan(normal.pct_limite_dia);
  });

  it('14. fatores básicos permanecem em 0–1 e totais somam somente penalidades', () => {
    const base = jornada('2026-08-04', '06:00', '17:00', 240, {
      duracao_jornada_minutos: 660,
    });
    const result = calcFatorizacao({
      jornada: base,
      repousoAnteriorMin: 720,
      limites: L,
      diasDoMes: 31,
    });
    expect(result.fator_basica_pct).toBeGreaterThanOrEqual(0);
    expect(result.fator_basica_pct).toBeLessThanOrEqual(1);
    expect(result.fator_hv_basica_pct).toBeGreaterThanOrEqual(0);
    expect(result.fator_hv_basica_pct).toBeLessThanOrEqual(1);
    expect(result.total_fatorizado_hv).toBeLessThanOrEqual(0);
  });

  it('14b. maior exposição de voo não melhora a segurança', () => {
    const pouca = jornada('2026-08-04', '08:00', '16:00', 60);
    const normal = jornada('2026-08-04', '08:00', '16:00', 180);
    const muita = jornada('2026-08-04', '08:00', '16:00', 360);
    expect(effect(normal, 720, '22:00', '06:00').effectiveness_pct).toBeLessThanOrEqual(
      effect(pouca, 720, '22:00', '06:00').effectiveness_pct,
    );
    expect(effect(muita, 720, '22:00', '06:00').effectiveness_pct).toBeLessThanOrEqual(
      effect(normal, 720, '22:00', '06:00').effectiveness_pct,
    );
  });

  it('15. maior jornada não aumenta a segurança', () => {
    const curta = jornada('2026-08-04', '08:00', '16:00', 180, {
      duracao_jornada_minutos: 480,
    });
    const longa = jornada('2026-08-04', '08:00', '20:00', 180, {
      duracao_jornada_minutos: 720,
    });
    expect(effect(longa, 720, '22:00', '06:00').effectiveness_pct).toBeLessThanOrEqual(
      effect(curta, 720, '22:00', '06:00').effectiveness_pct,
    );
  });

  it('16. timezone UTC é explícito e determinístico', () => {
    const atual = jornada('2026-08-04', '10:00', '18:00');
    const anterior = jornada('2026-08-03', '18:00', '02:00');
    const result = rolling('2026-08-04', [atual, anterior], L, 'UTC');
    expect(result.repouso_anterior_min).toBe(480);
    expect(result.timezone_operacional).toBe('UTC');
  });

  it('17. America/Sao_Paulo usa a mesma convenção civil sem depender do TZ do runtime', () => {
    const atual = jornada('2026-08-04', '10:00', '18:00');
    const anterior = jornada('2026-08-03', '18:00', '02:00');
    const result = rolling('2026-08-04', [atual, anterior], L, 'America/Sao_Paulo');
    expect(result.repouso_anterior_min).toBe(480);
    expect(result.timezone_operacional).toBe('America/Sao_Paulo');
  });

  it('18. virada de ano não altera a duração', () => {
    const anterior = jornada('2025-12-31', '18:00', '02:00');
    const atual = jornada('2026-01-01', '10:00', '18:00');
    expect(rolling('2026-01-01', [atual, anterior]).repouso_anterior_min).toBe(480);
  });

  it('19. dado temporal incompleto permanece desconhecido', () => {
    const anterior = jornada('2026-08-03', null, '23:00');
    const atual = jornada('2026-08-04', '10:00', '18:00');
    expect(rolling('2026-08-04', [atual, anterior]).repouso_estado).toBe('DESCONHECIDO');
  });

  it('20. caracteriza e elimina os valores históricos incorretos conhecidos', () => {
    const anterior = jornada('2026-08-03', '18:00', '02:00');
    const atual = jornada('2026-08-04', '10:00', '18:00', 180);
    const result = rolling('2026-08-04', [atual, anterior]);
    const valorHistoricoRepouso = 32 * 60;
    const valorHistoricoHvDia = 0;
    expect(result.repouso_anterior_min).not.toBe(valorHistoricoRepouso);
    expect(result.repouso_anterior_min).toBe(480);
    expect(result.hv_dia_min).not.toBe(valorHistoricoHvDia);
    expect(result.hv_dia_min).toBe(180);
  });

  it('não deduz almoço quando não existe pausa registrada', () => {
    const base = jornada('2026-08-04', '08:00', '17:00');
    expect(calcDuracaoJornada(base)).toBe(540);
  });

  it('separa projeção antes da jornada do realizado após a jornada', () => {
    const atual = jornada('2026-08-04', '06:00', '17:00', 180);
    const projecao = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-08-04',
      jornadasHistorico: [atual],
      limites: L,
      momentoCalculoHvDia: 'PROJECAO_ANTES_JORNADA',
    });
    const realizado = rolling('2026-08-04', [atual]);
    expect(projecao.hv_dia_min).toBe(0);
    expect(realizado.hv_dia_min).toBe(180);
  });
});
