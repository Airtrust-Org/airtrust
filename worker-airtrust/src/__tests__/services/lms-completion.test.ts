/**
 * completeLmsMatricula — orquestração e contrato de retorno discriminado.
 * A prova de atomicidade real (SQLite) está em lms-completion.rollback.test.ts;
 * aqui testamos apenas o fluxo de controle (outcomes, retry, rejeição).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { ensureCertificateForQualificationMock } = vi.hoisted(() => ({
  ensureCertificateForQualificationMock: vi.fn(),
}));

vi.mock('../../services/ensure-certificate', () => ({
  ensureCertificateForQualification: ensureCertificateForQualificationMock,
}));

import { completeLmsMatricula, LmsCompletionRejectedError } from '../../services/lms-completion';

function makeFakeDb(options: {
  historicoLookup?: () => { id: number; status?: string | null } | null;
  cycleLookup?: () => { id: number } | null;
  maxCiclo?: number;
  typeCategoryId?: number | null;
  categoryLookup?: () => Record<string, unknown> | null;
  batchImpl?: (statements: unknown[]) => Promise<unknown>;
}) {
  const batchCalls: unknown[][] = [];
  const runCalls: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      all: async () => {
        if (sql.includes("PRAGMA table_info('qualificacoes_categorias')")) {
          return {
            results: [
              { name: 'id' },
              { name: 'empresa_id' },
              { name: 'nome' },
              { name: 'codigo' },
              { name: 'ativo' },
              { name: 'dominio_codigo' },
              { name: 'lms_integrada' },
              { name: 'deleted_at' },
            ],
          };
        }
        return { results: [] };
      },
      bind: () => ({
        first: async () => {
          if (sql.includes('FROM qualificacoes_tipos')) {
            return {
              id: 55,
              categoria_id: options.typeCategoryId === undefined ? 13 : options.typeCategoryId,
            };
          }
          if (sql.includes('FROM qualificacoes_categorias')) {
            return options.categoryLookup
              ? options.categoryLookup()
              : {
                  id: 13,
                  empresa_id: 6,
                  nome: 'EAD',
                  codigo: 'EAD',
                  ativo: 1,
                  dominio_codigo: 'TREINAMENTOS',
                  lms_integrada: 1,
                };
          }
          if (sql.includes('FROM qualificacoes_historico') && sql.includes('data_conclusao = ?')) {
            return options.historicoLookup ? options.historicoLookup() : null;
          }
          if (sql.includes('FROM lms_matricula_ciclos') && sql.includes('ciclo_atual = 1')) {
            return options.cycleLookup ? options.cycleLookup() : null;
          }
          if (sql.includes('MAX(numero_ciclo)')) {
            return { max_numero: options.maxCiclo ?? 0 };
          }
          if (sql.includes('COALESCE(renovada, 0) = 0')) {
            return null;
          }
          return null;
        },
        run: async () => {
          runCalls.push(sql);
          return { meta: { changes: 1 } };
        },
      }),
      __sql: sql,
    })),
    batch: vi.fn(async (statements: unknown[]) => {
      batchCalls.push(statements);
      if (options.batchImpl) return options.batchImpl(statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    }),
  } as unknown as D1Database & { __batchCalls: unknown[][]; __runCalls: string[] };

  (db as unknown as { __batchCalls: unknown[][] }).__batchCalls = batchCalls;
  (db as unknown as { __runCalls: string[] }).__runCalls = runCalls;
  return db;
}

function baseParams(db: D1Database, overrides: Record<string, unknown> = {}) {
  return {
    db,
    env: {} as never,
    empresaId: 6,
    matriculaId: 1,
    funcionarioId: 77,
    cursoTitulo: 'Curso',
    gerarQualificacaoAoConcluir: true,
    qualificacaoTipoId: 55,
    qualificacaoCodigo: 'QUAL-X',
    qualificacaoNome: 'Qualificação X',
    qualificacaoCategoriaId: 13,
    qualificacaoCategoria: 'EAD',
    validade: 12,
    dataConclusao: '2026-07-30',
    existingHistoricoId: null,
    action: 'LMS_MATRICULA_CONCLUIDA',
    actorUserId: 42,
    ...overrides,
  };
}

describe('completeLmsMatricula', () => {
  beforeEach(() => {
    ensureCertificateForQualificationMock.mockReset();
    ensureCertificateForQualificationMock.mockResolvedValue({ state: 'CREATED', documentoId: 321 });
  });

  const nativeAnchor=(qualificacao:boolean)=>({
    empresaId:6,matriculaId:1,cicloId:1001,cursoId:31,
    actorUserId:42,funcionarioId:77,edicaoId:7,editionHash:'a'.repeat(64),
    bindingId:13,latestAttemptId:8,latestAttemptNumber:2,
    answersHash:'b'.repeat(64),scorePct:85,eventCount:4,distinctLessonCount:4,
    gerarQualificacaoAoConcluir:qualificacao,
    qualificacaoTipoId:qualificacao?55:null,qualificacaoCategoriaId:qualificacao?13:null,
  });
  const nativeEnv=()=>({
    ENVIRONMENT:'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS:'6',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:'6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS:'6',
  });

  it.each([false,true])('Native canonical batch prepends the SQL evidence guard (qualification=%s)',async qual=>{
    let n=0;
    const db=makeFakeDb({ historicoLookup:()=> ++n===1 ? null : {id:901} });
    await completeLmsMatricula(baseParams(db,{
      env:nativeEnv(),cursoId:31,gerarQualificacaoAoConcluir:qual,
      qualificacaoTipoId:qual?55:null,qualificacaoCategoriaId:qual?13:null,
      scoreFinal:85,progressoPct:100,action:'LMS_NATIVE_CANONICAL_CONCLUIDA',
      nativeTerminalAnchor:nativeAnchor(qual),
    }) as never);
    const calls=(db.prepare as ReturnType<typeof vi.fn>).mock.calls
      .map((args:unknown[])=>String(args[0]));
    const firstGuard=calls.findIndex(x=>x.startsWith('SELECT json(CASE WHEN')&&
      x.includes('NATIVE_TERMINAL_STATE_CHANGED'));
    const firstMutation=calls.findIndex(x=>x.includes('UPDATE lms_matriculas'));
    expect(firstGuard).toBeGreaterThanOrEqual(0);
    expect(firstMutation).toBeGreaterThan(firstGuard);
    expect(db.batch).toHaveBeenCalledTimes(1);
    const intent=calls.findIndex(x=>x.includes('INSERT INTO lms_native_completion_intents'));
    const consume=calls.findIndex(x=>x.includes('DELETE FROM lms_native_completion_intents'));
    expect(intent).toBe(firstGuard+1);
    expect(firstMutation).toBeGreaterThan(intent);
    expect(consume).toBeGreaterThan(firstMutation);
    // Both D1-bound intent operations must remain in this ONE batch.
    const batchCalls=(db as unknown as {__batchCalls:unknown[][]}).__batchCalls;
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0].length).toBeGreaterThan(4);
  });

  it('Native refuses the wrong actor, score, course, progress, action or missing staging flags before batch',async()=>{
    const db=makeFakeDb({});
    const base={
      env:nativeEnv(),cursoId:31,gerarQualificacaoAoConcluir:false,
      qualificacaoTipoId:null,qualificacaoCategoriaId:null,
      scoreFinal:85,progressoPct:100,action:'LMS_NATIVE_CANONICAL_CONCLUIDA',
      nativeTerminalAnchor:nativeAnchor(false),
    };
    for (const patch of [
      {actorUserId:41},{cursoId:32},{scoreFinal:99},
      {progressoPct:50},{action:'LMS_MATRICULA_CONCLUIDA'},
      {env:{...nativeEnv(),ENVIRONMENT:'production'}},
    ]) {
      await expect(completeLmsMatricula(baseParams(db,{...base,...patch}) as never))
        .rejects.toMatchObject({code:'NATIVE_TERMINAL_ANCHOR_MISMATCH'});
    }
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('curso sem qualificação exigida: outcome qualification_not_required, um único batch', async () => {
    const db = makeFakeDb({});
    const result = await completeLmsMatricula(
      baseParams(db, { gerarQualificacaoAoConcluir: false, qualificacaoTipoId: null }) as never,
    );

    expect(result.outcome).toBe('qualification_not_required');
    expect(result.qualificacaoHistoricoId).toBeNull();
    expect((db as unknown as { __batchCalls: unknown[][] }).__batchCalls).toHaveLength(1);
  });

  it('Histórico novo: outcome qualification_created', async () => {
    let lookupCount = 0;
    const db = makeFakeDb({
      historicoLookup: () => {
        lookupCount += 1;
        // Antes do batch: não existe. Depois do batch (leitura final): existe.
        return lookupCount === 1 ? null : { id: 900 };
      },
    });

    const result = await completeLmsMatricula(baseParams(db) as never);

    expect(result.outcome).toBe('qualification_created');
    expect(result.qualificacaoHistoricoId).toBe(900);
  });

  it('Histórico já vinculado (existingHistoricoId): outcome qualification_reused, sem novo lookup pré-batch', async () => {
    const db = makeFakeDb({ historicoLookup: () => ({ id: 777, status: 'CONCLUIDA' }) });

    const result = await completeLmsMatricula(
      baseParams(db, { existingHistoricoId: 777 }) as never,
    );

    expect(result.outcome).toBe('qualification_reused');
    expect(result.qualificacaoHistoricoId).toBe(777);
  });

  it.each(['CANCELADA', 'RENOVADA', null])(
    'rejeita histórico existente com status não reutilizável (%s)', async (status) => {
      const db = makeFakeDb({
        historicoLookup: () => ({ id: 777, status }),
      });
      await expect(completeLmsMatricula(
        baseParams(db, { existingHistoricoId: 777 }) as never,
      )).rejects.toMatchObject({ code: 'LMS_QUALIFICATION_STATUS_INCOMPATIBLE' });
      expect(db.batch).not.toHaveBeenCalled();
      expect(ensureCertificateForQualificationMock).not.toHaveBeenCalled();
    },
  );

  it.each(['CANCELADA', 'RENOVADA', null])(
    'corrida UNIQUE não reaproveita histórico inválido (%s)', async (status) => {
      let lookupCount = 0;
      const db = makeFakeDb({
        historicoLookup: () => ++lookupCount === 1
          ? null : { id: 999, status },
        batchImpl: async () => {
          throw new Error(
            'D1_ERROR: UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.qualificacao_codigo, qualificacoes_historico.data_conclusao',
          );
        },
      });
      await expect(completeLmsMatricula(baseParams(db) as never))
        .rejects.toMatchObject({ code: 'LMS_QUALIFICATION_STATUS_INCOMPATIBLE' });
      // Rejection audit is allowed; no second terminal D1.batch may run.
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(ensureCertificateForQualificationMock).not.toHaveBeenCalled();
    },
  );

  it('gera certificado automaticamente quando a categoria canônica é EAD', async () => {
    let lookupCount = 0;
    const db = makeFakeDb({
      historicoLookup: () => {
        lookupCount += 1;
        return lookupCount === 1 ? null : { id: 901 };
      },
    });

    await completeLmsMatricula(baseParams(db) as never);

    expect(ensureCertificateForQualificationMock).toHaveBeenCalledTimes(1);
    expect(ensureCertificateForQualificationMock).toHaveBeenCalledWith(
      expect.anything(),
      901,
      6,
      { actorUserId: 42 },
    );
  });

  it('não desfaz conclusão gravada quando a emissão secundária do certificado lança exceção', async () => {
    let lookupCount = 0;
    const db = makeFakeDb({
      historicoLookup: () => {
        lookupCount += 1;
        return lookupCount === 1 ? null : { id: 903 };
      },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    ensureCertificateForQualificationMock.mockRejectedValue(
      new Error('secret-from-external-certificate-service'),
    );
    try {
      const result = await completeLmsMatricula(baseParams(db) as never);
      expect(result).toMatchObject({
        outcome: 'qualification_created',
        qualificacaoHistoricoId: 903,
        matriculaId: 1,
      });
      expect((db as unknown as { __batchCalls: unknown[][] }).__batchCalls).toHaveLength(1);
      expect(ensureCertificateForQualificationMock).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('LMS_EAD_CERTIFICATE_SERVICE_THROWN'));
      expect(log.mock.calls.flat().join(' ')).not.toContain('secret-from-external-certificate-service');
    } finally {
      log.mockRestore();
    }
  });

  it('preserva sucesso de conciliação concorrente mesmo se a emissão do certificado falhar', async () => {
    let attempt = 0;
    let lookupCount = 0;
    const db = makeFakeDb({
      historicoLookup: () => {
        lookupCount += 1;
        return lookupCount === 1 ? null : { id: 999, status: 'CONCLUIDA' };
      },
      batchImpl: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error(
            'D1_ERROR: UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.qualificacao_codigo, qualificacoes_historico.data_conclusao',
          );
        }
        return [];
      },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    ensureCertificateForQualificationMock.mockRejectedValue(new Error('certificate service timeout'));
    try {
      const result = await completeLmsMatricula(baseParams(db) as never);
      expect(result.outcome).toBe('qualification_reused');
      expect(result.qualificacaoHistoricoId).toBe(999);
      expect(attempt).toBe(2);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('LMS_EAD_CERTIFICATE_SERVICE_THROWN'));
    } finally {
      log.mockRestore();
    }
  });

  it('não gera certificado automaticamente para outra categoria LMS integrada', async () => {
    let lookupCount = 0;
    const db = makeFakeDb({
      categoryLookup: () => ({
        id: 14,
        empresa_id: 6,
        nome: 'Treinamento Online',
        codigo: 'ONLINE',
        ativo: 1,
        dominio_codigo: 'TREINAMENTOS',
        lms_integrada: 1,
      }),
      historicoLookup: () => {
        lookupCount += 1;
        return lookupCount === 1 ? null : { id: 902 };
      },
    });

    await completeLmsMatricula(baseParams(db) as never);

    expect(ensureCertificateForQualificationMock).not.toHaveBeenCalled();
  });

  it('falha no batch (causa inesperada): lança LmsCompletionRejectedError, NUNCA retorna 200 com qualification_failed:true', async () => {
    const db = makeFakeDb({
      historicoLookup: () => null,
      batchImpl: async () => {
        throw new Error('D1_ERROR: disk I/O error');
      },
    });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toBeInstanceOf(
      LmsCompletionRejectedError,
    );
  });

  it('corrida concorrente (UNIQUE constraint): primeiro batch falha, retry único reconcilia como reuso', async () => {
    let batchAttempt = 0;
    let lookupCount = 0;
    const db = makeFakeDb({
      historicoLookup: () => {
        lookupCount += 1;
        // 1ª leitura (pré-batch da 1ª tentativa): ainda não existe.
        // 2ª leitura (pré-batch do retry): a concorrente já inseriu.
        return lookupCount === 1 ? null : { id: 999, status: 'CONCLUIDA' };
      },
      batchImpl: async () => {
        batchAttempt += 1;
        if (batchAttempt === 1) {
          throw new Error(
            'D1_ERROR: UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.qualificacao_codigo, qualificacoes_historico.data_conclusao',
          );
        }
        return [];
      },
    });

    const result = await completeLmsMatricula(baseParams(db) as never);

    expect(result.outcome).toBe('qualification_reused');
    expect(result.qualificacaoHistoricoId).toBe(999);
    expect(batchAttempt).toBe(2);
  });

  it('falha por causa diferente da corrida esperada: não tenta retry, rejeita', async () => {
    let batchAttempt = 0;
    const db = makeFakeDb({
      historicoLookup: () => null,
      batchImpl: async () => {
        batchAttempt += 1;
        throw new Error('D1_ERROR: UNIQUE constraint failed: other_table.foreign_key');
      },
    });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toBeInstanceOf(
      LmsCompletionRejectedError,
    );
    expect(batchAttempt).toBe(1);
  });

  it('rejeita tipo sem categoria_id canônico', async () => {
    const db = makeFakeDb({ typeCategoryId: null });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toMatchObject({
      code: 'LMS_QUALIFICATION_MAPPING_INVALID',
    });
    expect((db as unknown as { __batchCalls: unknown[][] }).__batchCalls).toHaveLength(0);
  });

  it('rejeita categoria canônica ausente, inativa ou de outro tenant', async () => {
    const db = makeFakeDb({ categoryLookup: () => null });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toMatchObject({
      code: 'LMS_QUALIFICATION_MAPPING_INVALID',
    });
    expect((db as unknown as { __batchCalls: unknown[][] }).__batchCalls).toHaveLength(0);
  });

  it('rejeita categoria canônica não integrada ao LMS', async () => {
    const db = makeFakeDb({
      categoryLookup: () => ({
        id: 13,
        empresa_id: 6,
        nome: 'Treinamento Teórico',
        codigo: 'TEORICO',
        ativo: 1,
        dominio_codigo: 'TREINAMENTOS',
        lms_integrada: 0,
      }),
    });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toMatchObject({
      code: 'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED',
    });
    expect((db as unknown as { __batchCalls: unknown[][] }).__batchCalls).toHaveLength(0);
  });
});
