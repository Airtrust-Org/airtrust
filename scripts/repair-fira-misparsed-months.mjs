import { execFileSync } from 'node:child_process';

const WORKER_DIR = new URL('../worker-airtrust/', import.meta.url);
const AUGUST_START = '2026-08-01';
const SEPTEMBER_START = '2026-09-01';

const MONTHS = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARCO_CEDILHA: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

function normalizeMonthLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function monthNameFromNumber(number) {
  return [
    '',
    'JANEIRO',
    'FEVEREIRO',
    'MARÇO',
    'ABRIL',
    'MAIO',
    'JUNHO',
    'JULHO',
    'AGOSTO',
    'SETEMBRO',
    'OUTUBRO',
    'NOVEMBRO',
    'DEZEMBRO',
  ][number];
}

function inferMonthFromImportName(name) {
  const match = String(name || '').match(/M[eê]s\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)/i);
  if (!match?.[1]) {
    return null;
  }

  const normalized = normalizeMonthLabel(match[1]);
  if (normalized === 'MARCO') {
    return 3;
  }
  return MONTHS[normalized] || null;
}

function runWranglerJson(sql) {
  const stdout = execFileSync(
    'wrangler',
    ['d1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--json', '--command', sql],
    { cwd: WORKER_DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(stdout)[0];
}

function runWrangler(sql) {
  execFileSync(
    'wrangler',
    ['d1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--command', sql],
    { cwd: WORKER_DIR, encoding: 'utf-8', stdio: 'inherit' },
  );
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function updatePreviewJson(rawJson, targetMonth) {
  const preview = JSON.parse(rawJson);
  const targetPrefix = `2026-${String(targetMonth).padStart(2, '0')}-`;

  if (preview?.cabecalho) {
    preview.cabecalho.ano = 2026;
    preview.cabecalho.mes = targetMonth;
    preview.cabecalho.mesNome = monthNameFromNumber(targetMonth);
  }

  if (Array.isArray(preview?.linhas)) {
    preview.linhas = preview.linhas.map((linha) => ({
      ...linha,
      data:
        typeof linha.data === 'string' ? linha.data.replace('2026-08-', targetPrefix) : linha.data,
    }));
  }

  return JSON.stringify(preview);
}

const importsResult = runWranglerJson(`
  SELECT id, tripulante_id, nome_fira, created_at, preview_json
  FROM frms_importacao_fira
  WHERE deleted_at IS NULL
    AND ano = 2026
    AND mes = 8
    AND tripulante_id IS NOT NULL
  ORDER BY datetime(created_at) ASC;
`);

const rows = importsResult.results || [];
if (rows.length === 0) {
  console.log('Nenhuma importação FIRA restante marcada como agosto.');
  process.exit(0);
}

for (const row of rows) {
  const targetMonth = inferMonthFromImportName(row.nome_fira);
  if (!targetMonth || targetMonth === 8) {
    console.log(`Ignorando importação ${row.id} (${row.nome_fira}) por não haver mês-alvo claro.`);
    continue;
  }

  const targetPrefix = `2026-${String(targetMonth).padStart(2, '0')}-`;
  const createdDay = String(row.created_at).slice(0, 10);
  const previewJson = updatePreviewJson(row.preview_json, targetMonth);

  console.log(
    `Corrigindo importação ${row.id} do tripulante ${row.tripulante_id}: agosto -> ${monthNameFromNumber(targetMonth)} (${createdDay})`,
  );

  runWrangler(`
    UPDATE frms_importacao_fira
       SET mes = ${targetMonth},
           preview_json = '${escapeSql(previewJson)}',
           updated_at = datetime('now')
     WHERE id = '${escapeSql(row.id)}';
  `);

  runWrangler(`
    UPDATE frms_jornada
       SET deleted_at = COALESCE(deleted_at, datetime('now')),
           updated_at = datetime('now')
     WHERE deleted_at IS NULL
       AND tripulante_id = '${escapeSql(row.tripulante_id)}'
       AND data IN (
         SELECT REPLACE(data, '2026-08-', '${targetPrefix}')
         FROM frms_jornada
         WHERE deleted_at IS NULL
           AND origem = 'FIRA'
           AND tripulante_id = '${escapeSql(row.tripulante_id)}'
           AND data >= '${AUGUST_START}'
           AND data < '${SEPTEMBER_START}'
           AND date(created_at) = date('${createdDay}')
       );
  `);

  runWrangler(`
    UPDATE frms_jornada
       SET data = REPLACE(data, '2026-08-', '${targetPrefix}'),
           updated_at = datetime('now')
     WHERE deleted_at IS NULL
       AND origem = 'FIRA'
       AND tripulante_id = '${escapeSql(row.tripulante_id)}'
       AND data >= '${AUGUST_START}'
       AND data < '${SEPTEMBER_START}'
       AND date(created_at) = date('${createdDay}');
  `);
}

console.log('Correção genérica de meses FIRA concluída.');
