import { describe, expect, it } from 'vitest';
import {
  buildSigvoosMonthlyPreview,
  buildSigvoosMonthlyWindows,
  clearExistingFiraDataForEmpresa,
  extractSigvoosAccessToken,
  findTripulanteByCanacOrName,
  getArrayPayload,
  groupSigvoosRecordsByDay,
  normalizeSigvoosRecord,
  requireClearExistingEmpresaId,
  shouldMergeDuplicataIntoManualEmpty,
  shouldClearExistingSigvoosData,
  isJornadaOperacionalmenteVazia,
  shouldStopSigvoosPaging,
} from '../../services/sigvoos-frms';

function createSigvoosDbStub({
  manualMappings = [],
  funcionarios = [],
  columns = ['id', 'nome', 'codigo_anac', 'matricula'],
}: {
  manualMappings?: Array<Record<string, unknown>>;
  funcionarios?: Array<Record<string, unknown>>;
  columns?: string[];
}) {
  return {
    batch: async () => [],
    prepare: (sql: string) => {
      const executeAll = async () => {
        if (sql.includes("PRAGMA table_info('funcionarios')")) {
          return { results: columns.map((name) => ({ name })) };
        }
        if (
          sql.includes('FROM sigvoos_mapeamento_manual') ||
          sql.includes('FROM integracoes_sigvoos_mapeamentos')
        ) {
          return { results: manualMappings };
        }
        if (sql.includes('FROM funcionarios')) {
          return { results: funcionarios };
        }
        return { results: [] };
      };

      const executeFirst = async () => {
        if (
          sql.includes('SELECT COUNT(*) AS total') &&
          sql.includes('integracoes_sigvoos_config')
        ) {
          return { total: 0 };
        }
        return null;
      };

      return {
        all: executeAll,
        first: executeFirst,
        bind: () => ({
          all: executeAll,
          first: executeFirst,
          run: async () => ({ meta: { changes: 0 } }),
        }),
      };
    },
  } as any;
}

describe('sigvoos-frms service', () => {
  it('does not request cleanup when clearExisting is omitted or false', () => {
    expect(shouldClearExistingSigvoosData()).toBe(false);
    expect(shouldClearExistingSigvoosData(false)).toBe(false);
    expect(shouldClearExistingSigvoosData(true)).toBe(true);
  });

  it('blocks cleanup when tenant scope is missing', () => {
    expect(() => requireClearExistingEmpresaId(undefined)).toThrow(
      'SIGVOOS_CLEAR_EXISTING_REQUIRES_EMPRESA_ID',
    );
    expect(() => requireClearExistingEmpresaId(null)).toThrow(
      'SIGVOOS_CLEAR_EXISTING_REQUIRES_EMPRESA_ID',
    );
    expect(() => requireClearExistingEmpresaId(0)).toThrow(
      'SIGVOOS_CLEAR_EXISTING_REQUIRES_EMPRESA_ID',
    );
    expect(requireClearExistingEmpresaId(7)).toBe(7);
  });

  it('scopes clearExisting cleanup to one tenant only', async () => {
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const dbStub = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          statements.push({ sql, args });
          return { sql, args };
        },
      }),
      batch: async () => [],
    } as any;

    await clearExistingFiraDataForEmpresa(dbStub, 42);

    expect(statements).toHaveLength(6);
    const sqlText = statements.map((stmt) => stmt.sql).join('\n');
    expect(sqlText).toContain("AND empresa_id = ?");
    expect(sqlText).toContain('f.empresa_id = ?');
    expect(sqlText).toContain('h.empresa_id = ?');

    const empresaBindings = statements.flatMap((stmt) =>
      stmt.args.filter((arg): arg is number => typeof arg === 'number'),
    );
    expect(empresaBindings).toContain(42);
    expect(empresaBindings.every((value) => value === 42)).toBe(true);
  });

  it('normalizes and groups raw SIGVOOS legs by tripulante and day', () => {
    const first = normalizeSigvoosRecord({
      tripulante_nome: 'JOAO SILVA',
      codigo_anac: '095168-1',
      data_voo: '2026-04-02',
      partida_real: '2026-04-02 08:10:00',
      chegada_real: '2026-04-02 09:05:00',
      tempo_voo: '00:55',
      origem: 'SBRJ',
    });
    const second = normalizeSigvoosRecord({
      tripulanteNome: 'Joao Silva',
      tripulanteCanac: '951681',
      dataEtapa: '02/04/2026',
      off_block: '2026-04-02T10:00:00',
      on_block: '2026-04-02T11:20:00',
      blockTime: '01:20',
      aerodromo_origem: 'SBSP',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const grouped = groupSigvoosRecordsByDay([first!, second!]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      canac: '951681',
      data: '2026-04-02',
      horaApresentacao: '08:10',
      horaTermino: '11:20',
      horasVooMin: 135,
      localBase: 'SBRJ',
    });
  });

  it('does not treat short staff inscription as CANAC and still groups by normalized crew name', () => {
    const first = normalizeSigvoosRecord({
      staff: { name: 'Diego Bichara Benjamin (279)', inscription: 279 },
      date: '02/04/2026',
      off_block: '2026-04-02T08:00:00',
      on_block: '2026-04-02T09:00:00',
      blockTime: '01:00',
      aerodromo_origem: 'SBJR',
    });
    const second = normalizeSigvoosRecord({
      tripulante_nome: 'Diego Bichara Benjamin',
      date: '02/04/2026',
      off_block: '2026-04-02T10:00:00',
      on_block: '2026-04-02T10:30:00',
      blockTime: '00:30',
      aerodromo_origem: 'SBJR',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.canac).toBeNull();

    const grouped = groupSigvoosRecordsByDay([first!, second!]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      tripulanteNome: 'Diego Bichara Benjamin (279)',
      horasVooMin: 90,
    });
  });

  it('builds a monthly preview compatible with FRMS FIRA import flow', async () => {
    const dbStub = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
        }),
      }),
    } as any;

    const preview = await buildSigvoosMonthlyPreview({
      db: dbStub,
      importacaoId: 'import-1',
      tripulanteId: '33',
      tripulanteNomeFira: 'JOAO SILVA',
      tripulanteNomeSistema: 'Joao Silva',
      canac: '951681',
      identificadorSigvoos: null,
      fonteResolucao: 'CANAC' as const,
      ano: 2026,
      mes: 4,
      groupedDays: [
        {
          canac: '951681',
          identificadorSigvoos: null,
          tripulanteNome: 'JOAO SILVA',
          data: '2026-04-02',
          dia: 2,
          horaApresentacao: '08:10',
          horaTermino: '11:20',
          horasVooMin: 135,
          localBase: 'SBRJ',
          matriculaAeronave: null,
          tempoNoturnoMin: 0,
          tempoIfrMin: 0,
          rawItems: [{ etapa: 1 }],
        },
      ],
    });

    expect(preview.preview).toMatchObject({
      importacao_id: 'import-1',
      tripulante_id: '33',
      canac: '951681',
      ano: 2026,
      mes: 4,
      total_dias: 1,
      totais_calculados: {
        jornada_min: 190,
        voo_min: 135,
      },
    });
    expect(preview.preview.linhas[0]).toMatchObject({
      status_fira: 'SIGVOOS',
      status_frms: 'ES',
      hora_apresentacao: '08:10',
      hora_termino: '11:20',
      horas_voo_min: 135,
      duracao_jornada_min: 190,
    });
  });

  it('extracts the real SIGVOOS auth token nested inside data.token json', () => {
    expect(
      extractSigvoosAccessToken({
        success: true,
        data: {
          token: JSON.stringify({
            token: 'sigvoos-live-token',
          }),
        },
      }),
    ).toBe('sigvoos-live-token');
  });

  it('reads etapas payload arrays nested under data.main', () => {
    expect(
      getArrayPayload({
        data: {
          main: [{ id: 1, staff: { name: 'JOAO SILVA' } }],
        },
      }),
    ).toEqual([{ id: 1, staff: { name: 'JOAO SILVA' } }]);
  });

  it('reads etapas payload arrays when the current root object is already data', () => {
    expect(
      getArrayPayload({
        main: [{ id: 2, staff: { name: 'MARIA COSTA' } }],
      }),
    ).toEqual([{ id: 2, staff: { name: 'MARIA COSTA' } }]);
  });

  it('splits long sync ranges into monthly windows for the live SIGVOOS API', () => {
    expect(buildSigvoosMonthlyWindows('2026-01-01', '2026-04-30')).toEqual([
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-03-01', to: '2026-03-31' },
      { from: '2026-04-01', to: '2026-04-30' },
    ]);
  });

  it('stops paging when SIGVOOS already returned the whole month on page 1', () => {
    expect(shouldStopSigvoosPaging(1, 1042, 200)).toBe(true);
    expect(shouldStopSigvoosPaging(2, 200, 200)).toBe(false);
    expect(shouldStopSigvoosPaging(2, 0, 200)).toBe(true);
  });

  it('resolves a tripulante by manual SIGVOOS mapping before other criteria', async () => {
    const dbStub = createSigvoosDbStub({
      manualMappings: [
        {
          id: 'map-1',
          nome_sigvoos: 'JETHER PONTES E SILVA JR.',
          canac_sigvoos: '251',
          funcionario_id: '88',
          funcionario_nome: 'Jether Pontes e Silva',
          funcionario_matricula: '251',
          created_at: '2026-05-01 00:00:00',
          updated_at: '2026-05-01 00:00:00',
        },
      ],
      funcionarios: [
        { id: '88', nome: 'Jether Pontes e Silva', codigo_anac: '951681', matricula: '251' },
      ],
    });

    const matched = await findTripulanteByCanacOrName(dbStub, 1, {
      canac: null,
      identificadorSigvoos: '251',
      name: 'JETHER PONTES E SILVA JR.',
    });

    expect(matched).toMatchObject({
      id: '88',
      nome: 'Jether Pontes e Silva',
      fonteResolucao: 'MANUAL',
    });
  });

  it('falls back to funcionario matricula when SIGVOOS identifier is not a CANAC', async () => {
    const dbStub = createSigvoosDbStub({
      funcionarios: [
        { id: '55', nome: 'Diego Bichara Benjamin', codigo_anac: null, matricula: '279' },
      ],
    });

    const matched = await findTripulanteByCanacOrName(dbStub, 1, {
      canac: null,
      identificadorSigvoos: ' 279 ',
      name: 'Diego Bichara Benjamin (279)',
    });

    expect(matched).toMatchObject({
      id: '55',
      nome: 'Diego Bichara Benjamin',
      fonteResolucao: 'MATRICULA',
    });
  });

  it('normalizes inscription to 5 digits for matricula comparison', async () => {
    const dbStub = createSigvoosDbStub({
      funcionarios: [{ id: '99', nome: 'Tripulante Zero', codigo_anac: null, matricula: '00042' }],
    });

    const matched = await findTripulanteByCanacOrName(dbStub, 1, {
      canac: null,
      identificadorSigvoos: '42',
      name: 'Tripulante Zero',
    });

    expect(matched).toMatchObject({
      id: '99',
      fonteResolucao: 'MATRICULA',
    });
  });

  it('matches normalized crew names after stripping suffix noise', async () => {
    const dbStub = createSigvoosDbStub({
      funcionarios: [
        { id: '77', nome: 'Jether Pontes e Silva', codigo_anac: null, matricula: null },
      ],
    });

    const matched = await findTripulanteByCanacOrName(dbStub, 1, {
      canac: null,
      identificadorSigvoos: null,
      name: 'JETHER PONTES E SILVA JR.',
    });

    expect(matched).toMatchObject({
      id: '77',
      nome: 'Jether Pontes e Silva',
      fonteResolucao: 'NOME_FUZZY',
    });
  });

  it('does not fuzzy-match when best candidates are ambiguous', async () => {
    const dbStub = createSigvoosDbStub({
      funcionarios: [
        { id: '11', nome: 'MARCOS ANTONIO SILVA', codigo_anac: null, matricula: null },
        { id: '12', nome: 'MARCOS ANTONIO SANTOS', codigo_anac: null, matricula: null },
      ],
    });

    const matched = await findTripulanteByCanacOrName(dbStub, 1, {
      canac: null,
      identificadorSigvoos: null,
      name: 'MARCOS ANTONIO',
    });

    expect(matched).toBeNull();
  });

  it('extracts aircraft, night and IFR fields from flight_report payload', () => {
    const normalized = normalizeSigvoosRecord({
      staff: { name: 'JOAO SILVA', canac: '951681' },
      date: '2026-04-02',
      flight_report: {
        aircraft: { registration: 'PR-ABC' },
      },
      flight_report_leg: {
        engine_start_time_str: '08:10',
        engine_shutoff_time_str: '11:20',
        night_time_str: '00:40',
        ifr_time_str: '01:15',
      },
    });

    expect(normalized).toMatchObject({
      matriculaAeronave: 'PR-ABC',
      tempoNoturnoMin: 40,
      tempoIfrMin: 75,
    });
  });

  it('marks manual journey with null operational fields as empty', () => {
    expect(
      isJornadaOperacionalmenteVazia({
        hora_apresentacao: null,
        hora_termino: null,
        horas_voo_minutos: null,
        duracao_jornada_minutos: null,
      }),
    ).toBe(true);
  });

  it('requests merge when duplicate points to manual empty journey and incoming has real data', () => {
    const shouldMerge = shouldMergeDuplicataIntoManualEmpty({
      existing: {
        id: 'journey-1',
        origem: 'MANUAL',
        empresa_id: 6,
        hora_apresentacao: null,
        hora_termino: null,
        horas_voo_minutos: null,
        duracao_jornada_minutos: null,
      },
      incomingLine: {
        dia: 25,
        data: '2026-05-25',
        status_fira: 'SIGVOOS',
        status_frms: 'ES',
        hora_apresentacao: '07:00',
        hora_termino: '13:00',
        duracao_jornada_min: 360,
        horas_voo_min: 210,
        local_base: 'SBJR',
        situacao: 'DUPLICATA',
        jornada_existente_id: 'journey-1',
        marcado: true,
      },
      empresaId: 6,
    });

    expect(shouldMerge).toBe(true);
  });

  it('does not merge duplicate when existing journey already has operational data', () => {
    const shouldMerge = shouldMergeDuplicataIntoManualEmpty({
      existing: {
        id: 'journey-2',
        origem: 'MANUAL',
        empresa_id: 6,
        hora_apresentacao: '07:00',
        hora_termino: null,
        horas_voo_minutos: null,
        duracao_jornada_minutos: null,
      },
      incomingLine: {
        dia: 26,
        data: '2026-05-26',
        status_fira: 'SIGVOOS',
        status_frms: 'ES',
        hora_apresentacao: '07:00',
        hora_termino: '13:00',
        duracao_jornada_min: 360,
        horas_voo_min: 210,
        local_base: 'SBJR',
        situacao: 'DUPLICATA',
        jornada_existente_id: 'journey-2',
        marcado: true,
      },
      empresaId: 6,
    });

    expect(shouldMerge).toBe(false);
  });

  it('does not merge duplicate when tenant conflicts', () => {
    const shouldMerge = shouldMergeDuplicataIntoManualEmpty({
      existing: {
        id: 'journey-3',
        origem: 'MANUAL',
        empresa_id: 9,
        hora_apresentacao: null,
        hora_termino: null,
        horas_voo_minutos: null,
        duracao_jornada_minutos: null,
      },
      incomingLine: {
        dia: 27,
        data: '2026-05-27',
        status_fira: 'SIGVOOS',
        status_frms: 'ES',
        hora_apresentacao: '07:00',
        hora_termino: '13:00',
        duracao_jornada_min: 360,
        horas_voo_min: 210,
        local_base: 'SBJR',
        situacao: 'DUPLICATA',
        jornada_existente_id: 'journey-3',
        marcado: true,
      },
      empresaId: 6,
    });

    expect(shouldMerge).toBe(false);
  });
});
