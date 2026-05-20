const API_BASE = 'https://airtrust-api-production.airtrust.workers.dev/api';

async function test() {
  console.log('🔍 Testando carregamento de modelos periódicos...\n');

  // 1. Listar todos os tipos de sessão
  console.log('1️⃣  Buscando tipos de sessão...');
  const typesRes = await fetch(`${API_BASE}/simuladores/tipos-sessao`);
  const typesData = await typesRes.json();
  const tipos = typesData.data || [];
  console.log(`   ✓ ${tipos.length} tipos encontrados`);
  const tipoPeriodicoId = tipos.find(t => t.codigo === 'RECURRENT' || t.codigo === 'PER' || t.nome?.includes('Periódico'))?.id;
  console.log(`   ✓ Tipo periódico ID: ${tipoPeriodicoId}\n`);

  // 2. Listar todas as aeronaves
  console.log('2️⃣  Buscando aeronaves...');
  const aerRes = await fetch(`${API_BASE}/aeronaves`);
  const aerData = await aerRes.json();
  const aeronaves = aerData.data || [];
  console.log(`   ✓ ${aeronaves.length} aeronaves encontradas`);
  aeronaves.forEach(a => console.log(`      - ${a.codigo}: ${a.modelo}`));
  const aw139 = aeronaves.find(a => a.codigo === 'AW139');
  console.log(`   ✓ AW139 código: ${aw139?.codigo}\n`);

  // 3. Buscar modelos SEM filtro
  console.log('3️⃣  Buscando TODOS os modelos...');
  const allRes = await fetch(`${API_BASE}/simuladores/modelos-sessao`);
  const allData = await allRes.json();
  const allModelos = allData.data || [];
  console.log(`   ✓ ${allModelos.length} modelos encontrados\n`);

  // 4. Buscar modelos COM filtro de periódico
  console.log(`4️⃣  Buscando modelos PERIÓDICOS (tipo=${tipoPeriodicoId}, aero=AW139)...`);
  const filteredRes = await fetch(`${API_BASE}/simuladores/modelos-sessao?tipo_sessao_id=${tipoPeriodicoId}&codigo_aeronave=AW139`);
  const filteredData = await filteredRes.json();
  const filteredModelos = filteredData.data || [];
  console.log(`   ✓ ${filteredModelos.length} modelos encontrados\n`);

  // 5. Analisar modelos periódicos
  const periodicos = allModelos.filter(m => m.tipo_sessao_id === tipoPeriodicoId);
  console.log(`5️⃣  Analisando estrutura dos modelos periódicos (total: ${periodicos.length}):\n`);
  periodicos.slice(0, 3).forEach(m => {
    console.log(`   �� ${m.codigo} - ${m.nome}`);
    console.log(`      tipo_sessao_id: ${m.tipo_sessao_id}`);
    console.log(`      tipo_aeronave: ${m.tipo_aeronave}`);
    console.log(`      codigo_aeronave: ${m.codigo_aeronave || '(NULL)'}`);
    console.log('');
  });
}

test().catch(console.error);
