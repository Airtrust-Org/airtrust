import { describe, expect, it } from 'vitest';
import { assessRecordedTechnicalScores } from './recorded-technical-scores';

const row = (codigo: string, resultado: string | null, categoria = 'GERAL') => ({ codigo, resultado, categoria });
describe('PTO §4.2 recorded technical score safety gate', () => {
  it('rejects grade 5 even when grades 10 and 9 make the mean high', () => {
    const result = assessRecordedTechnicalScores([row('T01','5.0'),row('T02','10'),row('T03','9')]);
    expect(result.eligible).toBe(false);
    expect(result.belowMinimum).toEqual([{ codigo: 'T01', nota: 5 }]);
  });
  it('accepts each scored item >=6, excludes NR without calling it executed', () => {
    const result = assessRecordedTechnicalScores([row('T01','6'),row('T02','10.0'),row('T03','NR'),row('T04','NAO_REALIZADA')]);
    expect(result).toMatchObject({ eligible:true, scored:2, nonPerformed:2, belowMinimum:[] });
  });
  it('does not confuse NOTECHS rows with technical rows', () => {
    expect(assessRecordedTechnicalScores([row('NTS-1','3','NOTECHS')]).scored).toBe(0);
  });
  it.each([null,'','0','11','6.5','NaN','foo','5.5'])('rejects invalid technical assessment %s', result => {
    expect(assessRecordedTechnicalScores([row('T01',result)]).eligible).toBe(false);
  });
  it('does not approve a technical session when every technical item is NR', () => {
    expect(assessRecordedTechnicalScores([row('T01','NR'), row('T02','NAO_REALIZADA')])).toMatchObject({
      eligible: false, scored: 0, nonPerformed: 2, invalid: [], belowMinimum: [],
    });
  });
  it('keeps partial NR compatible with at least one explicitly scored technical item', () => {
    expect(assessRecordedTechnicalScores([row('T01','NR'), row('T02','6')])).toMatchObject({
      eligible: true, scored: 1, nonPerformed: 1,
    });
  });
  it('does not classify NOTECHS-only or missing technical rows as performed', () => {
    expect(assessRecordedTechnicalScores([])).toEqual({ eligible:true, scored:0, nonPerformed:0, belowMinimum:[], invalid:[] });
    expect(assessRecordedTechnicalScores([row('NTS-1','7','NOTECHS')])).toMatchObject({ eligible:true, scored:0 });
  });
});
