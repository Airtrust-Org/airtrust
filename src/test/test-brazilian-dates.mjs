import { pathToFileURL } from 'node:url';
/**
 * Teste das funcionalidades de datas brasileiras no AirTrust
 * Validar parsing, conversão e importação de certificações
 */

// Teste 1: Importação com datas brasileiras válidas
const testValidBrazilianDates = async () => {
  console.log('🧪 TESTE 1: Importação com datas brasileiras válidas');

  const csvBrasileiroValido = `funcionario_matricula,treinamento_codigo,data_conclusao,data_vencimento,instrutor,nota_final,observacoes
00300,CMA-001,20/08/2025,19/09/2026,Dr. João Silva,8.5,Certificação médica aprovada
00301,ICAO-001,17/09/2025,16/09/2026,Maria Santos,9.0,Proficiência linguística excelente
00302,SGS-001,15/08/2025,14/02/2026,Pedro Costa,7.5,Treinamento de segurança concluído`;

  try {
    const response = await fetch(
      'http://localhost:5173/api/import-certificacoes-batch/import-planilha-batch',
      {
        method: 'POST',
        body: createFormData(csvBrasileiroValido, 'test-brasileiro-valido.csv'),
      },
    );

    const result = await response.json();

    if (result.success && result.importadas_com_sucesso > 0) {
      console.log('✅ TESTE 1 PASSOU: Datas brasileiras válidas aceitas');
      console.log(`   - Importadas: ${result.importadas_com_sucesso} certificações`);
      return true;
    } else {
      console.log('❌ TESTE 1 FALHOU: Datas brasileiras válidas rejeitadas');
      console.log('   - Erros:', result.errors?.slice(0, 3));
      return false;
    }
  } catch (error) {
    console.log('❌ TESTE 1 ERRO:', error.message);
    return false;
  }
};

// Teste 2: Rejeição de datas no formato antigo (ISO)
const testRejectOldISOFormat = async () => {
  console.log('🧪 TESTE 2: Rejeição de datas no formato antigo (ISO)');

  const csvFormatoAntigo = `funcionario_matricula,treinamento_codigo,data_conclusao,data_vencimento,instrutor,nota_final,observacoes
00400,TEST-001,2025-08-20,2026-09-19,Dr. João Silva,8.5,Formato antigo ISO
00401,TEST-002,2025-09-17,2026-09-16,Maria Santos,9.0,Deveria ser rejeitado`;

  try {
    const response = await fetch(
      'http://localhost:5173/api/import-certificacoes-batch/import-planilha-batch',
      {
        method: 'POST',
        body: createFormData(csvFormatoAntigo, 'test-formato-antigo.csv'),
      },
    );

    const result = await response.json();

    // Esperamos que NÃO tenha sucesso ou tenha erros de data
    const temErrosData = result.errors?.some(
      (error) =>
        error.message.toLowerCase().includes('formato antigo') ||
        error.message.toLowerCase().includes('dd/mm/aaaa'),
    );

    if (!result.success || temErrosData) {
      console.log('✅ TESTE 2 PASSOU: Formato antigo rejeitado corretamente');
      console.log(`   - Erros de data detectados: ${temErrosData ? 'SIM' : 'NÃO'}`);
      return true;
    } else {
      console.log('❌ TESTE 2 FALHOU: Formato antigo aceito incorretamente');
      console.log(`   - Importadas: ${result.importadas_com_sucesso} (deveria ser 0)`);
      return false;
    }
  } catch (error) {
    console.log('❌ TESTE 2 ERRO:', error.message);
    return false;
  }
};

// Teste 3: Template baixado com formato brasileiro
const testBrazilianTemplate = async () => {
  console.log('🧪 TESTE 3: Template com formato brasileiro');

  try {
    const response = await fetch(
      'http://localhost:5173/api/templates-airtrust-brazilian-dates/certificacoes/csv',
    );

    if (response.ok) {
      const csvContent = await response.text();

      // Verificar se contém datas no formato brasileiro
      const contemDatasBrasileiras = /\d{2}\/\d{2}\/\d{4}/.test(csvContent);
      const naoContemDatasISO = !/\d{4}-\d{2}-\d{2}/.test(csvContent);

      if (contemDatasBrasileiras && naoContemDatasISO) {
        console.log('✅ TESTE 3 PASSOU: Template contém apenas datas brasileiras');
        console.log('   - Formato DD/MM/AAAA encontrado: SIM');
        console.log('   - Formato YYYY-MM-DD encontrado: NÃO');
        return true;
      } else {
        console.log('❌ TESTE 3 FALHOU: Template não está no formato brasileiro');
        console.log(`   - Formato DD/MM/AAAA: ${contemDatasBrasileiras ? 'SIM' : 'NÃO'}`);
        console.log(`   - Formato YYYY-MM-DD: ${naoContemDatasISO ? 'NÃO' : 'SIM (problemático)'}`);
        return false;
      }
    } else {
      console.log('❌ TESTE 3 FALHOU: Erro ao baixar template');
      return false;
    }
  } catch (error) {
    console.log('❌ TESTE 3 ERRO:', error.message);
    return false;
  }
};

// Teste 4: Datas inválidas brasileiras
const testInvalidBrazilianDates = async () => {
  console.log('🧪 TESTE 4: Rejeição de datas brasileiras inválidas');

  const csvDatasInvalidas = `funcionario_matricula,treinamento_codigo,data_conclusao,data_vencimento,instrutor,nota_final,observacoes
00500,TEST-003,32/13/2025,45/99/2026,Dr. João Silva,8.5,Datas impossíveis
00501,TEST-004,00/00/2025,31/02/2026,Maria Santos,9.0,Mais datas inválidas`;

  try {
    const response = await fetch(
      'http://localhost:5173/api/import-certificacoes-batch/import-planilha-batch',
      {
        method: 'POST',
        body: createFormData(csvDatasInvalidas, 'test-datas-invalidas.csv'),
      },
    );

    const result = await response.json();

    const temErrosValidacao = result.errors?.some(
      (error) =>
        error.message.toLowerCase().includes('inválida') ||
        error.message.toLowerCase().includes('formato'),
    );

    if (!result.success || temErrosValidacao) {
      console.log('✅ TESTE 4 PASSOU: Datas inválidas rejeitadas');
      return true;
    } else {
      console.log('❌ TESTE 4 FALHOU: Datas inválidas aceitas');
      return false;
    }
  } catch (error) {
    console.log('❌ TESTE 4 ERRO:', error.message);
    return false;
  }
};

// Função auxiliar para criar FormData
const createFormData = (csvContent, filename) => {
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: 'text/csv' });
  formData.append('file', blob, filename);
  return formData;
};

// Executar todos os testes
const runAllTests = async () => {
  console.log('\n🚀 INICIANDO TESTES DE DATAS BRASILEIRAS AIRTRUST\n');

  const results = await Promise.all([
    testValidBrazilianDates(),
    testRejectOldISOFormat(),
    testBrazilianTemplate(),
    testInvalidBrazilianDates(),
  ]);

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log('\n📊 RESUMO DOS TESTES:');
  console.log(`✅ Passou: ${passed}/${total}`);
  console.log(`❌ Falhou: ${total - passed}/${total}`);

  if (passed === total) {
    console.log(
      '\n🎉 TODOS OS TESTES PASSARAM! Sistema de datas brasileiras está funcionando corretamente.',
    );
  } else {
    console.log('\n⚠️ ALGUNS TESTES FALHARAM. Verificar implementação do padrão brasileiro.');
  }

  return passed === total;
};

// Auto-executar se chamado diretamente
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAllTests().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

export { runAllTests };
