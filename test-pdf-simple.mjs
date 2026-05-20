#!/usr/bin/env node
/**
 * Teste de Certificado PDF - Versão simplificada
 * Apenas valida um certificado existente
 */

const API_URL = process.env.API_URL || 'https://airtrust-api-production.airtrust.workers.dev';
const TOKEN =
  process.env.JWT_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIn0.test';

async function testPDFDownload(certificadoId = 1) {
  try {
    console.log(`\n🧪 Testando download de PDF (certificado_id=${certificadoId})...\n`);

    const url = `${API_URL}/api/certificados/stream/${certificadoId}`;
    console.log(`📥 Fazendo requisição para: ${url}`);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    });

    console.log(`📊 Status: ${res.status} ${res.statusText}`);
    console.log(`📄 Content-Type: ${res.headers.get('Content-Type')}`);
    console.log(`📏 Content-Length: ${res.headers.get('Content-Length')}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`\n❌ Erro: ${text}`);
      return;
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    console.log(`\n✅ Download completo: ${bytes.length} bytes`);

    // Validar magic bytes
    const magicBytes = bytes.slice(0, 4);
    const magicStr = String.fromCharCode(...Array.from(magicBytes));

    console.log(`\n🔍 Validação de integridade:`);
    console.log(`   Magic bytes: "${magicStr}"`);
    console.log(`   Esperado: "%PDF"`);

    if (!magicStr.startsWith('%PDF')) {
      console.error(`\n❌ ARQUIVO CORROMPIDO! Magic bytes inválidos.`);
      console.error(
        `   Recebido: ${magicStr
          .split('')
          .map((c) => c.charCodeAt(0).toString(16))
          .join(' ')}`,
      );
      process.exit(1);
    }

    console.log(`\n✅ ✅ ✅ PDF VÁLIDO! ✅ ✅ ✅\n`);

    // Salvar localmente
    const fs = await import('fs');
    const path = `/tmp/cert-${certificadoId}-test.pdf`;
    fs.writeFileSync(path, bytes);
    console.log(`💾 Salvo em: ${path}`);
    console.log(`   Use: file ${path}`);
    console.log(`   Use: open ${path}\n`);
  } catch (error) {
    console.error('\n❌ ERRO:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Aceitar ID via argumento ou variável de ambiente
const id = process.argv[2] || process.env.CERTIFICADO_ID || '1';
testPDFDownload(parseInt(id));
