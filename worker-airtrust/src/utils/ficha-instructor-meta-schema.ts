/** Compatibility contract for metadata introduced by migration 0429. */

import { getSchemaColumns, hasSchemaTable } from './db-schema';

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

let cachedSchemaByDb = new WeakMap<D1Database, FichaInstructorMetaSchema>();

/** Schema is immutable for a Worker instance, so one lookup is enough. */
export async function getFichaInstructorMetaSchema(
  db: D1Database,
): Promise<FichaInstructorMetaSchema> {
  const cachedSchema = cachedSchemaByDb.get(db);
  if (cachedSchema) return cachedSchema;

  const [hasMetaTable, columnNames] = await Promise.all([
    hasSchemaTable(db, META_TABLE),
    getSchemaColumns(db, 'fichas_sessao'),
  ]);
  const schema: FichaInstructorMetaSchema = {
    hasMetaTable,
    legacyColumns: new Set(METADATA_COLUMNS.filter((column) => columnNames.has(column))),
  };
  cachedSchemaByDb.set(db, schema);
  return schema;
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
  cachedSchemaByDb = new WeakMap<D1Database, FichaInstructorMetaSchema>();
}
