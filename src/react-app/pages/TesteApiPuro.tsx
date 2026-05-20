import React from 'react';
import { API_BASE_URL } from '@/react-app/config/api';

export function TesteApiPuro() {
  const [funcionarios, setFuncionarios] = React.useState<any[]>([]);
  const [status, setStatus] = React.useState('⏳ Carregando...');
  const [logs, setLogs] = React.useState<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  React.useEffect(() => {
    addLog('🚀 Componente montado');
    addLog('📡 Iniciando fetch...');

    const url =
      'https://airtrust.airtrust.workers.dev/api/funcionarios?status=ativos&orderBy=nome&order=ASC&limit=50';
    addLog(`📍 URL: ${url}`);

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test',
      },
    })
      .then((response) => {
        addLog(`✅ Status HTTP: ${response.status}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((json) => {
        addLog(`✅ JSON recebido. Total: ${json.data?.length || 0}`);
        setFuncionarios(json.data || []);
        setStatus(`✅ ${(json.data || []).length} funcionários carregados!`);
      })
      .catch((error) => {
        addLog(`❌ ERRO: ${error.message}`);
        setStatus(`❌ Erro: ${error.message}`);
      });
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🧪 Teste API (React Puro)</h1>

      <div
        style={{
          padding: '10px',
          margin: '10px 0',
          borderRadius: '4px',
          backgroundColor: status.startsWith('✅') ? '#d4edda' : '#f8d7da',
          color: status.startsWith('✅') ? '#155724' : '#721c24',
        }}
      >
        {status}
      </div>

      {funcionarios.length > 0 && (
        <>
          <h2>Tabela de Funcionários</h2>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: '20px',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Nome</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Email</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Cargo</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Matrícula</th>
              </tr>
            </thead>
            <tbody>
              {funcionarios.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '10px' }}>{f.id}</td>
                  <td style={{ padding: '10px' }}>{f.nome}</td>
                  <td style={{ padding: '10px' }}>{f.email}</td>
                  <td style={{ padding: '10px' }}>{f.cargo}</td>
                  <td style={{ padding: '10px' }}>{f.matricula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div
        style={{
          backgroundColor: '#1e1e1e',
          color: '#00ff00',
          padding: '10px',
          borderRadius: '4px',
          fontFamily: "'Courier New', monospace",
          fontSize: '12px',
          marginTop: '20px',
          maxHeight: '300px',
          overflowY: 'auto',
        }}
      >
        {logs.map((log, idx) => (
          <div key={idx}>{log}</div>
        ))}
      </div>
    </div>
  );
}

export default TesteApiPuro;
