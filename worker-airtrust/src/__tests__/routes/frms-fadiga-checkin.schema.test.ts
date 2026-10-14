import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CheckinCreateSchema } from '../../routes/frms-fadiga-checkin.schema';

describe('frms-fadiga-checkin schema', () => {
  it('aceita payload simplificado mobile-first sem sintomas e sem horas_sono_48h', () => {
    const parsed = CheckinCreateSchema.safeParse({
      reference_date: '2026-05-29',
      data_checkin: '2026-05-29',
      wake_time: '05:30',
      hora_acordou: '05:30',
      horas_sono_24h: 7,
      qualidade_sono: 4,
      kss_score: 3,
      subjective_fatigue_level: 3,
      sleepiness_level: 3,
      fit_for_duty: true,
      meds_ult_12h: null,
      alcool_ult_12h: null,
      aceite_termos: true,
      aceite_privacidade: true,
    });

    expect(parsed.success).toBe(true);
  });

  it('aceita todos os novos valores discretos de sono sem quebrar o contrato', () => {
    const novosValores = [9.5, 9, 8, 7, 6, 5, 4, 3.5];

    for (const horas_sono_24h of novosValores) {
      const parsed = CheckinCreateSchema.safeParse({
        reference_date: '2026-05-29',
        data_checkin: '2026-05-29',
        wake_time: '05:30',
        hora_acordou: '05:30',
        horas_sono_24h,
        qualidade_sono: 5,
        kss_score: 1,
        subjective_fatigue_level: 1,
        sleepiness_level: 1,
        fit_for_duty: true,
        meds_ult_12h: null,
        alcool_ult_12h: null,
        aceite_termos: true,
        aceite_privacidade: true,
      });

      expect(parsed.success).toBe(true);
    }
  });

  it('continua aceitando valores históricos de sono já registrados', () => {
    const valoresHistoricos = [8.5, 7, 5.5, 4.5, 3.5];

    for (const horas_sono_24h of valoresHistoricos) {
      const parsed = CheckinCreateSchema.safeParse({
        reference_date: '2026-05-29',
        data_checkin: '2026-05-29',
        wake_time: '05:30',
        hora_acordou: '05:30',
        horas_sono_24h,
        qualidade_sono: 4,
        kss_score: 3,
        subjective_fatigue_level: 3,
        sleepiness_level: 3,
        fit_for_duty: true,
        meds_ult_12h: null,
        alcool_ult_12h: null,
        aceite_termos: true,
        aceite_privacidade: true,
      });

      expect(parsed.success).toBe(true);
    }
  });

  it('rejeita inaptidao sem motivo', () => {
    const parsed = CheckinCreateSchema.safeParse({
      data_checkin: '2026-05-29',
      wake_time: '05:30',
      horas_sono_24h: 6,
      kss_score: 7,
      fit_for_duty: false,
    });

    expect(parsed.success).toBe(false);
  });

  it('aceita inaptidao com motivo', () => {
    const parsed = CheckinCreateSchema.safeParse({
      data_checkin: '2026-05-29',
      wake_time: '05:30',
      horas_sono_24h: 6,
      kss_score: 7,
      fit_for_duty: false,
      motivo_inaptidao: 'Preciso revisar condicao com a coordenacao.',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejeita payload sem fit_for_duty e sem apto', () => {
    const parsed = CheckinCreateSchema.safeParse({
      data_checkin: '2026-05-29',
      wake_time: '05:30',
      horas_sono_24h: 6,
      kss_score: 5,
    });

    expect(parsed.success).toBe(false);
  });

  it('não confunde oportunidade de sono com sono efetivo', () => {
    const base = {
      wake_time: '05:30',
      hora_apresentacao: '06:30',
      horas_sono_24h: 5,
      oportunidade_sono_horas_24h: 8,
      qualidade_sono: 2,
      kss_score: 6,
      fit_for_duty: true,
    };
    const valid = CheckinCreateSchema.safeParse(base);
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.horas_sono_24h).toBe(5);
      expect(valid.data.oportunidade_sono_horas_24h).toBe(8);
    }
    // Sleep may include a nap outside the applicable regulatory rest opportunity.
    // The two measures are separate; do not invent a cross-field constraint.
    expect(CheckinCreateSchema.safeParse({
      ...base, horas_sono_24h: 8, oportunidade_sono_horas_24h: 5,
    }).success).toBe(true);
  });

  it('não inventa oportunidade de sono para clientes legados', () => {
    const result = CheckinCreateSchema.safeParse({
      wake_time: '05:30', horas_sono_24h: 7, kss_score: 3, fit_for_duty: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.oportunidade_sono_horas_24h).toBeUndefined();
  });
  it('executa o UPDATE real no SQLite e apaga oportunidade obsoleta sem alterar sono efetivo', () => {
    // Vitest 2 (Vite) cannot resolve node:sqlite via dynamic import; native Node require bypasses bundling.
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const source = readFileSync('src/routes/frms-fadiga-checkin-legacy.ts', 'utf8');
    const sql = source.match(/`UPDATE frms_fadiga_checkin\\s+SET[\\s\\S]*?WHERE id = \\?`/)?.[0].slice(1, -1);
    expect(sql).toBeTruthy();

    // Executa exatamente o UPDATE do handler, não uma cópia simplificada do SQL.
    const setBody = sql!.split(/\\s+SET\\s+/)[1].split(/\\s+WHERE id = \\?/)[0];
    const columns = [...setBody.matchAll(/(?:^|,)\\s*([a-z_]+)\\s*=/g)].map((match) => match[1]);
    const placeholders = [...setBody.matchAll(/([a-z_]+)\\s*=\\s*\\?/g)].map((match) => match[1]);
    expect(columns).toContain('oportunidade_sono_horas_24h');
    expect(placeholders).toContain('oportunidade_sono_horas_24h');

    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE frms_fadiga_checkin (id TEXT PRIMARY KEY, ${columns.map((column) =>
        `${column} ${column === 'oportunidade_sono_horas_24h' ? 'REAL' : 'TEXT'}`,
      ).join(', ')})`);
      db.prepare('INSERT INTO frms_fadiga_checkin (id, horas_sono, oportunidade_sono_horas_24h) VALUES (?, ?, ?)')
        .run('checkin-qa', 5, 8);

      const update = (opportunity: number | null) => db.prepare(sql!).run(
        ...placeholders.map((column) => column === 'oportunidade_sono_horas_24h' ? opportunity
          : column === 'horas_sono' ? 5
            : column === 'kss_score' ? 6
              : null),
        'checkin-qa',
      );
      // Cliente remove oportunidade do standby; ausência tem semântica NULL.
      update(null);
      const afterOmission = db.prepare(
        'SELECT horas_sono, oportunidade_sono_horas_24h FROM frms_fadiga_checkin WHERE id = ?',
      ).get('checkin-qa') as { horas_sono: string | number; oportunidade_sono_horas_24h: number | null };
      expect(afterOmission.oportunidade_sono_horas_24h).toBeNull();
      expect(Number(afterOmission.horas_sono)).toBe(5);

      update(6);
      expect(db.prepare(
        'SELECT oportunidade_sono_horas_24h FROM frms_fadiga_checkin WHERE id = ?',
      ).get('checkin-qa')?.oportunidade_sono_horas_24h).toBe(6);
    } finally {
      db.close();
    }
  });
});
