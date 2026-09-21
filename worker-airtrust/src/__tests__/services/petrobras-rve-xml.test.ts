import { describe, expect, it } from 'vitest';
import {
  PETROBRAS_RVE_FIELDS,
  buildPetrobrasRveXml,
  buildPetrobrasRveRecords,
  encodePetrobrasRveIso88591,
  serializePetrobrasRveXml,
  type PetrobrasRveRecord,
} from '../../services/controle-voos/petrobras-rve-xml';

describe('Petrobras RVE XML', () => {
  it('reproduz a sequencia operacional observada no primeiro atendimento do arquivo de referencia', () => {
    const records = buildPetrobrasRveRecords([
      {
        equipamento: '30131647',
        atendimento: '509573593',
        escalaBase: 'SBME',
        acionamento: { data: '19/09/2026', hora: '06:40:00' },
        decolagem: { data: '19/09/2026', hora: '06:50:00' },
        pouso: { data: '19/09/2026', hora: '08:23:00' },
        corte: { data: '19/09/2026', hora: '08:28:00' },
        etapas: [
          {
            escala: 'SKNT',
            inicio: { data: '19/09/2026', hora: '06:50:00' },
            fim: { data: '19/09/2026', hora: '07:34:00' },
          },
          {
            escala: 'SBME',
            inicio: { data: '19/09/2026', hora: '07:34:00' },
            fim: { data: '19/09/2026', hora: '08:23:00' },
          },
        ],
      },
    ]);

    expect(records).toHaveLength(6);
    expect(records.map((row) => row.ITEM)).toEqual(['0001', '0002', '0003', '0004', '0005', '0006']);
    expect(records.map((row) => row.CODIGO_OPERACAO)).toEqual([
      'OA30',
      'PA01',
      'OA08',
      'OA08',
      'PA03',
      'OA31',
    ]);
    expect(records.map((row) => row.ESCALA)).toEqual(['SBME', 'SBME', 'SKNT', 'SBME', 'SBME', 'SBME']);
    expect(records[0]).toMatchObject({ HORAS_VOADAS: '00', MIN_VOADOS: '10' });
    expect(records[1]).toMatchObject({ HORA_FINAL: '00:00:00', HORAS_VOADAS: '', MIN_VOADOS: '' });
    expect(records[2]).toMatchObject({ HORAS_VOADAS: '00', MIN_VOADOS: '44' });
    expect(records[3]).toMatchObject({ HORAS_VOADAS: '00', MIN_VOADOS: '49' });
    expect(records[4]).toMatchObject({ HORA_FINAL: '00:00:00', HORAS_VOADAS: '', MIN_VOADOS: '' });
    expect(records[5]).toMatchObject({ HORAS_VOADAS: '00', MIN_VOADOS: '05' });
    expect(records.every((row) => row.EQUIPAMENTO === '30131647')).toBe(true);
    expect(records.every((row) => row.ATENDIMENTO === '509573593')).toBe(true);
    expect(records.every((row) => row.TPAP === 'AE')).toBe(true);
  });

  it('serializa tags na ordem contratual e preserva campos vazios', () => {
    const record = Object.fromEntries(PETROBRAS_RVE_FIELDS.map((field) => [field, ''])) as PetrobrasRveRecord;
    record.ITEM = '0001';
    record.EQUIPAMENTO = '30131647';
    record.ATENDIMENTO = '509573593';
    record.ESCALA = 'SBME';
    record.DESCRICAO_DA_OPERACAO = 'OA30 - ACIONAMENTO À DECOLAGEM';
    record.GRUPO_DE_CODIGOS = 'OPEAE1';
    record.CODIGO_OPERACAO = 'OA30';
    record.TPAP = 'AE';
    record.DATA_INICIAL = '19/09/2026';
    record.HORA_INICIAL = '06:40:00';
    record.DATA_FINAL = '19/09/2026';
    record.HORA_FINAL = '06:50:00';
    record.HORAS_VOADAS = '00';
    record.MIN_VOADOS = '10';

    const xml = serializePetrobrasRveXml([record]);
    expect(xml.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>\r\n<meadinkent>')).toBe(true);
    expect(xml).toContain('<DESCRICAO_DA_OPERACAO>OA30 - ACIONAMENTO À DECOLAGEM</DESCRICAO_DA_OPERACAO>');
    expect(xml).toContain('<HORAS_GLOSADAS_AE></HORAS_GLOSADAS_AE>');
    expect(xml).toContain('<OBSERVACOES></OBSERVACOES>');

    let last = -1;
    for (const field of PETROBRAS_RVE_FIELDS) {
      const current = xml.indexOf(`<${field}>`);
      expect(current).toBeGreaterThan(last);
      last = current;
    }
  });

  it('gera bytes ISO-8859-1 e converte caracteres fora do charset em entidade XML', () => {
    const built = buildPetrobrasRveXml([
      {
        equipamento: '30131647',
        atendimento: '509573593',
        escalaBase: 'SBME',
        acionamento: { data: '19/09/2026', hora: '06:40:00' },
        decolagem: { data: '19/09/2026', hora: '06:50:00' },
        pouso: { data: '19/09/2026', hora: '07:34:00' },
        corte: { data: '19/09/2026', hora: '07:39:00' },
        etapas: [
          {
            escala: 'SKNT',
            inicio: { data: '19/09/2026', hora: '06:50:00' },
            fim: { data: '19/09/2026', hora: '07:34:00' },
          },
        ],
      },
    ]);

    const latin1 = String.fromCharCode(...built.bytes);
    expect(latin1).toContain('ACIONAMENTO À DECOLAGEM');
    expect(latin1).toContain('EM VÔO REGULAR PAX');

    const escaped = serializePetrobrasRveXml([
      {
        ...built.records[0],
        OBSERVACOES: 'Conferência ✓ & ajuste <ok>',
      },
    ]);
    expect(escaped).toContain('Conferência &#x2713; &amp; ajuste &lt;ok&gt;');
    expect(() => encodePetrobrasRveIso88591(escaped)).not.toThrow();
  });

  it('rejeita duracao negativa em vez de produzir XML incoerente', () => {
    expect(() =>
      buildPetrobrasRveRecords([
        {
          equipamento: '1',
          atendimento: '2',
          escalaBase: 'SBME',
          acionamento: { data: '19/09/2026', hora: '07:00:00' },
          decolagem: { data: '19/09/2026', hora: '06:50:00' },
          pouso: { data: '19/09/2026', hora: '08:00:00' },
          corte: { data: '19/09/2026', hora: '08:05:00' },
          etapas: [],
        },
      ]),
    ).toThrow('PETROBRAS_RVE_NEGATIVE_DURATION');
  });
});
