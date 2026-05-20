async function testarManobras() {
  const url = 'http://localhost:8787/api/v2/simuladores/manobras';
  
  try {
    console.log('🔍 Testando:', url);
    const response = await fetch(url);
    console.log('📊 Status:', response.status, response.statusText);
    
    const data = await response.json();
    console.log('📦 Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Manobras encontradas:', data.total);
    } else {
      console.log('❌ Erro:', data.error);
    }
    
  } catch (error) {
    console.error('💥 Erro fetch:', error.message);
  }
}

testarManobras();
