#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DB = 'airtrust-db';
const CANONICAL_SOURCE = 'SIGVOOS';
const NON_CANONICAL_SOURCES = new Set(['FIRA', 'APUS', 'MANUAL', 'SIMULADOR', '']);
const REQUIRED_FROM = '2026-01-01';
const DEFAULT_TO = '2026-06-05';

function usage() {
  return [
    'Usage:',
    '  node scripts/frms-rebuild-from-sigvoos-2026.mjs --dry-run --from 2026-01-01 --to 2026-06-05 --all-tripulantes',
    '  node scripts/frms-rebuild-from-sigvoos-2026.mjs --execute --from 2026-06-01 --to 2026-06-05 --tripulante-id 7',
    '',
    'Safety:',
    '  --dry-run or --execute is required, and they are mutually exclusive.',
    '  --all-tripulantes or --tripulante-id <id> is required.',
    '  No migrations and no physical DELETE are executed.',
  ].join('\n');
}

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    execute: false,
    from: null,
    to: null,
    allTripulantes: false,
    tripulanteId: null,
    db: DEFAULT_DB,
    outDir: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--all-tripulantes') args.allTripulantes = true;
    else if (arg === '--from') args.from = argv[++i] ?? null;
    else if (arg === '--to') args.to = argv[++i] ?? null;
    else if (arg === '--tripulante-id') args.tripulanteId = Number(argv[++i] ?? 0);
    else if (arg === '--db') args.db = argv[++i] ?? DEFAULT_DB;
    else if (arg === '--out-dir') args.outDir = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.dryRun === args.execute) {
    throw new Error('Choose exactly one of --dry-run or --execute.');
  }
  if (!args.from || !args.to) {
    throw new Error('--from and --to are required.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from) || !/^\d{4}-\d{2}-\d{2}$/.test(args.to)) {
    throw new Error('--from and --to must be ISO dates.');
  }
  if (args.from < REQUIRED_FROM) {
    throw new Error(`Scope cannot start before ${REQUIRED_FROM}.`);
  }
  if (args.from > args.to) {
    throw new Error('--from cannot be after --to.');
  }
  if (args.allTripulantes && args.tripulanteId) {
    throw new Error('Use either --all-tripulantes or --tripulante-id, not both.');
  }
  if (!args.allTripulantes && !args.tripulanteId) {
    throw new Error('Scope is required: --all-tripulantes or --tripulante-id <id>.');
  }
  if (args.tripulanteId && (!Number.isInteger(args.tripulanteId) || args.tripulanteId <= 0)) {
    throw new Error('--tripulante-id must be a positive integer.');
  }

  return args;
}

function shellD1(sql, options = {}) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', options.db || DEFAULT_DB, '--remote', '--json', '--command', sql],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 80,
      env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `D1 failed for SQL: ${sql.slice(0, 200)}`);
  }
  const parsed = JSON.parse(result.stdout);
  for (const entry of parsed) {
    if (!entry.success) {
      throw new Error(`D1 failed for SQL: ${sql.slice(0, 200)}`);
    }
  }
  return parsed;
}

function queryRows(sql, options) {
  const parsed = shellD1(sql, options);
  return parsed.flatMap((entry) => entry.results || []);
}

function runSqlStatements(statements, options) {
  let totalChanges = 0;
  let batches = 0;
  const chunkSize = 40;
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize).join('\n');
    const parsed = shellD1(chunk, options);
    batches += 1;
    for (const entry of parsed) {
      totalChanges += Number(entry.meta?.changes || 0);
    }
  }
  return { totalChanges, batches };
}

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function minutesPct(valueMin, limitHours) {
  const limitMin = Math.max(1, Number(limitHours || 0) * 60);
  return Math.round((Number(valueMin || 0) / limitMin) * 10000) / 100;
}

function normalizeSource(value) {
  return String(value ?? '').trim().toUpperCase();
}

function parseJsonLine(row) {
  try {
    return JSON.parse(row.line_json || '{}');
  } catch {
    return {};
  }
}

export function isValidSigvoosLine(row) {
  const jornada = Number(row.duracao_jornada_min);
  const hv = Number(row.horas_voo_min);
  if (!Number.isFinite(jornada) || !Number.isFinite(hv)) return false;
  if (jornada < 0 || hv < 0) return false;
  if (hv > jornada) return false;
  if (hv > 1440 || jornada > 1440) return false;
  if (jornada === 0 && hv > 0) return false;
  return true;
}

export function dedupeSigvoosRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.tripulante_id}:${row.data}`;
    const previous = byKey.get(key);
    const currentRank = `${row.created_at || ''}:${row.importacao_id || ''}`;
    const previousRank = previous ? `${previous.created_at || ''}:${previous.importacao_id || ''}` : '';
    if (!previous || currentRank >= previousRank) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const byTrip = Number(a.tripulante_id) - Number(b.tripulante_id);
    return byTrip || String(a.data).localeCompare(String(b.data));
  });
}

export function buildPlan({ sigvoosRows, jornadasRows }) {
  const jornadasByKey = new Map(jornadasRows.map((row) => [`${row.tripulante_id}:${row.data}`, row]));
  const validSigvoos = [];
  const invalidSigvoos = [];
  const actions = [];

  for (const row of sigvoosRows) {
    if (!isValidSigvoosLine(row)) {
      invalidSigvoos.push({ ...row, reason: 'SIGVOOS_INVALIDO_HV_GT_JORNADA_OU_EXTREMO' });
      continue;
    }
    validSigvoos.push(row);
    const key = `${row.tripulante_id}:${row.data}`;
    const existing = jornadasByKey.get(key) || null;
    const existingSource = normalizeSource(existing?.origem);
    if (!existing) {
      actions.push({ type: 'create_sigvoos', source: row, existing: null });
      continue;
    }
    if (existingSource === CANONICAL_SOURCE) {
      const changed =
        String(existing.hora_apresentacao || '') !== String(row.hora_apresentacao || '') ||
        String(existing.hora_termino || '') !== String(row.hora_termino || '') ||
        Number(existing.duracao_jornada_minutos || 0) !== Number(row.duracao_jornada_min || 0) ||
        Number(existing.horas_voo_minutos || 0) !== Number(row.horas_voo_min || 0) ||
        String(existing.local_base || '') !== String(row.local_base || '');
      actions.push({ type: changed ? 'update_sigvoos' : 'preserve_sigvoos', source: row, existing });
      continue;
    }
    actions.push({ type: 'replace_noncanonical_with_sigvoos', source: row, existing });
  }

  const validKeys = new Set(validSigvoos.map((row) => `${row.tripulante_id}:${row.data}`));
  const pendingRows = jornadasRows.filter((row) => {
    const source = normalizeSource(row.origem);
    return source !== CANONICAL_SOURCE && !validKeys.has(`${row.tripulante_id}:${row.data}`);
  });

  return { actions, validSigvoos, invalidSigvoos, pendingRows };
}

function sigvoosSourceSql(args) {
  const tripFilter = args.tripulanteId ? `AND f.tripulante_id = ${q(String(args.tripulanteId))}` : '';
  return `
    SELECT
      f.id AS importacao_id,
      f.tripulante_id,
      COALESCE(func.empresa_id, NULL) AS empresa_id,
      f.nome_fira AS nome_sigvoos,
      json_extract(l.value,'$.data') AS data,
      COALESCE(json_extract(l.value,'$.status_frms'), 'ES') AS status_frms,
      json_extract(l.value,'$.hora_apresentacao') AS hora_apresentacao,
      json_extract(l.value,'$.hora_termino') AS hora_termino,
      CAST(json_extract(l.value,'$.duracao_jornada_min') AS INTEGER) AS duracao_jornada_min,
      CAST(json_extract(l.value,'$.horas_voo_min') AS INTEGER) AS horas_voo_min,
      json_extract(l.value,'$.local_base') AS local_base,
      f.created_at,
      f.updated_at,
      l.value AS line_json
    FROM frms_importacao_fira f
    JOIN json_each(f.preview_json, '$.linhas') l
    LEFT JOIN funcionarios func ON func.id = CAST(f.tripulante_id AS INTEGER)
    WHERE f.deleted_at IS NULL
      AND f.tripulante_id IS NOT NULL
      AND (f.arquivo_nome LIKE 'SIGVOOS_%' OR f.importado_por = 'SIGVOOS')
      AND json_extract(l.value,'$.data') BETWEEN ${q(args.from)} AND ${q(args.to)}
      ${tripFilter}
    ORDER BY f.tripulante_id, json_extract(l.value,'$.data'), datetime(f.created_at), f.id`;
}

function jornadasSql(args) {
  const tripFilter = args.tripulanteId ? `AND tripulante_id = ${Number(args.tripulanteId)}` : '';
  return `
    SELECT *
    FROM frms_jornada
    WHERE deleted_at IS NULL
      AND data BETWEEN ${q(args.from)} AND ${q(args.to)}
      ${tripFilter}
    ORDER BY tripulante_id, data, created_at, id`;
}

function orphanAlertasSql(args) {
  const tripFilter = args.tripulanteId ? `AND a.tripulante_id = ${Number(args.tripulanteId)}` : '';
  return `
    SELECT a.*
    FROM frms_alerta a
    WHERE a.deleted_at IS NULL
      AND a.jornada_id IS NULL
      AND date(a.created_at) BETWEEN date(${q(args.from)}) AND date(${q(args.to)})
      ${tripFilter}
    ORDER BY a.tripulante_id, a.created_at, a.id`;
}

function limitesSql() {
  return `
    SELECT nome, valor_numerico
    FROM frms_configuracao_limites
    WHERE deleted_at IS NULL AND ativo = 1`;
}

function readLimites(args) {
  const rows = queryRows(limitesSql(), args);
  const values = Object.fromEntries(rows.map((row) => [row.nome, Number(row.valor_numerico)]));
  return {
    FDP_MAXIMO_HORAS: values.FDP_MAXIMO_HORAS ?? 11,
    HV_DIARIA_HORAS: values.HV_DIARIA_HORAS ?? 8,
    HV_7_DIAS_HORAS: values.HV_7_DIAS_HORAS ?? 45,
    HV_MES_HORAS: values.HV_MES_HORAS ?? 90,
    HV_365_DIAS_HORAS: values.HV_365_DIAS_HORAS ?? 930,
    ALERTA_AVISO_PCT: values.ALERTA_AVISO_PCT ?? 80,
    ALERTA_ATENCAO_PCT: values.ALERTA_ATENCAO_PCT ?? 90,
    ALERTA_CRITICO_PCT: values.ALERTA_CRITICO_PCT ?? 95,
    ALERTA_VIOLACAO_PCT: values.ALERTA_VIOLACAO_PCT ?? 101,
    FDP_ALERTA_RESTANTE_HORAS: values.FDP_ALERTA_RESTANTE_HORAS ?? 3,
    HV_DIA_ALERTA_RESTANTE_HORAS: values.HV_DIA_ALERTA_RESTANTE_HORAS ?? 2,
  };
}

function insertJornadaSql(row, id, timestamp, registradoPor = 'SIGVOOS_REBUILD_2026') {
  return `
    INSERT INTO frms_jornada (
      id, tripulante_id, empresa_id, data, status,
      hora_apresentacao, hora_termino, duracao_jornada_minutos, horas_voo_minutos,
      hora_primeiro_acionamento, hora_primeira_decolagem, hora_ultimo_pouso, hora_corte_motor,
      hora_dormiu, repouso_plataforma_inicio, repouso_plataforma_fim, repouso_plataforma_valido,
      observacao, registrado_por, origem, local_base,
      tipo_base, tripulacao_aumentada, classe_cabine, aclimatado,
      fonte_resolucao_sigvoos, fonte_resolucao,
      created_at, updated_at
    ) VALUES (
      ${q(id)}, ${Number(row.tripulante_id)}, ${row.empresa_id == null ? 'NULL' : Number(row.empresa_id)},
      ${q(row.data)}, ${q(row.status_frms || 'ES')},
      ${q(row.hora_apresentacao)}, ${q(row.hora_termino)}, ${Number(row.duracao_jornada_min)}, ${Number(row.horas_voo_min)},
      NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, 0,
      ${q(`Reconstrução FRMS SIGVOOS 2026; importacao=${row.importacao_id}`)},
      ${q(registradoPor)}, 'SIGVOOS', ${q(row.local_base)},
      'HOME', 0, NULL, 1,
      'REBUILD_SIGVOOS_2026', 'SIGVOOS',
      ${q(timestamp)}, ${q(timestamp)}
    );`;
}

function updateJornadaSql(row, existingId, timestamp) {
  return `
    UPDATE frms_jornada
       SET status = ${q(row.status_frms || 'ES')},
           hora_apresentacao = ${q(row.hora_apresentacao)},
           hora_termino = ${q(row.hora_termino)},
           duracao_jornada_minutos = ${Number(row.duracao_jornada_min)},
           horas_voo_minutos = ${Number(row.horas_voo_min)},
           local_base = ${q(row.local_base)},
           origem = 'SIGVOOS',
           fonte_resolucao_sigvoos = 'REBUILD_SIGVOOS_2026',
           fonte_resolucao = 'SIGVOOS',
           observacao = ${q(`Reconstrução FRMS SIGVOOS 2026; importacao=${row.importacao_id}`)},
           updated_at = ${q(timestamp)}
     WHERE id = ${q(existingId)} AND deleted_at IS NULL;`;
}

function copyFatorizacaoSql(oldJornadaId, newJornadaId, timestamp) {
  const newFatId = crypto.randomUUID();
  return `
    INSERT INTO frms_fatorizacao_jornada (
      id, jornada_id,
      fator_basica_pct, fator_apresentacao_pct, fator_duracao_pct, fator_repouso_pct,
      fator_noturno_dep_pct, fator_noturno_arr_pct, total_fatorizado_jornada,
      fator_hv_basica_pct, fator_hv_quantidade_pct, fator_hv_noturno_dep_pct,
      fator_hv_noturno_arr_pct, total_fatorizado_hv,
      created_at, updated_at, deleted_at,
      fator_base_away_pct, fator_aclimatacao_pct, fator_ciclo_embarcado_pct,
      effectiveness_pct, effectiveness_nivel, effectiveness_componentes_json,
      hora_despertar_estimada, hora_inicio_sono_estimado, duracao_sono_efetiva_min,
      tempo_abaixo_limiar_min, dia_periodo_embarcado, total_dias_periodo, processado_com_bug
    )
    SELECT
      ${q(newFatId)}, ${q(newJornadaId)},
      fator_basica_pct, fator_apresentacao_pct, fator_duracao_pct, fator_repouso_pct,
      fator_noturno_dep_pct, fator_noturno_arr_pct, total_fatorizado_jornada,
      fator_hv_basica_pct, fator_hv_quantidade_pct, fator_hv_noturno_dep_pct,
      fator_hv_noturno_arr_pct, total_fatorizado_hv,
      ${q(timestamp)}, ${q(timestamp)}, NULL,
      fator_base_away_pct, fator_aclimatacao_pct, fator_ciclo_embarcado_pct,
      effectiveness_pct, effectiveness_nivel, effectiveness_componentes_json,
      hora_despertar_estimada, hora_inicio_sono_estimado, duracao_sono_efetiva_min,
      tempo_abaixo_limiar_min, dia_periodo_embarcado, total_dias_periodo, 0
    FROM frms_fatorizacao_jornada
    WHERE jornada_id = ${q(oldJornadaId)}
      AND deleted_at IS NULL
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1;`;
}

function buildDataMutationSql(plan, timestamp) {
  const statements = [];
  for (const action of plan.actions) {
    const source = action.source;
    if (action.type === 'preserve_sigvoos') continue;
    if (action.type === 'update_sigvoos') {
      statements.push(updateJornadaSql(source, action.existing.id, timestamp));
      continue;
    }
    if (action.type === 'replace_noncanonical_with_sigvoos') {
      const newId = crypto.randomUUID();
      const oldId = action.existing.id;
      statements.push(
        `UPDATE frms_alerta SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)} WHERE jornada_id = ${q(oldId)} AND deleted_at IS NULL;`,
      );
      statements.push(
        `UPDATE frms_jornada SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)} WHERE id = ${q(oldId)} AND deleted_at IS NULL;`,
      );
      statements.push(insertJornadaSql(source, newId, timestamp));
      statements.push(copyFatorizacaoSql(oldId, newId, timestamp));
      statements.push(
        `UPDATE frms_fatorizacao_jornada SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)} WHERE jornada_id = ${q(oldId)} AND deleted_at IS NULL;`,
      );
      statements.push(
        `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos)
         VALUES ('frms_jornada', 'FRMS_SIGVOOS_GLOBAL_REBUILD_REPLACE', ${q(oldId)}, ${q(JSON.stringify({ old_id: oldId }))}, ${q(JSON.stringify({ new_id: newId, importacao_id: source.importacao_id, data: source.data }))});`,
      );
      continue;
    }
    if (action.type === 'create_sigvoos') {
      statements.push(insertJornadaSql(source, crypto.randomUUID(), timestamp));
    }
  }
  return statements;
}

function activeSigvoosSql(args) {
  const tripFilter = args.tripulanteId ? `AND j.tripulante_id = ${Number(args.tripulanteId)}` : '';
  return `
    SELECT j.id, j.tripulante_id, COALESCE(f.nome, 'Tripulante #' || j.tripulante_id) AS nome,
           j.data, j.hora_apresentacao, j.hora_termino,
           COALESCE(j.duracao_jornada_minutos,0) AS duracao_jornada_minutos,
           COALESCE(j.horas_voo_minutos,0) AS horas_voo_minutos,
           COALESCE(j.tripulacao_aumentada,0) AS tripulacao_aumentada
      FROM frms_jornada j
      LEFT JOIN funcionarios f ON f.id = j.tripulante_id
     WHERE j.deleted_at IS NULL
       AND UPPER(COALESCE(j.origem,'')) = 'SIGVOOS'
       AND j.data BETWEEN ${q(args.from)} AND ${q(args.to)}
       ${tripFilter}
     ORDER BY j.tripulante_id, j.data, j.created_at, j.id`;
}

function dateMinusDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function monthKey(iso) {
  return String(iso).slice(0, 7);
}

function calcRollingRows(jornadas, limites) {
  const byTrip = new Map();
  for (const j of jornadas) {
    const list = byTrip.get(String(j.tripulante_id)) || [];
    list.push(j);
    byTrip.set(String(j.tripulante_id), list);
  }

  const rows = [];
  for (const list of byTrip.values()) {
    list.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    for (const jornada of list) {
      const sumBetween = (from) =>
        list
          .filter((item) => item.data >= from && item.data <= jornada.data)
          .reduce((acc, item) => acc + Number(item.horas_voo_minutos || 0), 0);
      const sumMonth = list
        .filter((item) => monthKey(item.data) === monthKey(jornada.data) && item.data <= jornada.data)
        .reduce((acc, item) => acc + Number(item.horas_voo_minutos || 0), 0);
      const hvDia = Number(jornada.horas_voo_minutos || 0);
      const hv7 = sumBetween(dateMinusDays(jornada.data, 6));
      const hv28 = sumBetween(dateMinusDays(jornada.data, 27));
      const hv365 = sumBetween(dateMinusDays(jornada.data, 364));
      rows.push({
        jornada,
        hv_7_dias_min: hv7,
        hv_28_dias_min: hv28,
        hv_365_dias_min: hv365,
        hv_mes_calendario_min: sumMonth,
        hv_dia_min: hvDia,
        pct_limite_7d: minutesPct(hv7, limites.HV_7_DIAS_HORAS),
        pct_limite_28d: minutesPct(hv28, limites.HV_7_DIAS_HORAS * 4),
        pct_limite_mes_calendario: minutesPct(sumMonth, limites.HV_MES_HORAS),
        pct_limite_365d: minutesPct(hv365, limites.HV_365_DIAS_HORAS),
        pct_limite_dia: minutesPct(hvDia, limites.HV_DIARIA_HORAS),
      });
    }
  }
  return rows;
}

function nivelAlerta(pct, limites, permiteViolacao = false) {
  if (permiteViolacao && pct >= limites.ALERTA_VIOLACAO_PCT) return 'VIOLACAO';
  if (pct >= limites.ALERTA_CRITICO_PCT) return 'CRITICO';
  if (pct >= limites.ALERTA_ATENCAO_PCT) return 'ATENCAO';
  return 'AVISO';
}

function formatMin(min) {
  const hours = Math.floor(Number(min || 0) / 60);
  const minutes = Number(min || 0) % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}min`;
}

function buildAlertas(row, limites) {
  const alertas = [];
  const j = row.jornada;
  const fdpLimMin = limites.FDP_MAXIMO_HORAS * 60;
  const fdpThresholdMin = fdpLimMin - limites.FDP_ALERTA_RESTANTE_HORAS * 60;
  const duracao = Number(j.duracao_jornada_minutos || 0);
  if (duracao >= fdpThresholdMin) {
    const pct = minutesPct(duracao, limites.FDP_MAXIMO_HORAS);
    alertas.push({
      tipo: 'FDP_DIARIO',
      nivel: nivelAlerta(pct, limites),
      pct,
      valorAtual: duracao,
      valorLimite: fdpLimMin,
      mensagem: `${j.nome}: jornada de ${formatMin(duracao)} (${pct}% do limite de ${limites.FDP_MAXIMO_HORAS}h)`,
    });
  }

  const hvDiaThreshold = limites.HV_DIARIA_HORAS * 60 - limites.HV_DIA_ALERTA_RESTANTE_HORAS * 60;
  if (row.hv_dia_min >= hvDiaThreshold) {
    alertas.push({
      tipo: 'HV_DIARIA',
      nivel: nivelAlerta(row.pct_limite_dia, limites, true),
      pct: row.pct_limite_dia,
      valorAtual: row.hv_dia_min,
      valorLimite: limites.HV_DIARIA_HORAS * 60,
      mensagem: `${j.nome}: HV diária ${formatMin(row.hv_dia_min)} (${row.pct_limite_dia}% do limite de ${limites.HV_DIARIA_HORAS}h)`,
    });
  }

  for (const item of [
    ['HV_7D', row.pct_limite_7d, row.hv_7_dias_min, limites.HV_7_DIAS_HORAS * 60, `HV 7 dias: ${formatMin(row.hv_7_dias_min)} de ${limites.HV_7_DIAS_HORAS}h`],
    ['HV_MES', row.pct_limite_mes_calendario, row.hv_mes_calendario_min, limites.HV_MES_HORAS * 60, `HV mês: ${formatMin(row.hv_mes_calendario_min)} de ${limites.HV_MES_HORAS}h`],
    ['HV_365D', row.pct_limite_365d, row.hv_365_dias_min, limites.HV_365_DIAS_HORAS * 60, `HV 365d: ${formatMin(row.hv_365_dias_min)} de ${limites.HV_365_DIAS_HORAS}h`],
  ]) {
    const [tipo, pct, valorAtual, valorLimite, label] = item;
    if (pct >= limites.ALERTA_AVISO_PCT) {
      alertas.push({
        tipo,
        nivel: nivelAlerta(pct, limites),
        pct,
        valorAtual,
        valorLimite,
        mensagem: `${j.nome}: ${label} (${pct}%)`,
      });
    }
  }

  return alertas;
}

export function buildOrphanAlertCleanupSql(orphanAlertRows, timestamp) {
  const statements = [];
  for (const alerta of orphanAlertRows) {
    statements.push(
      `UPDATE frms_alerta SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)}
        WHERE id = ${q(alerta.id)} AND deleted_at IS NULL AND jornada_id IS NULL;`,
    );
    statements.push(
      `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos)
       VALUES ('frms_alerta', 'FRMS_SIGVOOS_GLOBAL_REBUILD_ORPHAN_ALERT_SOFT_DELETE', ${q(alerta.id)},
        ${q(JSON.stringify({ id: alerta.id, tripulante_id: alerta.tripulante_id, tipo_limite: alerta.tipo_limite, created_at: alerta.created_at }))},
        ${q(JSON.stringify({ deleted_by: 'REBUILD_SIGVOOS_2026', reason: 'ORPHAN_ALERT_WITHOUT_CANONICAL_JORNADA' }))});`,
    );
  }
  return statements;
}

function buildDerivedSql(args, rollingRows, limites, timestamp, orphanAlertRows = []) {
  const tripFilter = args.tripulanteId ? `AND tripulante_id = ${Number(args.tripulanteId)}` : '';
  const alertTripFilter = args.tripulanteId ? `AND tripulante_id = ${Number(args.tripulanteId)}` : '';
  const statements = [
    `UPDATE frms_acumulo_rolling SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)}
      WHERE deleted_at IS NULL AND data_referencia BETWEEN ${q(args.from)} AND ${q(args.to)} ${tripFilter};`,
    `UPDATE frms_alerta SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)}
      WHERE deleted_at IS NULL AND jornada_id IN (
        SELECT id FROM frms_jornada
        WHERE data BETWEEN ${q(args.from)} AND ${q(args.to)} ${tripFilter}
      );`,
    `UPDATE frms_fatorizacao_jornada SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)}
      WHERE deleted_at IS NULL AND jornada_id IN (
        SELECT id FROM frms_jornada
        WHERE data BETWEEN ${q(args.from)} AND ${q(args.to)}
          AND UPPER(COALESCE(origem,'')) <> 'SIGVOOS'
          ${tripFilter}
      );`,
    `UPDATE frms_alerta SET deleted_at = ${q(timestamp)}, updated_at = ${q(timestamp)}
      WHERE deleted_at IS NULL ${alertTripFilter}
        AND jornada_id IN (
          SELECT id FROM frms_jornada
          WHERE data BETWEEN ${q(args.from)} AND ${q(args.to)}
            AND UPPER(COALESCE(origem,'')) <> 'SIGVOOS'
            ${tripFilter}
        );`,
  ];

  for (const row of rollingRows) {
    statements.push(`
      INSERT INTO frms_acumulo_rolling (
        id, tripulante_id, data_referencia,
        hv_7_dias_min, hv_28_dias_min, hv_365_dias_min,
        hv_mes_calendario_min, hv_dia_min,
        pct_limite_7d, pct_limite_28d, pct_limite_mes_calendario, pct_limite_365d, pct_limite_dia,
        repouso_anterior_min, repouso_suficiente,
        created_at, updated_at
      ) VALUES (
        ${q(crypto.randomUUID())}, ${Number(row.jornada.tripulante_id)}, ${q(row.jornada.data)},
        ${row.hv_7_dias_min}, ${row.hv_28_dias_min}, ${row.hv_365_dias_min},
        ${row.hv_mes_calendario_min}, ${row.hv_dia_min},
        ${row.pct_limite_7d}, ${row.pct_limite_28d}, ${row.pct_limite_mes_calendario}, ${row.pct_limite_365d}, ${row.pct_limite_dia},
        -1, 1,
        ${q(timestamp)}, ${q(timestamp)}
      );`);

    for (const alerta of buildAlertas(row, limites)) {
      statements.push(`
        INSERT INTO frms_alerta (
          id, tripulante_id, jornada_id, tipo_limite, nivel,
          percentual_atingido, valor_atual_min, valor_limite_min,
          mensagem, created_at, updated_at
        ) VALUES (
          ${q(crypto.randomUUID())}, ${Number(row.jornada.tripulante_id)}, ${q(row.jornada.id)},
          ${q(alerta.tipo)}, ${q(alerta.nivel)}, ${Number(alerta.pct)},
          ${Number(alerta.valorAtual)}, ${Number(alerta.valorLimite)}, ${q(alerta.mensagem)},
          ${q(timestamp)}, ${q(timestamp)}
        );`);
    }
  }

  statements.push(...buildOrphanAlertCleanupSql(orphanAlertRows, timestamp));

  return statements;
}

function summarizeActions(plan, sourceRows) {
  const counts = {};
  for (const action of plan.actions) counts[action.type] = (counts[action.type] || 0) + 1;
  return {
    source_rows: sourceRows.length,
    unique_tripulante_dates: plan.validSigvoos.length + plan.invalidSigvoos.length,
    valid_sigvoos: plan.validSigvoos.length,
    invalid_sigvoos: plan.invalidSigvoos.length,
    pending_noncanonical_rows: plan.pendingRows.length,
    actions: counts,
    tripulantes_validos: new Set(plan.validSigvoos.map((row) => String(row.tripulante_id))).size,
  };
}

function ensureOutDir(args) {
  const dir =
    args.outDir ||
    path.join(ROOT, 'artifacts', 'frms-sigvoos-global-rebuild-20260605', `run-${new Date().toISOString().replace(/[:.]/g, '')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = ensureOutDir(args);
  console.log(`[frms-rebuild] mode=${args.dryRun ? 'dry-run' : 'execute'} from=${args.from} to=${args.to} scope=${args.allTripulantes ? 'all' : `tripulante:${args.tripulanteId}`}`);

  const rawSigvoosRows = queryRows(sigvoosSourceSql(args), args);
  const sigvoosRows = dedupeSigvoosRows(rawSigvoosRows);
  const jornadasRows = queryRows(jornadasSql(args), args);
  const orphanAlertRows = queryRows(orphanAlertasSql(args), args);
  const limites = readLimites(args);
  const plan = buildPlan({ sigvoosRows, jornadasRows });
  const summary = {
    ...summarizeActions(plan, rawSigvoosRows),
    orphan_active_alerts_without_jornada: orphanAlertRows.length,
  };

  const report = {
    generated_at: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'execute',
    from: args.from,
    to: args.to,
    scope: args.allTripulantes ? 'all-tripulantes' : `tripulante:${args.tripulanteId}`,
    summary,
    invalid_sigvoos: plan.invalidSigvoos.slice(0, 100),
    pending_samples: plan.pendingRows.slice(0, 100),
    orphan_alert_samples: orphanAlertRows.slice(0, 100),
    action_samples: plan.actions.slice(0, 100),
  };

  fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[frms-rebuild] plan=${path.join(outDir, 'plan.json')}`);

  if (args.dryRun) {
    console.log('[frms-rebuild] dry-run complete; no database writes executed.');
    return;
  }

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const dataStatements = buildDataMutationSql(plan, timestamp);
  console.log(`[frms-rebuild] executing data statements=${dataStatements.length}`);
  const dataResult = runSqlStatements(dataStatements, args);

  const activeSigvoos = queryRows(activeSigvoosSql(args), args);
  const rollingRows = calcRollingRows(activeSigvoos, limites);
  const derivedStatements = buildDerivedSql(args, rollingRows, limites, timestamp, orphanAlertRows);
  console.log(`[frms-rebuild] executing derived statements=${derivedStatements.length}`);
  const derivedResult = runSqlStatements(derivedStatements, args);

  const executeReport = {
    ...report,
    executed_at: new Date().toISOString(),
    data_result: dataResult,
    derived_result: derivedResult,
    active_sigvoos_after_data: activeSigvoos.length,
    rolling_rows_inserted: rollingRows.length,
  };
  fs.writeFileSync(path.join(outDir, 'execute-result.json'), JSON.stringify(executeReport, null, 2));
  console.log(JSON.stringify(executeReport, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[frms-rebuild] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
