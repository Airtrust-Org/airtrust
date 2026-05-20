#!/usr/bin/env node

/**
 * Script de teste para geração de certificado PDF
 * Testa a geração completa end-to-end
 */

import { gerarCertificadoPDF } from '../src/services/pdf-generator.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function testarGeracaoPDF() {
  console.log('🧪 Testando geração de PDF...\n');

  const dadosTeste = {
    funcionario_nome: 'João da Silva',
    funcionario_cpf: '12345678901',
    funcionario_codigo_anac: 'ANAC123',
    funcionario_matricula: 'MAT001',
    qualificacao_nome: 'Piloto Privado',
    qualificacao_codigo: 'PP',
    qualificacao_categoria: 'AVIÃO',
    data_conclusao: '2024-01-15T00:00:00Z',
    data_vencimento: '2026-01-15T00:00:00Z',
    numero_certificado: 'CERT-TEST-001',
    carga_horaria: 40,
    instrutor: 'José Instrutor',
    local: 'São Paulo',
    nota: 9.5,
  };

  try {
    console.log('📄 Gerando PDF com dados:', JSON.stringify(dadosTeste, null, 2));

    const pdfBytes = await gerarCertificadoPDF(dadosTeste);

    console.log(`\n✅ PDF gerado com sucesso!`);
    console.log(`   Tamanho: ${pdfBytes.length} bytes`);
    console.log(`   Tipo: ${pdfBytes.constructor.name}`);

    // Validar magic bytes
    const magicBytes = new Uint8Array(pdfBytes.slice(0, 4));
    const magicStr = String.fromCharCode(...Array.from(magicBytes));
    console.log(`   Magic bytes: "${magicStr}" (esperado: "%PDF")`);

    if (!magicStr.startsWith('%PDF')) {
      throw new Error('❌ Magic bytes inválidos - PDF corrompido!');
    }

    // Salvar arquivo para teste manual
    const outputPath = join(process.cwd(), 'test-certificate.pdf');
    writeFileSync(outputPath, pdfBytes);
    console.log(`\n💾 PDF salvo em: ${outputPath}`);
    console.log('   Abra o arquivo para verificar se está correto.\n');

    return true;
  } catch (error) {
    console.error('\n❌ Erro ao gerar PDF:', error);
    return false;
  }
}

testarGeracaoPDF()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
