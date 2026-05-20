#!/usr/bin/env node
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function testPDFGeneration() {
  try {
    console.log('🧪 Iniciando teste de geração de PDF...\n');

    // Criar documento PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 em pontos

    // Carregar fontes
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();
    const margin = 50;

    // Desenhar teste simples
    page.drawText('TESTE DE CERTIFICADO', {
      x: margin,
      y: height - 80,
      size: 18,
      font: fontBold,
      color: rgb(0, 0.2, 0.5),
    });

    page.drawText('Este é um teste de geração de PDF', {
      x: margin,
      y: height - 150,
      size: 12,
      font: fontRegular,
    });

    page.drawText(`Data: ${new Date().toLocaleDateString('pt-BR')}`, {
      x: margin,
      y: height - 200,
      size: 11,
      font: fontRegular,
    });

    // ✅ Serializar com await
    console.log('📄 Salvando PDF...');
    const pdfBytes = await pdfDoc.save();

    console.log(`✅ PDF gerado: ${pdfBytes.length} bytes`);
    console.log(`📊 Tipo: ${pdfBytes.constructor.name}`);

    // ✅ Converter para Buffer
    const pdfBuffer = Buffer.from(pdfBytes);
    console.log(`📊 Buffer criado: ${pdfBuffer.length} bytes`);

    // Salvar arquivo de teste
    const testPath = path.join(process.cwd(), 'test-output.pdf');
    fs.writeFileSync(testPath, pdfBuffer);
    console.log(`✅ Arquivo salvo em: ${testPath}`);

    // Validar magic bytes PDF
    const magicBytes = pdfBuffer.slice(0, 4).toString();
    console.log(`🔍 Magic bytes: ${magicBytes} (esperado: %PDF)`);

    if (magicBytes.startsWith('%PDF')) {
      console.log('✅ PDF válido! Magic bytes corretos.');
    } else {
      console.log('❌ ERRO: Magic bytes inválidos!');
      process.exit(1);
    }

    // Verificar tamanho mínimo
    if (pdfBuffer.length > 100) {
      console.log(`✅ Tamanho OK: ${pdfBuffer.length} bytes`);
    } else {
      console.log(`❌ ERRO: PDF muito pequeno: ${pdfBuffer.length} bytes`);
      process.exit(1);
    }

    console.log('\n✅ Teste de geração de PDF: SUCESSO');
  } catch (error) {
    console.error('❌ Erro ao gerar PDF:', error);
    process.exit(1);
  }
}

testPDFGeneration();
