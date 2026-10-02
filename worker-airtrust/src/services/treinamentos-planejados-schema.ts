import { getSchemaColumns, hasSchemaTable } from '../utils/db-schema';

export interface TreinamentoSchemaCapabilities {
  hasModalidade: boolean;
  hasCodigoTurma: boolean;
  hasDataInicio: boolean;
  hasDataFim: boolean;
  hasBase: boolean;
  hasSala: boolean;
  hasEquipamentoDescricao: boolean;
  hasLimiteParticipantes: boolean;
  hasInstrutoresTable: boolean;
  hasDiasTable: boolean;
  hasQualificacoesTiposFormato: boolean;
  hasQualificacoesTiposCategoria: boolean;
}

const EMPTY_COLUMNS: ReadonlySet<string> = new Set<string>();

async function safeSchemaColumns(db: D1Database, tableName: string): Promise<ReadonlySet<string>> {
  try {
    return await getSchemaColumns(db, tableName);
  } catch {
    return EMPTY_COLUMNS;
  }
}

async function safeHasSchemaTable(db: D1Database, tableName: string): Promise<boolean> {
  try {
    return await hasSchemaTable(db, tableName);
  } catch {
    return false;
  }
}

export async function detectTreinamentoSchemaCapabilities(
  db: D1Database,
): Promise<TreinamentoSchemaCapabilities> {
  const [plannedColumns, qualificationColumns, hasInstrutoresTable, hasDiasTable] =
    await Promise.all([
      safeSchemaColumns(db, 'treinamentos_planejados'),
      safeSchemaColumns(db, 'qualificacoes_tipos'),
      safeHasSchemaTable(db, 'treinamentos_instrutores'),
      safeHasSchemaTable(db, 'treinamentos_dias'),
    ]);

  return {
    hasModalidade: plannedColumns.has('modalidade'),
    hasCodigoTurma: plannedColumns.has('codigo_turma'),
    hasDataInicio: plannedColumns.has('data_inicio'),
    hasDataFim: plannedColumns.has('data_fim'),
    hasBase: plannedColumns.has('base'),
    hasSala: plannedColumns.has('sala'),
    hasEquipamentoDescricao: plannedColumns.has('equipamento_descricao'),
    hasLimiteParticipantes: plannedColumns.has('limite_participantes'),
    hasInstrutoresTable,
    hasDiasTable,
    hasQualificacoesTiposFormato: qualificationColumns.has('formato_id'),
    hasQualificacoesTiposCategoria: qualificationColumns.has('categoria_id'),
  };
}
