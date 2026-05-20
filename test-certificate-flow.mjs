#!/usr/bin/env node
/**
 * Teste de Certificado PDF
 * Gera um certificado e valida se está corrompido
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.JWT_TOKEN || 'test-token';

// ID de exemplo - ajuste conforme necessário
const HISTORICO_ID = process.env.HISTORICO_ID || '1';

async function testCertificateGeneration() {
  try {
    console.log('🧪 Iniciando teste de geração e validação de certificado...\n');

    // 1. Gerar certificado
    console.log(`📄 [STEP 1] Gerando certificado para historico_id=${HISTORICO_ID}...`);
    const generateRes = await fetch(
      `${API_URL}/api/qualificacoes/historico/${HISTORICO_ID}/certificados/gerar`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!generateRes.ok) {
      const errorData = await generateRes.json().catch(() => ({}));
      throw new Error(
        `❌ Falha ao gerar certificado: ${generateRes.status} - ${JSON.stringify(errorData)}`,
      );
    }

    const generateData = await generateRes.json();
    console.log('✅ Certificado gerado com sucesso');
    console.log(`   ID: ${generateData.data.id}`);
    console.log(`   R2 Key: ${generateData.data.r2_key}`);
    console.log(`   Tamanho: ${generateData.data.tamanho} bytes\n`);

    const certificadoId = generateData.data.id;

    // 2. Fazer download
    console.log(`📥 [STEP 2] Fazendo download do certificado (ID=${certificadoId})...`);
    const downloadRes = await fetch(`${API_URL}/api/certificados/stream/${certificadoId}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    });

    if (!downloadRes.ok) {
      const errorData = await downloadRes.json().catch(() => ({}));
      throw new Error(
        `❌ Falha ao fazer download: ${downloadRes.status} - ${JSON.stringify(errorData)}`,
      );
    }

    const pdfBuffer = await downloadRes.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfBuffer);

    console.log(`✅ PDF baixado com sucesso`);
    console.log(`   Tamanho: ${pdfBytes.length} bytes\n`);

    // 3. Validar magic bytes
    console.log('🔍 [STEP 3] Validando integridade do PDF...');
    const magicBytes = new Uint8Array(pdfBytes.slice(0, 4));
    const magicStr = String.fromCharCode(...Array.from(magicBytes));

    console.log(`   Magic bytes: "${magicStr}"`);
    console.log(`   Esperado: "%PDF"`);

    if (!magicStr.startsWith('%PDF')) {
      throw new Error(
        `❌ ERRO CRÍTICO: PDF corrupted! Magic bytes são "${magicStr}" em vez de "%PDF"`,
      );
    }

    console.log('✅ Magic bytes válidos - PDF não está corrompido\n');

    // 4. Salvar arquivo local para inspeção manual
    const fs = await import('fs');
    const filePath = '/tmp/test-certificado.pdf';
    fs.writeFileSync(filePath, pdfBytes);
    console.log(`💾 Arquivo salvo em: ${filePath}`);
    console.log(`   Use: file ${filePath}`);
    console.log(`   Use: pdfinfo ${filePath}`);
    console.log(`   Use: open ${filePath}\n`);

    console.log('✅ ✅ ✅ TESTE COMPLETO COM SUCESSO! ✅ ✅ ✅\n');
    console.log('O certificado foi gerado, baixado e validado com sucesso.');
    console.log('O PDF está íntegro e pronto para uso.');
  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testCertificateGeneration();
