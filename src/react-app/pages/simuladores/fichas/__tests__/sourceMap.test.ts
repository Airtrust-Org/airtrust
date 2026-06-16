import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceMapPath = path.resolve(
  process.cwd(),
  'scripts/operations/modelos-sessao-manobras-empresa6-source-map.json',
);

describe('modelos_sessao_manobras source-map empresa 6', () => {
  it('mantem A139-P-C1/IFR com 22 relações e inferência registrada na ordem 10', () => {
    const sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
    const rows = sourceMap.rows
      .filter((row: any) => row.modelo_codigo === 'A139-P-C1/IFR')
      .sort((a: any, b: any) => a.ordem - b.ordem);

    expect(sourceMap.meta.ready_for_full_restore).toBe(true);
    expect(sourceMap.meta.models_covered).toBe(51);
    expect(sourceMap.meta.relation_rows).toBe(1122);
    expect(sourceMap.blocked_models).toEqual([]);
    expect(rows).toHaveLength(22);
    expect(rows.map((row: any) => row.ordem)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));

    const order10 = rows.find((row: any) => row.ordem === 10);
    expect(order10).toMatchObject({
      manobra_codigo: 'CAU-DCB-56',
      classificacao_tripulante: 'AB',
      fonte_codigo:
        'operational_inference_confirmed_2026-06-16:A139-P-C1/IFR:ordem_10:derived_from_similar_A139_IFR_cycle',
    });
  });
});
