import { describe, expect, it } from 'vitest';
import { resolveIndividualNextModel } from '../../services/cae-planning-participant-model-resolver';

const SEQUENCE = [
  { id: 501, ordem_no_treinamento: 1 },
  { id: 502, ordem_no_treinamento: 2 },
  { id: 503, ordem_no_treinamento: 3 },
];

function dbReturning(rows: Array<{ modelo_id: number | null; origin: 'shared' | 'normal' }>) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db: any = {
    prepare(sql: string) {
      const call = { sql, binds: [] as unknown[] };
      calls.push(call);
      const statement: any = {
        bind(...values: unknown[]) {
          call.binds = values;
          return statement;
        },
        async all() {
          return { results: rows };
        },
      };
      return statement;
    },
  };
  return { db, calls };
}

describe('resolveIndividualNextModel', () => {
  it('1. sem histórico -> primeiro modelo da sequência', async () => {
    const { db } = dbReturning([]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(result).toEqual({ modelId: 501, ordem: 1, source: 'no_history' });
  });

  it('2. primeira sessão aprovada -> avança para a segunda', async () => {
    const { db } = dbReturning([{ modelo_id: 501, origin: 'normal' }]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(result).toEqual({ modelId: 502, ordem: 2, source: 'normal_history' });
  });

  it('3. reprovada não avança (query já filtra aprovado=1, então simplesmente não aparece)', async () => {
    // Uma sessão reprovada não é retornada pela query (fs.aprovado = 1 no SQL);
    // o resolver não recebe nenhum registro para ela e permanece na primeira.
    const { db, calls } = dbReturning([]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(result?.source).toBe('no_history');
    expect(calls[0].sql).toContain('fs.aprovado = 1');
  });

  it('4. PENDENTE não avança (mesmo raciocínio — aprovado=1 exclui pendentes)', async () => {
    const { db, calls } = dbReturning([]);
    await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(calls[0].sql).toContain('fs.aprovado = 1');
  });

  it('5. histórico NORMAL resolve via simulador_agendamentos.template_id', async () => {
    const { db, calls } = dbReturning([{ modelo_id: 502, origin: 'normal' }]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(result).toEqual({ modelId: 503, ordem: 3, source: 'normal_history' });
    expect(calls[0].sql).toContain('sa.template_id');
  });

  it('6. histórico SHARED resolve via simulador_atribuicoes_curriculares.modelo_sessao_id', async () => {
    const { db, calls } = dbReturning([{ modelo_id: 502, origin: 'shared' }]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(result).toEqual({ modelId: 503, ordem: 3, source: 'shared_history' });
    expect(calls[0].sql).toContain('sac.modelo_sessao_id');
  });

  it('7. dois participantes em pontos diferentes do currículo resolvem modelos diferentes', async () => {
    const { db: dbA } = dbReturning([{ modelo_id: 501, origin: 'normal' }]);
    const { db: dbB } = dbReturning([{ modelo_id: 502, origin: 'shared' }]);
    const resultA = await resolveIndividualNextModel({
      db: dbA,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    const resultB = await resolveIndividualNextModel({
      db: dbB,
      empresaId: 1,
      employeeId: 118,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(resultA?.modelId).toBe(502);
    expect(resultB?.modelId).toBe(503);
    expect(resultA?.modelId).not.toBe(resultB?.modelId);
  });

  it('8. filtra por colaborador_id_aluno OU participante_id — escopo por funcionário está no SQL', async () => {
    const { db, calls } = dbReturning([]);
    await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(calls[0].sql).toContain('fs.colaborador_id_aluno = ?');
    expect(calls[0].sql).toContain('sac.participante_id = ?');
    expect(calls[0].binds).toEqual([1, 1, 1, 100, 100, null, null]);
  });

  it('9. escopo por tenant está no SQL (fs/sac/sa.empresa_id)', async () => {
    const { db, calls } = dbReturning([]);
    await resolveIndividualNextModel({
      db,
      empresaId: 77,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(calls[0].sql).toContain('fs.empresa_id = ?');
    expect(calls[0].sql).toContain('sac.empresa_id = ?');
    expect(calls[0].sql).toContain('sa.empresa_id = ?');
    expect(calls[0].binds.slice(0, 3)).toEqual([77, 77, 77]);
  });

  it('10. qualificação/currículo diferente não interfere — modelo concluído fora da sequência é ignorado', async () => {
    const { db } = dbReturning([{ modelo_id: 9999, origin: 'normal' }]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(result).toEqual({ modelId: 501, ordem: 1, source: 'no_history' });
  });

  it('todas as sessões concluídas dentro do ciclo -> permanece na última (não reinicia silenciosamente)', async () => {
    const { db } = dbReturning([{ modelo_id: 503, origin: 'normal' }]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });
    expect(result).toEqual({ modelId: 503, ordem: 3, source: 'sequence_complete' });
  });

  it('sessão do ciclo anterior é excluída via cycleStartDate (escopo de data no SQL)', async () => {
    const { db, calls } = dbReturning([]);
    await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: '2026-06-01',
      models: SEQUENCE,
    });
    expect(calls[0].sql).toContain('date(fs.data_sessao) >= date(?)');
    expect(calls[0].binds).toEqual([1, 1, 1, 100, 100, '2026-06-01', '2026-06-01']);
  });

  it('lista de modelos vazia retorna null (sem sequência para resolver)', async () => {
    const { db } = dbReturning([]);
    const result = await resolveIndividualNextModel({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: [],
    });
    expect(result).toBeNull();
  });
});
