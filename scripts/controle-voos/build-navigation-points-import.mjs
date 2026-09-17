#!/usr/bin/env node
// source_reference: CORDERNADAS.pdf / Flight Preview Waypoints List reviewed on 2026-09-17; generator preserves source provenance in the Schema V2 bundle.
// operational_decision: local deterministic extraction only; generated DML is tenant-scoped to Costa do Sol (empresa_id=6) and is applied only by the reviewed Schema V2 workflow.
// dry_run_required: this generator performs no remote writes; inspect/review the generated CSV, SQL, manifest and tests before any governed schema apply.
// rollback_plan_required: delete/regenerate the local artifacts before merge; after remote apply, use a reviewed forward Schema V2 compensation or the captured D1 recovery point, never ad-hoc SQL.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [pdfArg, csvArg, sqlArg] = process.argv.slice(2);
if (!pdfArg || !csvArg || !sqlArg) {
  console.error('usage: build-navigation-points-import.mjs <source.pdf> <output.csv> <output.sql>');
  process.exit(2);
}

const pdfPath = resolve(pdfArg);
const csvPath = resolve(csvArg);
const sqlPath = resolve(sqlArg);
const SOURCE = 'FLIGHT_PREVIEW_PDF_2026-09-17';
const SOURCE_REF = 'CORDERNADAS.pdf | Flight Preview Waypoints List | 2026-09-17 17:07';

const coordinateRe = /(?<elev>\d*)FT\s+(?<latd>\d{2})º(?<latm>\d{2})'(?<lats>\d{2})''(?<lathem>[NS])\s*\/\s*(?<lond>\d{3})º(?<lonm>\d{2})'(?<lons>\d{2})''(?<lonhem>[EW])\s+DMG:(?<mag>\d{2})º(?<maghem>[EW])/;

function fold(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
function dmsToDecimal(degrees, minutes, seconds, hemisphere) {
  const absolute = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  return hemisphere === 'S' || hemisphere === 'W' ? -absolute : absolute;
}

function extractIcaoCodeAndCleanName(code, sourceName) {
  const nameMatches = [...sourceName.toUpperCase().matchAll(/(?<![A-Z0-9])9P[A-Z0-9]{2}(?![A-Z0-9])/g)].map((match) => match[0]);
  const codeUpper = code.toUpperCase();
  if (/^9P[A-Z0-9]{2}$/.test(codeUpper)) nameMatches.unshift(codeUpper);
  const unique = [...new Set(nameMatches)];
  if (unique.length > 1) throw new Error(`Multiple ICAO codes for ${code}: ${unique.join(', ')}`);
  const codigoIcao = unique[0] || null;
  if (!codigoIcao) return { codigoIcao: null, nome: sourceName };

  let nome = sourceName
    .replace(new RegExp(`\s*\(${codigoIcao}\)`, 'ig'), ' ')
    .replace(new RegExp(`\s*[-–—]?\s*${codigoIcao}(?![A-Z0-9])`, 'ig'), ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/[(]\s*[)]/g, '')
    .replace(/\s*[-–—]\s*$/g, '')
    .trim();
  return { codigoIcao, nome };
}

function inferType(code, name, codigoIcao) {
  const hay = fold(`${code} ${name}`);
  if (codigoIcao?.startsWith('9P')) return 'plataforma';
  if (/\b(HELIPONTO|HELIPORTO|HELPN)\b/.test(hay)) return 'heliponto';
  if (/\b(PLATAFORMA|PLTAFORMA)\b/.test(hay)) return 'plataforma';
  if (/\b(FPSO|FSO|NAVIO|PLSV|DRILLSHIP|RAMFORM|RANFORM|NORMAND|SAPURA|VALARIS|DEEPWATER|AKOFS|SKANDI|SANCO|PHOENIX|AKER|OOS|UMS|USS)\b/.test(hay) || /CANAL MARITIMO/.test(hay)) return 'embarcacao';
  if (/\b(PONTO DE NOTIFICACAO|PONTOS DE NOTIFICACAO|FIXO|AEROVIA|SOBREVOO|PONTO AUXILIAR|PORTAO)\b/.test(hay)) return 'waypoint';
  if (/^S[A-Z0-9]{3}$/.test(fold(code)) || /\b(AEROPORTO|AEROCLUBE|BASE AEREA)\b/.test(hay)) return 'aeroporto';
  if (/\b(BASE|CLAREIRA|LOCACAO|ERP)\b/.test(hay)) return 'base';
  if (/\b(PETROBRAS|SONDA|RIG|AKOFS|ARTEMIS|OCEAN|SEVEN|WEST)\b/.test(hay) || /^P-?\d+/.test(fold(code))) return 'plataforma';
  return 'waypoint';
}

function compatibilityType(type) {
  if (type === 'aeroporto') return 'aeroporto';
  if (type === 'heliponto') return 'heliponto';
  if (type === 'plataforma' || type === 'embarcacao') return 'plataforma';
  return null;
}
function parsePdf() {
  const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const records = [];
  for (const [pageIndex, page] of text.split('\f').entries()) {
    const pageRecords = [];
    const lines = page.split(/\r?\n/);
    for (const line of lines) {
      const match = coordinateRe.exec(line);
      if (!match?.groups) {
        const continuation = line.trim();
        if (pageRecords.length && /^\s{20,}\S/.test(line) && continuation && !/^(Printed |Flight Preview|Waypoints List|Fliltro:)/.test(continuation)) {
          pageRecords.at(-1).nome = `${pageRecords.at(-1).nome} ${continuation}`.trim();
        }
        continue;
      }
      const prefix = line.slice(0, match.index).trim().replace(/^\f/, '');
      const parts = prefix.split(/\s{2,}/, 2);
      if (parts.length < 2) throw new Error(`Cannot split code/name on page ${pageIndex + 1}: ${line}`);
      const g = match.groups;
      const latDms = `${g.latd}º${g.latm}'${g.lats}''${g.lathem}`;
      const lonDms = `${g.lond}º${g.lonm}'${g.lons}''${g.lonhem}`;
      pageRecords.push({ page: pageIndex + 1, codigo: parts[0].trim(), nome: parts[1].trim(), elevacao_ft: g.elev ? Number(g.elev) : null,
        latitude_dms: latDms, longitude_dms: lonDms, latitude_decimal: dmsToDecimal(g.latd, g.latm, g.lats, g.lathem),
        longitude_decimal: dmsToDecimal(g.lond, g.lonm, g.lons, g.lonhem), declinacao_magnetica_graus: Number(g.mag), declinacao_magnetica_direcao: g.maghem });
    }
    records.push(...pageRecords);
  }
  return records;
}
function enrich(records) {
  const seen = new Set();
  return records.map((record) => {
    const codigo = record.codigo.toUpperCase();
    if (seen.has(codigo)) throw new Error(`Duplicate source code: ${codigo}`);
    seen.add(codigo);
    const extracted = extractIcaoCodeAndCleanName(codigo, record.nome);
    const tipo = inferType(codigo, extracted.nome, extracted.codigoIcao);
    const compat = compatibilityType(tipo);
    const coordenadaValida = !(record.latitude_decimal === 0 && record.longitude_decimal === 0);
    const permiteOrigemDestino = Boolean(compat && coordenadaValida);
    const revisaoPendente = !coordenadaValida || record.elevacao_ft == null;
    const codigoIcao = extracted.codigoIcao || (/^(S[A-Z0-9]{3})$/.test(fold(codigo)) && ['aeroporto', 'heliponto'].includes(tipo) ? fold(codigo) : null);
    return { ...record, nome: extracted.nome, codigo, codigo_icao: codigoIcao, tipo, tipo_compatibilidade: compat,
      coordenada_valida: coordenadaValida ? 1 : 0, permite_origem_destino: permiteOrigemDestino ? 1 : 0,
      revisao_pendente: revisaoPendente ? 1 : 0, classificacao_origem: 'INFERIDA_DESCRICAO' };
  });
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sqlText(value) {
  return value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}
function writeCsv(records) {
  const columns = ['codigo','nome','tipo','tipo_compatibilidade','codigo_icao','latitude_dms','longitude_dms','latitude_decimal','longitude_decimal','elevacao_ft','declinacao_magnetica_graus','declinacao_magnetica_direcao','coordenada_valida','permite_origem_destino','revisao_pendente','classificacao_origem','fonte_pagina'];
  const lines = [columns.join(',')];
  for (const r of records) {
    const row = { ...r, fonte_pagina: r.page };
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  mkdirSync(dirname(csvPath), { recursive: true });
  writeFileSync(csvPath, `${lines.join('\n')}\n`, 'utf8');
}

function schemaPreamble() {
  return `-- 0500 Controle de Voos: canonical navigation points imported from Flight Preview PDF.
-- Source-derived fields are preserved; tipo/classification is explicitly inferred from code/description.
CREATE TABLE IF NOT EXISTS cv_pontos_navegacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL, codigo_icao TEXT,
  nome TEXT NOT NULL, tipo TEXT NOT NULL, latitude_dms TEXT, longitude_dms TEXT, latitude_decimal REAL, longitude_decimal REAL,
  elevacao_ft INTEGER, declinacao_magnetica_graus INTEGER, declinacao_magnetica_direcao TEXT,
  coordenada_valida INTEGER NOT NULL DEFAULT 1, permite_origem_destino INTEGER NOT NULL DEFAULT 0,
  revisao_pendente INTEGER NOT NULL DEFAULT 0, classificacao_origem TEXT NOT NULL DEFAULT 'MANUAL', fonte TEXT, fonte_referencia TEXT,
  fonte_pagina INTEGER, ativo INTEGER NOT NULL DEFAULT 1, created_by INTEGER, updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT,
  CHECK (tipo IN ('aeroporto','heliponto','plataforma','embarcacao','waypoint','base','outro')),
  CHECK (coordenada_valida IN (0,1)), CHECK (permite_origem_destino IN (0,1)), CHECK (revisao_pendente IN (0,1)), CHECK (ativo IN (0,1)),
  CHECK (declinacao_magnetica_direcao IS NULL OR declinacao_magnetica_direcao IN ('E','W')),
  CHECK (classificacao_origem IN ('MANUAL','INFERIDA_DESCRICAO','FONTE_EXPLICITA'))
);`;
}
function schemaSupportSql() {
  return `
CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_pontos_navegacao_empresa_codigo ON cv_pontos_navegacao (empresa_id, codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_pontos_navegacao_empresa_icao ON cv_pontos_navegacao (empresa_id, codigo_icao) WHERE deleted_at IS NULL AND codigo_icao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cv_pontos_navegacao_empresa_tipo_ativo ON cv_pontos_navegacao (empresa_id, tipo, ativo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_pontos_navegacao_empresa_uso_ativo ON cv_pontos_navegacao (empresa_id, permite_origem_destino, ativo) WHERE deleted_at IS NULL;
ALTER TABLE cv_aeroportos ADD COLUMN ponto_navegacao_id INTEGER REFERENCES cv_pontos_navegacao(id);
ALTER TABLE cv_aeroportos ADD COLUMN latitude_decimal REAL;
ALTER TABLE cv_aeroportos ADD COLUMN longitude_decimal REAL;
ALTER TABLE cv_aeroportos ADD COLUMN elevacao_ft INTEGER;
ALTER TABLE cv_aeroportos ADD COLUMN coordenada_valida INTEGER NOT NULL DEFAULT 0 CHECK (coordenada_valida IN (0,1));
ALTER TABLE cv_aeroportos ADD COLUMN revisao_pendente INTEGER NOT NULL DEFAULT 0 CHECK (revisao_pendente IN (0,1));
ALTER TABLE cv_aeroportos ADD COLUMN fonte_referencia TEXT;
CREATE INDEX IF NOT EXISTS idx_cv_aeroportos_ponto_navegacao ON cv_aeroportos (empresa_id, ponto_navegacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_aeroportos_empresa_icao_0500 ON cv_aeroportos (empresa_id, codigo_icao) WHERE deleted_at IS NULL AND codigo_icao IS NOT NULL;
`;
}

function pointValue(r) {
  return `(6,${sqlText(r.codigo)},${sqlText(r.codigo_icao)},${sqlText(r.nome)},${sqlText(r.tipo)},${sqlText(r.latitude_dms)},${sqlText(r.longitude_dms)},${r.latitude_decimal.toFixed(8)},${r.longitude_decimal.toFixed(8)},${r.elevacao_ft ?? 'NULL'},${r.declinacao_magnetica_graus},${sqlText(r.declinacao_magnetica_direcao)},${r.coordenada_valida},${r.permite_origem_destino},${r.revisao_pendente},${sqlText(r.classificacao_origem)},${sqlText(SOURCE)},${sqlText(SOURCE_REF)},${r.page},1)`;
}
function writeSql(records) {
  const parts = [schemaPreamble(), schemaSupportSql()];
  const columns = `(empresa_id,codigo,codigo_icao,nome,tipo,latitude_dms,longitude_dms,latitude_decimal,longitude_decimal,elevacao_ft,declinacao_magnetica_graus,declinacao_magnetica_direcao,coordenada_valida,permite_origem_destino,revisao_pendente,classificacao_origem,fonte,fonte_referencia,fonte_pagina,ativo)`;
  for (let start = 0; start < records.length; start += 150) {
    const batch = records.slice(start, start + 150);
    parts.push(`INSERT INTO cv_pontos_navegacao ${columns} VALUES\n${batch.map(pointValue).join(',\n')};`);
  }
  parts.push(`INSERT INTO cv_aeroportos
    (empresa_id,codigo,codigo_icao,nome,tipo,descricao,ativo,ordem,ponto_navegacao_id,latitude_decimal,longitude_decimal,elevacao_ft,coordenada_valida,revisao_pendente,fonte_referencia,created_at,updated_at)
SELECT p.empresa_id,p.codigo,p.codigo_icao,p.nome,
       CASE WHEN p.tipo='aeroporto' THEN 'aeroporto' WHEN p.tipo='heliponto' THEN 'heliponto' ELSE 'plataforma' END,
       'Sincronizado do cadastro canônico de pontos de navegação',1,0,p.id,p.latitude_decimal,p.longitude_decimal,p.elevacao_ft,p.coordenada_valida,p.revisao_pendente,p.fonte_referencia,datetime('now'),datetime('now')
FROM cv_pontos_navegacao p
WHERE p.empresa_id=6 AND p.fonte=${sqlText(SOURCE)} AND p.permite_origem_destino=1 AND p.deleted_at IS NULL
ON CONFLICT(empresa_id,codigo) WHERE deleted_at IS NULL DO UPDATE SET
  codigo_icao=COALESCE(excluded.codigo_icao,cv_aeroportos.codigo_icao), nome=excluded.nome, tipo=excluded.tipo, ativo=1,
  ponto_navegacao_id=excluded.ponto_navegacao_id, latitude_decimal=excluded.latitude_decimal, longitude_decimal=excluded.longitude_decimal,
  elevacao_ft=excluded.elevacao_ft, coordenada_valida=excluded.coordenada_valida, revisao_pendente=excluded.revisao_pendente,
  fonte_referencia=excluded.fonte_referencia, updated_at=datetime('now');`);
  const invalidCoords = records.filter((r) => !r.coordenada_valida).length;
  const missingElevation = records.filter((r) => r.elevacao_ft == null).length;
  const compatible = records.filter((r) => r.permite_origem_destino).length;
  const icao9p = records.filter((r) => r.codigo_icao?.startsWith('9P')).length;
  parts.push(`CREATE TABLE IF NOT EXISTS _0500_nav_post_guard (id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TRIGGER _0500_nav_post_validate BEFORE INSERT ON _0500_nav_post_guard BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte=${sqlText(SOURCE)} AND deleted_at IS NULL) <> ${records.length} THEN RAISE(ABORT,'0500 post: source row count mismatch') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte=${sqlText(SOURCE)} AND coordenada_valida=0 AND deleted_at IS NULL) <> ${invalidCoords} THEN RAISE(ABORT,'0500 post: invalid coordinate count mismatch') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte=${sqlText(SOURCE)} AND elevacao_ft IS NULL AND deleted_at IS NULL) <> ${missingElevation} THEN RAISE(ABORT,'0500 post: missing elevation count mismatch') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM cv_aeroportos WHERE empresa_id=6 AND ponto_navegacao_id IS NOT NULL AND deleted_at IS NULL) < ${compatible} THEN RAISE(ABORT,'0500 post: compatibility catalog incomplete') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM cv_pontos_navegacao WHERE empresa_id=6 AND codigo_icao LIKE '9P%' AND deleted_at IS NULL) <> ${icao9p} THEN RAISE(ABORT,'0500 post: 9P ICAO count mismatch') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM cv_pontos_navegacao WHERE empresa_id=6 AND codigo_icao LIKE '9P%' AND tipo <> 'plataforma' AND deleted_at IS NULL) THEN RAISE(ABORT,'0500 post: 9P ICAO must be platform') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM cv_pontos_navegacao WHERE empresa_id=6 AND codigo_icao LIKE '9P%' AND instr(UPPER(nome), UPPER(codigo_icao)) > 0 AND deleted_at IS NULL) THEN RAISE(ABORT,'0500 post: ICAO leaked into name') END;
END;
INSERT INTO _0500_nav_post_guard(id) VALUES(1);
DROP TRIGGER _0500_nav_post_validate;
DROP TABLE _0500_nav_post_guard;`);
  mkdirSync(dirname(sqlPath), { recursive: true });
  writeFileSync(sqlPath, `${parts.join('\n\n')}\n`, 'utf8');
  return { invalidCoords, missingElevation, compatible };
}
const records = enrich(parsePdf());
if (records.length !== 3714) throw new Error(`Expected 3714 records, got ${records.length}`);
writeCsv(records);
const stats = writeSql(records);
const byType = Object.fromEntries([...new Set(records.map((r) => r.tipo))].sort().map((type) => [type, records.filter((r) => r.tipo === type).length]));
const digest = createHash('sha256').update(records.map((r) => `${r.codigo}|${r.latitude_dms}|${r.longitude_dms}|${r.elevacao_ft ?? ''}`).join('\n')).digest('hex');
console.log(JSON.stringify({ total: records.length, ...stats, byType, sourceDigest: digest, csvPath, sqlPath }, null, 2));
