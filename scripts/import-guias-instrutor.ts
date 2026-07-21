import * as fs from 'node:fs';
import { sanitizeGuiaHtml } from '../worker-airtrust/src/lib/guias-instrutor/html-sanitizer';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
function extractCodeFromHtml(rawHtml: string) {
  const sectionMatch = rawHtml.match(/<section[^>]*>[\s\S]*?<\/section>/i);
  const text = sectionMatch
    ? sectionMatch[0].replace(/<[^>]+>/g, ' | ').replace(/\s+/g, ' ').trim()
    : '';

  let codigo = null;
  const modeloInline = text.match(/Modelo:\s*([A-Z0-9./-]+)/i);
  if (modeloInline) {
    codigo = modeloInline[1];
  } else {
    const modeloTable = text.match(/\bModelo\b\s*(?:\|\s*)+([A-Z0-9][A-Z0-9./-]*)/i);
    if (modeloTable) codigo = modeloTable[1];
  }
  return codigo;
}

async function main() {
  console.log('Extraindo arquivos...');
  execSync('unzip -o -q AW139.zip -d tmp_guias', { stdio: 'inherit' });
  execSync('unzip -o -q SK76.zip -d tmp_guias', { stdio: 'inherit' });

  // 1. Obter todos os guias ativos do D1
  console.log('Buscando guias no D1...');
  const query = `SELECT id, codigo, html_r2_key FROM simuladores_guias_instrutor WHERE html_r2_key IS NOT NULL AND status = 'ATIVO'`;
  const d1Output = execSync(`npx wrangler d1 execute airtrust-db --remote --json --command "${query}"`, { encoding: 'utf-8' });
  
  // O output do wrangler geralmente é um array de resultados (vários statements). Pegamos o primeiro.
  const d1Results = JSON.parse(d1Output)[0].results;
  console.log(`Encontrados ${d1Results.length} guias com HTML no banco.`);

  const guiasNoBancoPorCodigo = new Map();
  for (const guia of d1Results) {
    guiasNoBancoPorCodigo.set(guia.codigo, guia);
  }

  // 2. Mapear os assets (logo da empresa)
  const assetsDirAw = path.join('tmp_guias', 'AW139', 'assets');
  const assetsDirSk = path.join('tmp_guias', 'SK76', 'assets');
  
  const logoAwPath = path.join(assetsDirAw, 'logo_costa_do_sol.png');
  const logoSkPath = path.join(assetsDirSk, 'logo_costa_do_sol.png');

  const awAssets = {};
  if (fs.existsSync(logoAwPath)) {
    awAssets['logo_costa_do_sol.png'] = {
      bytes: new Uint8Array(fs.readFileSync(logoAwPath)),
      mimeType: 'image/png'
    };
  }

  const skAssets = {};
  if (fs.existsSync(logoSkPath)) {
    skAssets['logo_costa_do_sol.png'] = {
      bytes: new Uint8Array(fs.readFileSync(logoSkPath)),
      mimeType: 'image/png'
    };
  }

  // 3. Processar cada arquivo HTML extraído
  for (const frota of ['AW139', 'SK76']) {
    const htmlDir = path.join('tmp_guias', frota, 'html');
    if (!fs.existsSync(htmlDir)) continue;

    const files = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html') && !f.startsWith('.'));
    const frotaAssets = frota === 'AW139' ? awAssets : skAssets;

    for (const file of files) {
      const filePath = path.join(htmlDir, file);
      const rawHtml = fs.readFileSync(filePath, 'utf-8');
      
      const codigo = extractCodeFromHtml(rawHtml);
      if (!codigo) {
        console.warn(`Código não encontrado no HTML: ${file}`);
        continue;
      }

      const guiaNoBanco = guiasNoBancoPorCodigo.get(codigo);
      if (!guiaNoBanco) {
        // Pode ser um guia que não foi publicado, ignorar.
        continue;
      }

      console.log(`Processando [${codigo}] ${file}...`);

      // Sanitizar PASSANDO OS ASSETS
      const { html: htmlSanitizado, aprovado } = sanitizeGuiaHtml(rawHtml, frotaAssets);

      if (!aprovado) {
        console.warn(`HTML não foi aprovado na sanitização: ${file}`);
        continue;
      }

      // Salvar em arquivo temporário para upload
      const tmpFile = path.join('tmp_guias', `upload_${codigo}.html`);
      fs.writeFileSync(tmpFile, htmlSanitizado);

      // Fazer upload para R2 usando wrangler
      const r2Key = guiaNoBanco.html_r2_key;
      console.log(`Fazendo upload para R2: ${r2Key}...`);
      execSync(`npx wrangler r2 object put "airtrust-assets/${r2Key}" --file "${tmpFile}"`, { stdio: 'inherit' });
    }
  }

  console.log('Limpando diretório temporário...');
  fs.rmSync('tmp_guias', { recursive: true, force: true });
  console.log('Concluído!');
}

main().catch(console.error);
