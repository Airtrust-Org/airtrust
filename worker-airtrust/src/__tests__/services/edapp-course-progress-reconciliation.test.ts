import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const {
  callEdAppAPIMock,
  createEdAppQualificacaoNotificationMock,
  createQualificacaoMock,
  findFuncionarioByEdappUserMock,
  findQualificacaoByCourseMock,
  getEdAppConfigValueMock,
  upsertEdAppConfigMock,
} = vi.hoisted(() => ({
  callEdAppAPIMock: vi.fn(),
  createEdAppQualificacaoNotificationMock: vi.fn(),
  createQualificacaoMock: vi.fn(),
  findFuncionarioByEdappUserMock: vi.fn(),
  findQualificacaoByCourseMock: vi.fn(),
  getEdAppConfigValueMock: vi.fn(),
  upsertEdAppConfigMock: vi.fn(),
}));

vi.mock('../../routes/integracoes-edapp-helpers', () => ({
  callEdAppAPI: callEdAppAPIMock,
  createEdAppQualificacaoNotification: createEdAppQualificacaoNotificationMock,
  createQualificacao: createQualificacaoMock,
  findFuncionarioByEdappUser: findFuncionarioByEdappUserMock,
  findQualificacaoByCourse: findQualificacaoByCourseMock,
  getEdAppConfigValue: getEdAppConfigValueMock,
  upsertEdAppConfig: upsertEdAppConfigMock,
}));

import {
  EDAPP_ANALYTICS_LAST_RESULT_KEY,
  EDAPP_ANALYTICS_LAST_RUN_KEY,
  EDAPP_ANALYTICS_WATERMARK_KEY,
  reconcileEdAppCourseProgress,
} from '../../services/edapp-course-progress-reconciliation';

function createTestEnv(): Env {
  return { ENVIRONMENT: 'test' } as unknown as Env;
}

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const [, handler] = entry;
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { last_row_id: 0, changes: 0 } };
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('reconcileEdAppCourseProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEdAppConfigValueMock.mockResolvedValue(null);
    upsertEdAppConfigMock.mockResolvedValue(undefined);
    createEdAppQualificacaoNotificationMock.mockResolvedValue(undefined);
  });

  it('processa conclusão via userExternalId e courseExternalId quando o webhook não chegou', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id, processado, qualificacao_historico_id',
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO integracoes_edapp_eventos',
        {
          run: () => ({ meta: { last_row_id: 77 } }),
        },
      ],
      [
        'SET processado = 1',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    callEdAppAPIMock.mockResolvedValue({
      items: [
        {
          completed: true,
          completedDateTime: '2026-04-08T12:34:56.000Z',
          userId: null,
          userExternalId: 'filipe@airtrust.online',
          courseId: null,
          courseExternalId: 'E1',
          courseTitle: 'Operações Offshore',
          score: 98,
        },
      ],
      totalCount: 1,
    });

    findFuncionarioByEdappUserMock.mockResolvedValue({
      funcionario_id: 41,
      funcionario_nome: 'Filipe Daumas',
      matched_by: 'edapp_email',
    });
    findQualificacaoByCourseMock.mockResolvedValue({
      qualificacao_codigo: 'E1',
      edapp_course_name: 'Operações Offshore',
      matched_by: 'course_external_id',
    });
    createQualificacaoMock.mockResolvedValue({
      success: true,
      qualificacao_id: 9001,
      message: 'Qualificação criada',
      renovacao: false,
      created: true,
      duplicate: false,
    });

    const result = await reconcileEdAppCourseProgress({
      env: createTestEnv(),
      db,
      trigger: 'manual',
    });

    expect(result).toMatchObject({
      trigger: 'manual',
      pagesFetched: 1,
      itemsScanned: 1,
      completionsFound: 1,
      eventsCreated: 1,
      processed: 1,
      created: 1,
      duplicates: 0,
      unmappedUsers: 0,
      unmappedCourses: 0,
      latestCompletedAt: '2026-04-08T12:34:56.000Z',
      watermarkUpdated: true,
    });

    expect(findFuncionarioByEdappUserMock).toHaveBeenCalledWith(db, {
      edappUserId: null,
      userExternalId: 'filipe@airtrust.online',
    });
    expect(findQualificacaoByCourseMock).toHaveBeenCalledWith(db, {
      courseId: null,
      courseExternalId: 'E1',
      courseTitle: 'Operações Offshore',
    });
    expect(createQualificacaoMock).toHaveBeenCalledWith(
      db,
      41,
      'E1',
      'analytics:manual:E1',
      '2026-04-08T12:34:56.000Z',
    );
    expect(callEdAppAPIMock).toHaveBeenCalledWith(
      createTestEnv(),
      'GET',
      expect.stringContaining('ModifiedSinceDateTime=2025-01-01T00%3A00%3A00.000Z'),
    );
    expect(callEdAppAPIMock).toHaveBeenCalledWith(
      createTestEnv(),
      'GET',
      expect.stringContaining('PageSize=200'),
    );
    expect(createEdAppQualificacaoNotificationMock).toHaveBeenCalledTimes(1);
    expect(upsertEdAppConfigMock).toHaveBeenCalledWith(
      db,
      EDAPP_ANALYTICS_LAST_RUN_KEY,
      expect.any(String),
      undefined,
    );
    expect(upsertEdAppConfigMock).toHaveBeenCalledWith(
      db,
      EDAPP_ANALYTICS_LAST_RESULT_KEY,
      expect.any(String),
      undefined,
    );
    expect(upsertEdAppConfigMock).toHaveBeenCalledWith(
      db,
      EDAPP_ANALYTICS_WATERMARK_KEY,
      '2026-04-08T12:34:56.000Z',
      undefined,
    );
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          call.query.includes('INSERT INTO integracoes_edapp_eventos') &&
          call.args[0] === 'analytics.courseprogress.completed',
      ),
    ).toBe(true);
  });

  it('reaproveita evento analytics já processado em janelas sobrepostas do cron', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id, processado, qualificacao_historico_id',
        {
          first: () => ({ id: 88, processado: 1, qualificacao_historico_id: 9001 }),
        },
      ],
    ]);

    callEdAppAPIMock.mockResolvedValue({
      items: [
        {
          completed: true,
          completedDateTime: '2026-04-08T12:34:56.000Z',
          userId: '64bdc06b4a16e4ac98a5a32a',
          courseId: 'E1',
        },
      ],
      totalCount: 1,
    });

    const result = await reconcileEdAppCourseProgress({
      env: createTestEnv(),
      db,
      trigger: 'cron',
      updateWatermark: false,
      createNotifications: false,
    });

    expect(result).toMatchObject({
      trigger: 'cron',
      pagesFetched: 1,
      itemsScanned: 1,
      completionsFound: 1,
      eventsCreated: 0,
      processed: 1,
      created: 0,
      duplicates: 1,
      watermarkUpdated: false,
    });
    expect(createQualificacaoMock).not.toHaveBeenCalled();
    expect(createEdAppQualificacaoNotificationMock).not.toHaveBeenCalled();
    expect(calls.some((call) => call.query.includes('INSERT INTO integracoes_edapp_eventos'))).toBe(
      false,
    );
  });
});
