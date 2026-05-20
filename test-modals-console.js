/**
 * TESTE DE MODALS - COPIE E COLE NO CONSOLE DO NAVEGADOR
 * Em http://localhost:3000/simuladores (tab Fichas de Sessão)
 *
 * Pressione F12 -> Console -> Cole este código -> Enter
 */

(async function testModals() {
  console.clear();
  console.log('🧪 INICIANDO TESTE DE MODALS...\n');

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    // 1. Verificar se estamos na página correta
    console.log('✓ Step 1: Verificando URL...');
    if (!window.location.href.includes('simuladores')) {
      throw new Error('❌ Navegue para /simuladores primeiro!');
    }
    console.log('  ✅ URL correta\n');

    // 2. Clicar na tab "Fichas de Sessão"
    console.log('✓ Step 2: Clicando na tab "Fichas de Sessão"...');
    const tabs = Array.from(document.querySelectorAll('button'));
    const fichasTab = tabs.find((btn) => btn.textContent.includes('Fichas de Sessão'));

    if (!fichasTab) {
      throw new Error('❌ Tab "Fichas de Sessão" não encontrada!');
    }

    fichasTab.click();
    await sleep(1500);
    console.log('  ✅ Tab clicada\n');

    // 3. Verificar se a lista de fichas carregou
    console.log('✓ Step 3: Aguardando lista de fichas...');
    await sleep(2000);

    const botoes = Array.from(document.querySelectorAll('button'));
    const avaliarBtns = botoes.filter((btn) => btn.textContent.trim() === 'Avaliar');
    const assinarBtns = botoes.filter((btn) => btn.textContent.includes('Assinar (Instrutor)'));

    console.log(
      `  📊 Encontrados: ${avaliarBtns.length} botões "Avaliar", ${assinarBtns.length} botões "Assinar"`,
    );

    if (avaliarBtns.length === 0) {
      throw new Error('❌ Nenhuma ficha encontrada! Verifique se há dados.');
    }
    console.log('  ✅ Lista carregada\n');

    // 4. Verificar o código dos botões
    console.log('✓ Step 4: Inspecionando handlers dos botões...');
    const primeiroAvaliar = avaliarBtns[0];
    const primeiroAssinar = assinarBtns[0];

    console.log('  🔍 Botão "Avaliar":');
    console.log('    - Tag:', primeiroAvaliar.tagName);
    console.log('    - Classes:', primeiroAvaliar.className);
    console.log('    - onClick?', primeiroAvaliar.onclick ? 'SIM' : 'NÃO (React handler)');

    console.log('  🔍 Botão "Assinar (Instrutor)":');
    console.log('    - Tag:', primeiroAssinar.tagName);
    console.log('    - Classes:', primeiroAssinar.className);
    console.log('    - onClick?', primeiroAssinar.onclick ? 'SIM' : 'NÃO (React handler)');
    console.log('  ✅ Handlers verificados\n');

    // 5. TESTE REAL: Clicar em "Avaliar"
    console.log('✓ Step 5: CLICANDO EM "AVALIAR"...');
    const urlAntes1 = window.location.href;
    primeiroAvaliar.click();
    await sleep(1500);
    const urlDepois1 = window.location.href;

    // Verificar se modal abriu (não deve ter navegado)
    if (urlAntes1 !== urlDepois1) {
      console.error('  ❌ ERRO: URL MUDOU! Navegou para:', urlDepois1);
      console.error('  ❌ BOTÃO ESTÁ CHAMANDO NAVIGATE EM VEZ DE MODAL!');
      throw new Error('Botão "Avaliar" navegou em vez de abrir modal');
    }

    // Verificar se modal está na tela
    const modals = document.querySelectorAll('[class*="fixed"][class*="inset-0"]');
    console.log(`  📊 Modais encontrados na tela: ${modals.length}`);

    if (modals.length === 0) {
      console.error('  ❌ ERRO: MODAL NÃO ABRIU!');
      console.error('  ❌ URL não mudou (OK) mas modal não apareceu!');
      throw new Error('Modal não abriu após clicar');
    }

    console.log('  ✅ URL não mudou (correto!)');
    console.log('  ✅ MODAL ABRIU!\n');

    // Verificar se é o modal correto
    const bodyText = document.body.textContent;
    const isModalAvaliar = bodyText.includes('manobra') || bodyText.includes('Observações Gerais');

    if (!isModalAvaliar) {
      console.error('  ⚠️  AVISO: Modal aberto mas não parece ser de avaliação!');
    } else {
      console.log('  ✅ CONFIRMADO: Modal de AVALIAÇÃO!');
    }

    // Fechar modal
    const closeBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent.includes('Cancelar') || btn.textContent.includes('Fechar'),
    );
    if (closeBtn) {
      closeBtn.click();
      await sleep(1000);
    }

    // 6. TESTE REAL: Clicar em "Assinar"
    console.log('\n✓ Step 6: CLICANDO EM "ASSINAR (INSTRUTOR)"...');
    const urlAntes2 = window.location.href;
    primeiroAssinar.click();
    await sleep(1500);
    const urlDepois2 = window.location.href;

    if (urlAntes2 !== urlDepois2) {
      console.error('  ❌ ERRO: URL MUDOU! Navegou para:', urlDepois2);
      console.error('  ❌ BOTÃO ESTÁ CHAMANDO NAVIGATE EM VEZ DE MODAL!');
      throw new Error('Botão "Assinar" navegou em vez de abrir modal');
    }

    const modals2 = document.querySelectorAll('[class*="fixed"][class*="inset-0"]');
    console.log(`  📊 Modais encontrados na tela: ${modals2.length}`);

    if (modals2.length === 0) {
      console.error('  ❌ ERRO: MODAL DE ASSINATURA NÃO ABRIU!');
      throw new Error('Modal de assinatura não abriu');
    }

    console.log('  ✅ URL não mudou (correto!)');
    console.log('  ✅ MODAL ABRIU!');

    const bodyText2 = document.body.textContent;
    const isModalAssinatura = bodyText2.includes('Assinatura') || bodyText2.includes('Canvas');

    if (!isModalAssinatura) {
      console.error('  ⚠️  AVISO: Modal aberto mas não parece ser de assinatura!');
    } else {
      console.log('  ✅ CONFIRMADO: Modal de ASSINATURA!\n');
    }

    // RESULTADO FINAL
    console.log('\n' + '='.repeat(60));
    console.log('🎉 TESTE COMPLETO - SUCESSO!');
    console.log('='.repeat(60));
    console.log('✅ Botão "Avaliar" abre modal de avaliação');
    console.log('✅ Botão "Assinar" abre modal de assinatura');
    console.log('✅ Nenhum botão navega incorretamente');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.error('❌ TESTE FALHOU!');
    console.log('='.repeat(60));
    console.error('Erro:', error.message);
    console.log('='.repeat(60) + '\n');

    // Debug info
    console.log('🔍 DEBUG INFO:');
    console.log('- URL atual:', window.location.href);
    console.log('- React root presente?', !!document.getElementById('root'));
    console.log(
      '- Timestamp do build:',
      document.querySelector('meta[name="build-timestamp"]')?.content || 'não encontrado',
    );
  }
})();
