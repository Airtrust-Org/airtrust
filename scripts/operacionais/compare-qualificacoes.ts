/**
 * Script para comparar vencimentos de qualificações do CSV com o banco de dados
 *
 * Uso: npx tsx scripts/compare-qualificacoes.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// Dados do CSV fornecido
const csvData = `TRIPULANTE,ANV,DESIGNAÇÃO,CURSO,DATA VENCIMENTO
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,CMA,4/3/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,CHT TIPO,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,CHT IFR,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,FAP 05.2,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,OPC,3/31/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,FAP 06,9/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,IFR,3/31/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,LPC,1/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,B. C. Gerais  da Aeronave,10/22/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,C. Emergencias Gerais,10/22/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,D1. AVSEC,10/31/2027
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,D2. SGSO 2ANOS,11/26/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,D3. CRM,3/15/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,D4. ARTIGOS PERIGOSOS 2ANOS,9/22/2027
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,E1. OFFSHORE,10/24/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,E2.PBN,11/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,E3.HUET/ THUET 4ANOS,8/16/2027
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,E5. EFB,11/30/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,F. C. SOLO AW139,5/7/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,G1.C.  VOO AW139,9/20/2026
ADRIANA BRASIL - 951681,"[""AW139""]",SIC,Dt. Próximo ASO,2/17/2026`;

interface CSVRow {
  tripulante: string;
  codigoAnac: string;
  anv: string;
  designacao: string;
  curso: string;
  dataVencimento: string;
}

interface DBRow {
  funcionario_nome: string;
  funcionario_codigo_anac: string;
  tipo_codigo: string;
  tipo_nome: string;
  data_vencimento: string;
  renovada: number;
}

interface Difference {
  tripulante: string;
  codigoAnac: string;
  curso: string;
  dataVencimentoCSV: string;
  dataVencimentoDB: string | null;
  status: 'MISSING_IN_DB' | 'DATE_MISMATCH' | 'RENOVADA' | 'OK';
  observacao?: string;
}

function parseCSV(csvText: string): CSVRow[] {
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

function normalizeDate(dateStr: string): string {
  // Convert M/D/YYYY to YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;

  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const year = parts[2];

  return `${year}-${month}-${day}`;
}

function normalizeCursoName(curso: string): string {
  return curso
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .replace(/\s*-\s*/g, '-');
}

async function compareQualificacoes() {
  const dbPath = path.join(process.cwd(), 'airtrust.db');

  if (!fs.existsSync(dbPath)) {
    console.error('❌ Banco de dados não encontrado:', dbPath);
    process.exit(1);
  }

  const db = new Database(dbPath);

  console.log('📊 Comparando qualificações do CSV com o banco de dados...\n');

  // Parse CSV
  const csvRows = parseCSV(csvData);
  console.log(`✅ CSV parseado: ${csvRows.length} registros\n`);

  // Get all qualifications from DB (only active, non-renovada)
  const dbRows = db
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
    .all() as DBRow[];

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

  db.close();

  // Print results
  console.log('═'.repeat(100));
  console.log('📋 RESUMO DA COMPARAÇÃO');
  console.log('═'.repeat(100));
  console.log(`Total de registros no CSV: ${csvRows.length}`);
  console.log(`Total de registros no DB: ${dbRows.length}`);
  console.log(`Registros correspondentes: ${matchCount}`);
  console.log(`Diferenças encontradas: ${differences.length}`);
  console.log('═'.repeat(100));
  console.log('');

  if (differences.length === 0) {
    console.log('✅ Nenhuma diferença encontrada! Os arquivos estão correspondentes.');
    return;
  }

  // Group differences by status
  const byStatus = {
    MISSING_IN_DB: differences.filter((d) => d.status === 'MISSING_IN_DB'),
    DATE_MISMATCH: differences.filter((d) => d.status === 'DATE_MISMATCH'),
    RENOVADA: differences.filter((d) => d.status === 'RENOVADA'),
  };

  // Print missing in DB
  if (byStatus.MISSING_IN_DB.length > 0) {
    console.log('🔴 QUALIFICAÇÕES AUSENTES NO BANCO DE DADOS:');
    console.log('─'.repeat(100));
    for (const diff of byStatus.MISSING_IN_DB) {
      console.log(`  • ${diff.tripulante} (${diff.codigoAnac}) - ${diff.curso}`);
      console.log(`    Vencimento CSV: ${diff.dataVencimentoCSV}`);
      console.log('');
    }
  }

  // Print date mismatches
  if (byStatus.DATE_MISMATCH.length > 0) {
    console.log('🟡 DATAS DE VENCIMENTO DIFERENTES:');
    console.log('─'.repeat(100));
    for (const diff of byStatus.DATE_MISMATCH) {
      console.log(`  • ${diff.tripulante} (${diff.codigoAnac}) - ${diff.curso}`);
      console.log(`    CSV: ${diff.dataVencimentoCSV}`);
      console.log(`    DB:  ${diff.dataVencimentoDB}`);
      console.log('');
    }
  }

  // Print renovadas
  if (byStatus.RENOVADA.length > 0) {
    console.log('🔵 QUALIFICAÇÕES MARCADAS COMO RENOVADAS NO BANCO:');
    console.log('─'.repeat(100));
    for (const diff of byStatus.RENOVADA) {
      console.log(`  • ${diff.tripulante} (${diff.codigoAnac}) - ${diff.curso}`);
      console.log(`    Vencimento CSV: ${diff.dataVencimentoCSV}`);
      console.log(`    Vencimento DB:  ${diff.dataVencimentoDB} (RENOVADA)`);
      console.log('');
    }
  }

  // Save detailed report to file
  const reportPath = path.join(process.cwd(), 'comparacao-qualificacoes-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        summary: {
          csvTotal: csvRows.length,
          dbTotal: dbRows.length,
          matches: matchCount,
          differences: differences.length,
        },
        differences: differences,
      },
      null,
      2,
    ),
  );

  console.log('═'.repeat(100));
  console.log(`📄 Relatório detalhado salvo em: ${reportPath}`);
  console.log('═'.repeat(100));
}

// Run comparison
compareQualificacoes().catch(console.error);
