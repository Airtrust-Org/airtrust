import { execFileSync } from 'node:child_process';

const WORKER_DIR = new URL('../worker-airtrust/', import.meta.url);
const WINDOW_START = '2026-04-28 00:00:00';
const WINDOW_END = '2026-05-01 00:00:00';
const FROM_PREFIX = '2026-08-';
const TO_PREFIX = '2026-04-';

function runWranglerJson(sql) {
  const stdout = execFileSync(
    'wrangler',
    ['d1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--json', '--command', sql],
    {
      cwd: WORKER_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const parsed = JSON.parse(stdout);
  return parsed[0];
}

function runWrangler(sql) {
  execFileSync(
    'wrangler',
    ['d1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--command', sql],
    {
      cwd: WORKER_DIR,
      encoding: 'utf-8',
      stdio: 'inherit',
    },
  );
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function updatePreviewJson(rawJson) {
  const preview = JSON.parse(rawJson);
  if (preview?.cabecalho) {
    preview.cabecalho.ano = 2026;
    preview.cabecalho.mes = 4;
    preview.cabecalho.mesNome = 'ABRIL';
  }
  if (Array.isArray(preview?.linhas)) {
    preview.linhas = preview.linhas.map((linha) => ({
      ...linha,
      data:
        typeof linha.data === 'string' ? linha.data.replace(FROM_PREFIX, TO_PREFIX) : linha.data,
    }));
  }
  return JSON.stringify(preview);
}

const affectedTripulantesResult = runWranglerJson(`
  SELECT DISTINCT tripulante_id
  FROM frms_jornada
  WHERE deleted_at IS NULL
    AND origem = 'FIRA'
    AND data >= '2026-08-01'
    AND data < '2026-09-01'
    AND datetime(created_at) >= datetime('${WINDOW_START}')
    AND datetime(created_at) < datetime('${WINDOW_END}')
  ORDER BY tripulante_id ASC;
`);

const tripulanteIds = [
  ...new Set(
    (affectedTripulantesResult.results || [])
      .map((row) => Number(row.tripulante_id || 0))
      .filter((id) => id > 0),
  ),
];

if (tripulanteIds.length === 0) {
  console.log('Nenhum tripulante com jornadas FIRA em agosto importadas no lote de abril.');
  process.exit(0);
}

const importsResult = runWranglerJson(`
  SELECT id, tripulante_id, canac, nome_fira, status, created_at, preview_json
  FROM frms_importacao_fira
  WHERE deleted_at IS NULL
    AND tripulante_id IN (${tripulanteIds.join(', ')})
    AND datetime(created_at) >= datetime('${WINDOW_START}')
    AND datetime(created_at) < datetime('${WINDOW_END}')
  ORDER BY datetime(created_at) ASC;
`);

const rows = importsResult.results || [];
console.log(`Importações afetadas encontradas: ${rows.length}`);

for (const row of rows) {
  const previewJson = updatePreviewJson(row.preview_json);
  runWrangler(`
    UPDATE frms_importacao_fira
       SET ano = 2026,
           mes = 4,
           preview_json = '${escapeSql(previewJson)}',
           updated_at = datetime('now')
     WHERE id = '${escapeSql(row.id)}';
  `);
}

console.log(`Tripulantes com dados importados a corrigir: ${tripulanteIds.join(', ') || 'nenhum'}`);

for (const tripulanteId of tripulanteIds) {
  runWrangler(`
    UPDATE frms_jornada
       SET deleted_at = COALESCE(deleted_at, datetime('now')),
           updated_at = datetime('now')
     WHERE deleted_at IS NULL
       AND tripulante_id = '${tripulanteId}'
       AND data IN (
         SELECT REPLACE(data, '${FROM_PREFIX}', '${TO_PREFIX}')
         FROM frms_jornada
         WHERE deleted_at IS NULL
           AND origem = 'FIRA'
           AND tripulante_id = '${tripulanteId}'
           AND data >= '2026-08-01'
           AND data < '2026-09-01'
           AND datetime(created_at) >= datetime('${WINDOW_START}')
           AND datetime(created_at) < datetime('${WINDOW_END}')
       );
  `);

  runWrangler(`
    UPDATE frms_jornada
       SET data = REPLACE(data, '${FROM_PREFIX}', '${TO_PREFIX}'),
           updated_at = datetime('now')
     WHERE deleted_at IS NULL
       AND origem = 'FIRA'
       AND tripulante_id = '${tripulanteId}'
       AND data >= '2026-08-01'
       AND data < '2026-09-01'
       AND datetime(created_at) >= datetime('${WINDOW_START}')
       AND datetime(created_at) < datetime('${WINDOW_END}');
  `);
}

console.log('Correção SQL concluída.');
console.log(
  'Próximo passo: reprocessar os tripulantes corrigidos via /api/frms/reprocessar/:id no worker de desenvolvimento remoto.',
);
