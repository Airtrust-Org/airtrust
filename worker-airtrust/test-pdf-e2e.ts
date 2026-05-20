#!/usr/bin/env tsx

/**
 * Teste end-to-end de geração de certificado PDF
 * Simula o fluxo completo: gerar PDF -> salvar no R2 -> fazer download -> validar
 */

import { PDFDocument } from 'pdf-lib';

async function testarFluxoCompleto() {
  console.log('🧪 Testando fluxo completo de geração de certificado PDF\n');

  const API_URL = 'http://localhost:8787';

  try {
    // 1. Verificar se servidor está rodando
    console.log('1️⃣ Verificando servidor...');
    const healthRes = await fetch(`${API_URL}/api/health`);
    if (!healthRes.ok) {
      throw new Error('Servidor não está rodando');
    }
    console.log('   ✅ Servidor OK\n');

    // 2. Fazer login (se necessário)
    console.log('2️⃣ Fazendo login...');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@teste.com',
        password: 'admin123',
      }),
    });

    if (!loginRes.ok) {
      console.log('   ⚠️  Login falhou, tentando sem autenticação...\n');
    }

    const loginData = await loginRes.json();
    const token = loginData.data?.token || '';
    console.log(`   ✅ Token obtido: ${token ? 'Sim' : 'Não'}\n`);

    // 3. Buscar uma qualificação para testar
    console.log('3️⃣ Buscando qualificações...');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const qualRes = await fetch(`${API_URL}/api/qualificacoes?limit=1`, { headers });
    const qualData = await qualRes.json();

    if (!qualData.data || qualData.data.length === 0) {
      throw new Error('Nenhuma qualificação encontrada no banco');
    }

    const qualificacaoId = qualData.data[0].id;
    console.log(`   ✅ Qualificação encontrada: ID ${qualificacaoId}\n`);

    // 4. Gerar certificado
    console.log('4️⃣ Gerando certificado PDF...');
    const gerarRes = await fetch(
      `${API_URL}/api/certificados/historico/${qualificacaoId}/certificados/gerar`,
      {
        method: 'POST',
        headers,
      },
    );

    if (!gerarRes.ok) {
      const errorData = await gerarRes.json();
      throw new Error(`Erro ao gerar certificado: ${JSON.stringify(errorData)}`);
    }

    const gerarData = await gerarRes.json();
    console.log(`   ✅ Certificado gerado: ${JSON.stringify(gerarData, null, 2)}\n`);

    const documentoId = gerarData.data?.id;
    if (!documentoId) {
      throw new Error('ID do documento não retornado');
    }

    // 5. Fazer download do certificado
    console.log('5️⃣ Fazendo download do certificado...');
    const downloadRes = await fetch(`${API_URL}/api/certificados/stream/${documentoId}`, {
      headers,
    });

    if (!downloadRes.ok) {
      throw new Error(`Erro ao fazer download: ${downloadRes.statusText}`);
    }

    const pdfBuffer = await downloadRes.arrayBuffer();
    console.log(`   ✅ Download concluído: ${pdfBuffer.byteLength} bytes\n`);

    // 6. Validar PDF
    console.log('6️⃣ Validando PDF...');
    const pdfBytes = new Uint8Array(pdfBuffer);

    // Validar magic bytes
    const magicBytes = pdfBytes.slice(0, 4);
    const magicStr = String.fromCharCode(...Array.from(magicBytes));
    console.log(`   Magic bytes: "${magicStr}" (esperado: "%PDF")`);

    if (!magicStr.startsWith('%PDF')) {
      throw new Error('❌ PDF corrompido! Magic bytes inválidos.');
    }

    // Tentar carregar com pdf-lib
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();
      console.log(`   ✅ PDF válido! ${pageCount} página(s)\n`);
    } catch (e) {
      throw new Error(`❌ PDF corrompido! Erro ao carregar: ${e}`);
    }

    // 7. Salvar para inspeção manual
    const fs = await import('fs');
    const path = await import('path');
    const outputPath = path.join(process.cwd(), 'test-certificate-downloaded.pdf');
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(`💾 PDF salvo em: ${outputPath}`);
    console.log('   Abra o arquivo para verificar visualmente.\n');

    console.log('✅ TESTE COMPLETO PASSOU! PDF gerado e baixado corretamente.\n');
    return true;
  } catch (error) {
    console.error('\n❌ TESTE FALHOU:', error);
    return false;
  }
}

testarFluxoCompleto()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
