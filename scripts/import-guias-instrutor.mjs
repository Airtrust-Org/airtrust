#!/usr/bin/env node
/**
 * source_reference: docs/ops/simuladores-matriz-aw139-s76-import.md
 * operational_decision: Backfill dos assets HTML dos guias de simulador (inlining logo empresa em data:URI)
 * dry_run_required: Executar com --dry-run antes de aplicar em produção
 * rollback_plan_required: Manifesto de backup gerado em backups_production/ em caso de necessidade de restauração
 *
 * Importador Canônico e Script de Backfill dos Assets dos Guias de Instrutor.
 *
 * Funcionalidades:
 *  - Suporta modo --dry-run (padrão se --backfill-html-only não for passado)
 *  - Suporta modo --backfill-html-only (reprocessa e atualiza os 51 HTMLs em R2 e D1)
 *  - Valida correspondência exata de 51 guias (30 AW139 e 21 SK76 / S-76)
 *  - Gera manifesto de backup com SHA256 anterior, novo SHA256, chave R2 e tamanho
 *  - Garante sanitização rigorosa com inlining da logo em data:URI e bloqueio de URLs externas/relativas/file://
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { sanitizeGuiaHtml } from '../worker-airtrust/src/lib/guias-instrutor/html-sanitizer.ts';

function classifyAw139(filename) {
  if (/Inicial_Sessao_(\d+)_de_(\d+)/i.test(filename)) {
    const [, n, total] = filename.match(/Inicial_Sessao_(\d+)_de_(\d+)/i);
    return { programa: 'INICIAL', ciclo: null, sessao_numero: Number(n) };
  }
  const periodico = filename.match(/Periodico_Ciclo_(\d+)_Sessao_(\d+)_de_(\d+)/i);
  if (periodico) {
    const [, ciclo, n] = periodico;
    return { programa: 'PERIODICO', ciclo: Number(ciclo), sessao_numero: Number(n) };
  }
  const semestral = filename.match(/Semestral_Ciclo_(\d+)_Sessao_(\d+)_de_(\d+)/i);
  if (semestral) {
    const [, ciclo, n] = semestral;
    return { programa: 'SEMESTRAL', ciclo: Number(ciclo), sessao_numero: Number(n) };
  }
  return null;
}

function classifySk76(filename) {
  if (/SK76-I-(\d+)-12/i.test(filename)) {
    const [, n] = filename.match(/SK76-I-(\d+)-12/i);
    return { programa: 'INICIAL', ciclo: null, sessao_numero: Number(n) };
  }
  const periodico = filename.match(/S76-P-(\d+)-04-C(\d+)/i) || filename.match(/SK76-P-(\d+)-04-C(\d+)/i);
  if (periodico) {
    const [, n, ciclo] = periodico;
    return { programa: 'PERIODICO', ciclo: Number(ciclo), sessao_numero: Number(n) };
  }
  if (/SK76-P-CHECK/i.test(filename)) {
    return { programa: 'CHECK', ciclo: null, sessao_numero: null };
  }
  const semestral = filename.match(/SK76-S-(\d+)-02/i);
  if (semestral) {
    const [, n] = semestral;
    return { programa: 'SEMESTRAL', ciclo: null, sessao_numero: Number(n) };
  }
  return null;
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    backfill: false,
    aw139: './AW139.zip',
    sk76: './SK76.zip',
    out: './backups_production'
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--backfill-html-only' || a === '--execute') {
      args.backfill = true;
      args.dryRun = false;
    } else if (a === '--dry-run') {
      args.dryRun = true;
      args.backfill = false;
    } else if (a === '--aw139' && argv[i + 1]) {
      args.aw139 = argv[++i];
    } else if (a === '--sk76' && argv[i + 1]) {
      args.sk76 = argv[++i];
    } else if (a === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    }
  }
  return args;
}

function executeD1Query(query) {
  const cmd = `cd worker-airtrust && npx wrangler d1 execute airtrust-db --remote --env production --json --command "${query.replace(/"/g, '\\"')}"`;
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  const parsed = JSON.parse(output);
  return parsed[0]?.results || [];
}

function uploadR2Object(r2Key, filePath) {
  const cmd = `cd worker-airtrust && npx wrangler r2 object put "airtrust-assets/${r2Key}" --file "${filePath}" --remote`;
  execSync(cmd, { stdio: 'pipe' });
}

function buildKey(frota, programa, ciclo, sessao_numero) {
  return `${frota}:${programa}:${ciclo ?? 'null'}:${sessao_numero ?? 'null'}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`=== IMPORTADOR E BACKFILL DE GUIAS ===`);
  console.log(`Modo: ${options.backfill ? 'EXECUÇÃO (BACKFILL PROD)' : 'DRY-RUN (VALIDAÇÃO)'}`);
  console.log(`AW139 Zip: ${options.aw139}`);
  console.log(`SK76 Zip: ${options.sk76}`);

  if (!fs.existsSync(options.aw139) || !fs.existsSync(options.sk76)) {
    throw new Error(`Pacotes de origem zip não encontrados: ${options.aw139} ou ${options.sk76}`);
  }

  // 1. Obter os guias de produção via D1
  console.log('\n[1/5] Consultado guias ativos no D1 produção...');
  const query = `SELECT id, codigo, programa, ciclo, sessao_numero, html_r2_key, html_sha256, html_tamanho_bytes FROM simuladores_guias_instrutor WHERE status = 'ATIVO' AND html_r2_key IS NOT NULL ORDER BY id`;
  const d1Guias = executeD1Query(query);

  console.log(`Total de guias ativos no D1: ${d1Guias.length}`);
  if (d1Guias.length !== 51) {
    throw new Error(`ERRO DE VALIDAÇÃO: Esperado exatamente 51 guias no banco, encontrado ${d1Guias.length}`);
  }

  const d1PorChave = new Map();
  for (const g of d1Guias) {
    const frota = g.html_r2_key.includes('/AW139/') ? 'AW139' : 'SK76';
    const key = buildKey(frota, g.programa, g.ciclo, g.sessao_numero);
    if (d1PorChave.has(key)) {
      throw new Error(`ERRO DE VALIDAÇÃO: Chave duplicada no D1: ${key}`);
    }
    d1PorChave.set(key, { ...g, frota });
  }

  const countAW139 = Array.from(d1PorChave.values()).filter(g => g.frota === 'AW139').length;
  const countSK76 = Array.from(d1PorChave.values()).filter(g => g.frota === 'SK76').length;
  console.log(`- AW139 no D1: ${countAW139}`);
  console.log(`- SK76 / S-76 no D1: ${countSK76}`);

  // 2. Extração dos ZIPs
  const tmpDir = path.resolve('./tmp_guias_backfill');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log('\n[2/5] Extraindo pacotes de guias...');
  execSync(`unzip -o -q "${options.aw139}" -d "${path.join(tmpDir, 'AW139')}"`);
  execSync(`unzip -o -q "${options.sk76}" -d "${path.join(tmpDir, 'SK76')}"`);

  // Carregar logos
  const awLogoPath = path.join(tmpDir, 'AW139', 'AW139', 'assets', 'logo_costa_do_sol.png');
  const skLogoPath = path.join(tmpDir, 'SK76', 'SK76', 'assets', 'logo_costa_do_sol.png');

  const awAssets = {};
  if (fs.existsSync(awLogoPath)) {
    awAssets['logo_costa_do_sol.png'] = {
      bytes: new Uint8Array(fs.readFileSync(awLogoPath)),
      mimeType: 'image/png'
    };
  } else {
    throw new Error(`Logo do AW139 não encontrado em ${awLogoPath}`);
  }

  const skAssets = {};
  if (fs.existsSync(skLogoPath)) {
    skAssets['logo_costa_do_sol.png'] = {
      bytes: new Uint8Array(fs.readFileSync(skLogoPath)),
      mimeType: 'image/png'
    };
  } else {
    throw new Error(`Logo do SK76 não encontrado em ${skLogoPath}`);
  }

  // 3. Processar e sanitizar HTMLs
  console.log('\n[3/5] Processando e sanitizando os 51 HTMLs...');
  const reprocessed = [];
  const chavesProcessadas = new Set();

  for (const frota of ['AW139', 'SK76']) {
    const htmlDir = path.join(tmpDir, frota, frota, 'html');
    if (!fs.existsSync(htmlDir)) {
      throw new Error(`Diretório html/ não encontrado para ${frota} em ${htmlDir}`);
    }

    const files = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html') && !f.startsWith('.'));
    const frotaAssets = frota === 'AW139' ? awAssets : skAssets;
    const classifier = frota === 'AW139' ? classifyAw139 : classifySk76;

    for (const file of files) {
      const filePath = path.join(htmlDir, file);
      const rawHtml = fs.readFileSync(filePath, 'utf-8');
      const classification = classifier(file);

      if (!classification) {
        throw new Error(`ERRO DE PARSING: Não foi possível classificar o arquivo ${file}`);
      }

      const key = buildKey(frota, classification.programa, classification.ciclo, classification.sessao_numero);
      const d1Guia = d1PorChave.get(key);

      if (!d1Guia) {
        throw new Error(`ERRO DE CORRESPONDÊNCIA: Chave ${key} (${file}) não encontrada no D1`);
      }

      if (chavesProcessadas.has(key)) {
        throw new Error(`ERRO DE DUPLICIDADE: Chave ${key} processada mais de uma vez (${file})`);
      }
      chavesProcessadas.add(key);

      // Sanitizar com os assets
      const result = sanitizeGuiaHtml(rawHtml, frotaAssets);

      // Validações estritas de integridade do HTML gerado
      if (!result.aprovado) {
        throw new Error(`ERRO DE SANITIZAÇÃO: HTML de ${d1Guia.codigo} (${file}) não aprovado. Alertas: ${result.alertas.join(', ')}`);
      }
      if (!result.html.includes('data:image/png;base64,')) {
        throw new Error(`ERRO DE LOGO: HTML de ${d1Guia.codigo} (${file}) não contém a logo em data URI!`);
      }
      if (/(src|href)\s*=\s*["']\.\.\//i.test(result.html)) {
        throw new Error(`ERRO SEGURANÇA: HTML de ${d1Guia.codigo} (${file}) contém src/href relativo remanescente!`);
      }
      if (/file:\/\//i.test(result.html) || /localhost|127\.0\.0\.1/i.test(result.html)) {
        throw new Error(`ERRO SEGURANÇA: HTML de ${d1Guia.codigo} (${file}) contém referência a file:// ou localhost!`);
      }
      if (/(src|href)\s*=\s*["']https?:\/\//i.test(result.html)) {
        throw new Error(`ERRO SEGURANÇA: HTML de ${d1Guia.codigo} (${file}) contém URL externa!`);
      }

      const newBuffer = Buffer.from(result.html, 'utf-8');
      const newSha256 = crypto.createHash('sha256').update(newBuffer).digest('hex');
      const newSizeBytes = newBuffer.length;

      reprocessed.push({
        id: d1Guia.id,
        codigo: d1Guia.codigo,
        aeronave_nome: frota === 'AW139' ? 'AW139' : 'S-76',
        r2Key: d1Guia.html_r2_key,
        oldSha256: d1Guia.html_sha256,
        oldSizeBytes: d1Guia.html_tamanho_bytes,
        newSha256,
        newSizeBytes,
        htmlContent: result.html
      });
    }
  }

  console.log(`Total de guias reprocessados com sucesso: ${reprocessed.length}`);

  if (reprocessed.length !== 51) {
    throw new Error(`ERRO DE CONTAGEM: Reprocessados ${reprocessed.length} guias, esperado exatamente 51!`);
  }

  // 4. Salvar manifesto de backup
  console.log('\n[4/5] Gerando manifesto de auditoria e backup...');
  if (!fs.existsSync(options.out)) fs.mkdirSync(options.out, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = path.join(options.out, `backfill_manifest_${timestamp}.json`);

  const manifestData = {
    executado_em: new Date().toISOString(),
    modo: options.backfill ? 'EXECUCAO' : 'DRY_RUN',
    total_guias: reprocessed.length,
    guias: reprocessed.map(g => ({
      id: g.id,
      codigo: g.codigo,
      aeronave: g.aeronave_nome,
      r2_key: g.r2Key,
      sha256_anterior: g.oldSha256,
      sha256_novo: g.newSha256,
      tamanho_anterior_bytes: g.oldSizeBytes,
      tamanho_novo_bytes: g.newSizeBytes
    }))
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
  console.log(`Manifesto registrado em: ${manifestPath}`);

  // 5. Execução do Backfill no R2 e D1 se solicitado
  if (options.backfill) {
    console.log('\n[5/5] EXECUTANDO BACKFILL EM PRODUÇÃO (R2 + D1)...');
    let count = 0;
    for (const item of reprocessed) {
      count++;
      console.log(`[${count}/51] Atualizando R2/D1 para ${item.codigo} (ID: ${item.id})...`);
      
      const tmpFile = path.join(tmpDir, `upload_${item.id}.html`);
      fs.writeFileSync(tmpFile, item.htmlContent, 'utf-8');

      // Upload para R2
      uploadR2Object(item.r2Key, tmpFile);

      // Atualizar D1
      const updateSql = `UPDATE simuladores_guias_instrutor SET html_sha256 = '${item.newSha256}', html_tamanho_bytes = ${item.newSizeBytes} WHERE id = ${item.id}`;
      executeD1Query(updateSql);
    }
    console.log(`\n✅ BACKFILL EM PRODUÇÃO CONCLUÍDO COM SUCESSO! 51/51 GUIAS ATUALIZADOS.`);
  } else {
    console.log('\n[5/5] DRY-RUN FINALIZADO COM SUCESSO. Nenhuma alteração foi feita em produção.');
    console.log('Para aplicar o backfill em produção, execute com a flag --backfill-html-only.');
  }

  // Limpeza
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return {
    reprocessed,
    manifestPath
  };
}

main().catch((err) => {
  console.error('\n❌ FALHA NO IMPORTADOR/BACKFILL:', err);
  process.exit(1);
});
