/** Compatibility contract for metadata introduced by migration 0429. */

const META_TABLE = 'fichas_sessao_instrutor_meta';
const METADATA_COLUMNS = [
  'equipamento_utilizado',
  'dispositivo_identificacao',
  'assento_instrucao_utilizado',
] as const;

export type FichaInstructorMetaColumn = (typeof METADATA_COLUMNS)[number];

export type FichaInstructorMetaSchema = {
  hasMetaTable: boolean;
  legacyColumns: ReadonlySet<FichaInstructorMetaColumn>;
};

let cachedSchema: FichaInstructorMetaSchema | null = null;

/** Schema is immutable for a Worker instance, so one lookup is enough. */
export async function getFichaInstructorMetaSchema(
  db: D1Database,
): Promise<FichaInstructorMetaSchema> {
  if (cachedSchema) return cachedSchema;

  const [table, columns] = await Promise.all([
    db
      .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .bind(META_TABLE)
      .first<{ found: number }>(),
    db.prepare("PRAGMA table_info('fichas_sessao')").all<{ name: string }>(),
  ]);
  const columnNames = new Set((columns.results || []).map((column) => column.name));
  cachedSchema = {
    hasMetaTable: Boolean(table?.found),
    legacyColumns: new Set(METADATA_COLUMNS.filter((column) => columnNames.has(column))),
  };
  return cachedSchema;
}

export function fichaInstructorMetaSelect(
  schema: FichaInstructorMetaSchema,
  fichaAlias = 'fs',
): string {
  if (schema.hasMetaTable) {
    return METADATA_COLUMNS.map((column) => `fsi.${column} AS ${column}`).join(',\n');
  }
  return METADATA_COLUMNS.map((column) =>
    schema.legacyColumns.has(column) ? `${fichaAlias}.${column} AS ${column}` : `NULL AS ${column}`,
  ).join(',\n');
}

export function fichaInstructorMetaJoin(schema: FichaInstructorMetaSchema): string {
  return schema.hasMetaTable
    ? `LEFT JOIN ${META_TABLE} fsi
         ON fsi.ficha_id = fs.id
        AND fsi.empresa_id = fs.empresa_id`
    : '';
}

export function resetFichaInstructorMetaSchemaCache(): void {
  cachedSchema = null;
}
