import { describe, expect, it, vi } from 'vitest';
import {
  D1_MAX_BIND_PARAMETERS,
  D1_MAX_LIST_BINDS,
  batchByBindChunks,
  chunkByBindBudget,
  collectByBindChunks,
} from '../../utils/d1-bind-chunks';

const ID_COUNTS = [0, 1, 90, 91, 180, 400] as const;

function ids(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

describe('D1 bind chunking', () => {
  it.each(ID_COUNTS)(
    'preserva exatamente %i IDs sem ultrapassar 100 binds por statement',
    (count) => {
      const input = ids(count);
      const chunks = chunkByBindBudget(input, 2);
      const flattened = chunks.flat();

      expect(flattened).toEqual(input);
      expect(new Set(flattened).size).toBe(input.length);
      expect(chunks.every((chunk) => chunk.length + 2 <= D1_MAX_BIND_PARAMETERS)).toBe(true);
      expect(chunks).toHaveLength(count === 0 ? 0 : Math.ceil(count / D1_MAX_LIST_BINDS));
    },
  );

  it('quebra exatamente entre 90 e 91 IDs e ainda respeita binds fixos altos', () => {
    expect(chunkByBindBudget(ids(90), 2).map((chunk) => chunk.length)).toEqual([90]);
    expect(chunkByBindBudget(ids(91), 2).map((chunk) => chunk.length)).toEqual([90, 1]);
    expect(chunkByBindBudget(ids(400), 0).map((chunk) => chunk.length)).toEqual([
      90, 90, 90, 90, 40,
    ]);
    expect(chunkByBindBudget(ids(400), 1).map((chunk) => chunk.length)).toEqual([
      90, 90, 90, 90, 40,
    ]);
    expect(chunkByBindBudget(ids(180), 15).map((chunk) => chunk.length)).toEqual([85, 85, 10]);
  });

  it('mantém ordem determinística e resultado equivalente ao processamento sem chunking', async () => {
    const input = ids(400);
    const empresaId = 7;
    const seenChunks: number[][] = [];

    const rows = await collectByBindChunks(input, 1, async (chunk) => {
      seenChunks.push([...chunk]);
      return chunk.map((id) => ({ id, empresa_id: empresaId }));
    });

    expect(rows).toEqual(input.map((id) => ({ id, empresa_id: empresaId })));
    expect(seenChunks.flat()).toEqual(input);
    expect(seenChunks.every((chunk) => chunk.length + 1 <= D1_MAX_BIND_PARAMETERS)).toBe(true);
    expect(rows.every((row) => row.empresa_id === empresaId)).toBe(true);
  });

  it('não executa statements para entrada vazia', async () => {
    const load = vi.fn(async () => [] as number[]);
    const batch = vi.fn(async () => []);

    await expect(collectByBindChunks([], 1, load)).resolves.toEqual([]);
    await expect(
      batchByBindChunks(
        { batch } as unknown as Pick<D1Database, 'batch'>,
        [],
        1,
        () => ({}) as D1PreparedStatement,
      ),
    ).resolves.toBeUndefined();

    expect(load).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('propaga falha intermediária sem devolver resultado parcial', async () => {
    const completed: number[][] = [];
    const load = vi.fn(async (chunk: readonly number[], index: number) => {
      if (index === 1) throw new Error('chunk failed');
      completed.push([...chunk]);
      return [...chunk];
    });

    await expect(collectByBindChunks(ids(180), 2, load)).rejects.toThrow('chunk failed');
    expect(completed).toEqual([ids(90)]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('prepara todas as escritas e as envia em um único batch atômico', async () => {
    const preparedBinds: unknown[][] = [];
    const statements: D1PreparedStatement[] = [];
    const batch = vi.fn(async (received: D1PreparedStatement[]) => {
      expect(received).toEqual(statements);
      return [];
    });

    await batchByBindChunks(
      { batch } as unknown as Pick<D1Database, 'batch'>,
      ids(400),
      1,
      (chunk) => {
        const binds = [55, ...chunk];
        preparedBinds.push(binds);
        const statement = { binds } as unknown as D1PreparedStatement;
        statements.push(statement);
        return statement;
      },
    );

    expect(batch).toHaveBeenCalledTimes(1);
    expect(preparedBinds.flatMap((binds) => binds.slice(1))).toEqual(ids(400));
    expect(preparedBinds.every((binds) => binds.length <= D1_MAX_BIND_PARAMETERS)).toBe(true);
  });

  it('propaga falha do batch sem sucesso silencioso ou batches parciais', async () => {
    const batch = vi.fn(async () => {
      throw new Error('atomic batch failed');
    });

    await expect(
      batchByBindChunks(
        { batch } as unknown as Pick<D1Database, 'batch'>,
        ids(180),
        1,
        (chunk) => ({ chunk }) as unknown as D1PreparedStatement,
      ),
    ).rejects.toThrow('atomic batch failed');

    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('rejeita orçamento impossível antes de preparar SQL', () => {
    expect(() => chunkByBindBudget([1], -1)).toThrow('fixedBindCount');
    expect(() => chunkByBindBudget([1], 100)).toThrow('fixedBindCount');
  });
});
