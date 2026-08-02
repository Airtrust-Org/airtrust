export const D1_MAX_BIND_PARAMETERS = 100;
export const D1_MAX_LIST_BINDS = 90;

function getChunkSize(fixedBindCount: number): number {
  if (
    !Number.isInteger(fixedBindCount) ||
    fixedBindCount < 0 ||
    fixedBindCount >= D1_MAX_BIND_PARAMETERS
  ) {
    throw new RangeError(
      `fixedBindCount must be an integer between 0 and ${D1_MAX_BIND_PARAMETERS - 1}`,
    );
  }

  return Math.min(D1_MAX_LIST_BINDS, D1_MAX_BIND_PARAMETERS - fixedBindCount);
}

export function chunkByBindBudget<T>(values: readonly T[], fixedBindCount: number): T[][] {
  const chunkSize = getChunkSize(fixedBindCount);
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function collectByBindChunks<TValue, TRow>(
  values: readonly TValue[],
  fixedBindCount: number,
  load: (chunk: readonly TValue[], chunkIndex: number) => Promise<readonly TRow[]>,
): Promise<TRow[]> {
  const rows: TRow[] = [];
  const chunks = chunkByBindBudget(values, fixedBindCount);

  for (let index = 0; index < chunks.length; index += 1) {
    rows.push(...(await load(chunks[index], index)));
  }

  return rows;
}

export function prepareByBindChunks<TValue>(
  values: readonly TValue[],
  fixedBindCount: number,
  prepare: (chunk: readonly TValue[], chunkIndex: number) => D1PreparedStatement,
): D1PreparedStatement[] {
  return chunkByBindBudget(values, fixedBindCount).map(prepare);
}

export async function batchByBindChunks<TValue>(
  db: Pick<D1Database, 'batch'>,
  values: readonly TValue[],
  fixedBindCount: number,
  prepare: (chunk: readonly TValue[], chunkIndex: number) => D1PreparedStatement,
): Promise<void> {
  const statements = prepareByBindChunks(values, fixedBindCount, prepare);
  if (statements.length === 0) return;

  await db.batch(statements);
}
