async function testarFuncionariosListar() {
  const url = 'http://localhost:8787/api/funcionarios/listar?page=1&limit=10&sortBy=nome&sortOrder=asc';
  
  try {
    console.log('🔍 Testando:', url);
    const response = await fetch(url);
    console.log('📊 Status:', response.status, response.statusText);
    
    const data = await response.json();
    console.log('📦 Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Funcionários encontrados:', data.funcionarios?.length || 0);
      console.log('📄 Total:', data.pagination?.total || 0);
      console.log('📄 Páginas:', data.pagination?.totalPages || 0);
    } else {
      console.log('❌ Erro:', data.error);
    }
    
  } catch (error) {
    console.error('💥 Erro fetch:', error.message);
  }
}

testarFuncionariosListar();
