/**
 * Script para comparar vencimentos de qualificações do CSV com o banco de dados
 *
 * Uso: npm run dev:worker (em um terminal) e depois acessar endpoint
 */

// Dados do CSV fornecido - apenas primeiras linhas para teste
export const CSV_DATA = `TRIPULANTE,ANV,DESIGNAÇÃO,CURSO,DATA VENCIMENTO
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,CMA,4/3/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,CHT TIPO,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,CHT IFR,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,FAP 05.2,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,OPC,3/31/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,FAP 06,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,IFR,3/31/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,LPC,1/30/2026
ANTONIO LUIZ SIMÕES RAMOS-383455,"[""SK76""]",PIC,CMA,4/27/2026
ANTONIO LUIZ SIMÕES RAMOS-383455,"[""SK76""]",PIC,CHT TIPO,5/31/2026
ANTONIO LUIZ SIMÕES RAMOS-383455,"[""SK76""]",PIC,CHT IFR,5/31/2026
BERNARDO FREIRE ANTUNES-102172,"[""AW139""]",PIC,CMA,11/14/2026
BERNARDO FREIRE ANTUNES-102172,"[""AW139""]",PIC,CHT TIPO,10/31/2026
BERNARDO FREIRE ANTUNES-102172,"[""AW139""]",PIC,CHT IFR,10/31/2026
CAIO CESAR SIMÕES DE ALCANTARA-144338,"[""AW139""]",PIC,CMA,9/16/2026
CAIO CESAR SIMÕES DE ALCANTARA-144338,"[""AW139""]",PIC,CHT TIPO,1/31/2026
CAIO CESAR SIMÕES DE ALCANTARA-144338,"[""AW139""]",PIC,CHT IFR,1/31/2026`;

export interface CSVRow {
  tripulante: string;
  codigoAnac: string;
  anv: string;
  designacao: string;
  curso: string;
  dataVencimento: string;
}

export interface DBRow {
  funcionario_nome: string;
  funcionario_codigo_anac: string;
  tipo_codigo: string;
  tipo_nome: string;
  data_vencimento: string;
  renovada: number;
}

export interface Difference {
  tripulante: string;
  codigoAnac: string;
  curso: string;
  dataVencimentoCSV: string;
  dataVencimentoDB: string | null;
  status: 'MISSING_IN_DB' | 'DATE_MISMATCH' | 'RENOVADA' | 'OK';
  observacao?: string;
}

export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  const rows: CSVRow[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Parse CSV line considering quoted fields
    const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!matches || matches.length < 5) continue;

    const tripulanteRaw = matches[0].replace(/^"|"$/g, '').trim();
    const anv = matches[1].replace(/^"|"$/g, '').trim();
    const designacao = matches[2].replace(/^"|"$/g, '').trim();
    const curso = matches[3].replace(/^"|"$/g, '').trim();
    const dataVencimento = matches[4].replace(/^"|"$/g, '').trim();

    // Extract codigo ANAC from tripulante (formato: "NOME - CODIGO")
    const parts = tripulanteRaw.split(' - ');
    const codigoAnac = parts.length > 1 ? parts[parts.length - 1].trim() : '';
    const tripulante = parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : tripulanteRaw;

    rows.push({
      tripulante,
      codigoAnac,
      anv,
      designacao,
      curso,
      dataVencimento,
    });
  }

  return rows;
}

export function normalizeDate(dateStr: string): string {
  // Convert M/D/YYYY to YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;

  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const year = parts[2];

  return `${year}-${month}-${day}`;
}

export function normalizeCursoName(curso: string): string {
  return curso
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .replace(/\s*-\s*/g, '-');
}

export async function compareQualificacoes(db: D1Database, csvData: string) {
  console.log('📊 Comparando qualificações do CSV com o banco de dados...\n');

  // Parse CSV
  const csvRows = parseCSV(csvData);
  console.log(`✅ CSV parseado: ${csvRows.length} registros\n`);

  // Get all qualifications from DB (only active, non-deleted)
  const dbResult = await db
    .prepare(
      `
    SELECT 
      f.nome as funcionario_nome,
      f.codigo_anac as funcionario_codigo_anac,
      qt.codigo as tipo_codigo,
      qt.nome as tipo_nome,
      qh.data_vencimento,
      qh.renovada
    FROM qualificacoes_historico qh
    LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
    WHERE qh.deleted_at IS NULL
      AND f.deleted_at IS NULL
      AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
    ORDER BY f.nome, qt.codigo
  `,
    )
    .all();

  const dbRows = dbResult.results as unknown as DBRow[];
  console.log(`✅ Banco de dados: ${dbRows.length} registros ativos\n`);

  const differences: Difference[] = [];
  let matchCount = 0;

  // Compare each CSV row with DB
  for (const csvRow of csvRows) {
    const normalizedCursoCSV = normalizeCursoName(csvRow.curso);
    const normalizedDateCSV = normalizeDate(csvRow.dataVencimento);

    // Find matching DB row
    const dbMatch = dbRows.find((dbRow) => {
      const codigoMatch = dbRow.funcionario_codigo_anac === csvRow.codigoAnac;
      const cursoMatch =
        normalizeCursoName(dbRow.tipo_codigo || '') === normalizedCursoCSV ||
        normalizeCursoName(dbRow.tipo_nome || '') === normalizedCursoCSV;
      return codigoMatch && cursoMatch;
    });

    if (!dbMatch) {
      differences.push({
        tripulante: csvRow.tripulante,
        codigoAnac: csvRow.codigoAnac,
        curso: csvRow.curso,
        dataVencimentoCSV: normalizedDateCSV,
        dataVencimentoDB: null,
        status: 'MISSING_IN_DB',
        observacao: 'Qualificação não encontrada no banco de dados',
      });
    } else if (dbMatch.renovada === 1) {
      differences.push({
        tripulante: csvRow.tripulante,
        codigoAnac: csvRow.codigoAnac,
        curso: csvRow.curso,
        dataVencimentoCSV: normalizedDateCSV,
        dataVencimentoDB: dbMatch.data_vencimento,
        status: 'RENOVADA',
        observacao: 'Qualificação marcada como RENOVADA no banco',
      });
    } else if (dbMatch.data_vencimento !== normalizedDateCSV) {
      differences.push({
        tripulante: csvRow.tripulante,
        codigoAnac: csvRow.codigoAnac,
        curso: csvRow.curso,
        dataVencimentoCSV: normalizedDateCSV,
        dataVencimentoDB: dbMatch.data_vencimento,
        status: 'DATE_MISMATCH',
        observacao: `Data diferente: CSV=${normalizedDateCSV}, DB=${dbMatch.data_vencimento}`,
      });
    } else {
      matchCount++;
    }
  }

  // Group differences by status
  const byStatus = {
    MISSING_IN_DB: differences.filter((d) => d.status === 'MISSING_IN_DB'),
    DATE_MISMATCH: differences.filter((d) => d.status === 'DATE_MISMATCH'),
    RENOVADA: differences.filter((d) => d.status === 'RENOVADA'),
  };

  return {
    summary: {
      csvTotal: csvRows.length,
      dbTotal: dbRows.length,
      matches: matchCount,
      differences: differences.length,
    },
    differences,
    byStatus,
  };
}
