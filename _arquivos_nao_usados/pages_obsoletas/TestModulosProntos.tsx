/**
 * Página de Teste - Módulos Prontos
 * Testa integração Frontend ↔ Backend ↔ D1 para todos módulos
 */

import { useFuncionarios } from '../react-app/hooks/useFuncionarios';
import { useQualificacoes } from '../react-app/hooks/useQualificacoes';
import { useQualificacoesHistorico, useHabilitacoes } from '../react-app/hooks/useQualificacoesExt';
import { useSessoes } from '../react-app/hooks/useSessoes';
import { useCompliance } from '../react-app/hooks/useCompliance';
import { useAuditoria, useAuditoriaStats } from '../react-app/hooks/useAuditoria';

export default function TestModulosProntos() {
  // Módulo 1: Pessoas
  const {
    funcionarios,
    loading: loadingFuncionarios,
    error: errorFuncionarios,
  } = useFuncionarios();

  // Módulo 2: Qualificações
  const {
    qualificacoes,
    loading: loadingQualificacoes,
    error: errorQualificacoes,
  } = useQualificacoes();

  const {
    historico,
    loading: loadingHistorico,
    error: errorHistorico,
  } = useQualificacoesHistorico();

  const {
    habilitacoes,
    loading: loadingHabilitacoes,
    error: errorHabilitacoes,
  } = useHabilitacoes();

  // Módulo 3: Sessões
  const { sessoes, loading: loadingSessoes, error: errorSessoes } = useSessoes(10);

  // Módulo 7: Compliance
  const {
    compliance,
    stats: statsCompliance,
    loading: loadingCompliance,
    error: errorCompliance,
  } = useCompliance();

  // Módulo 8: Auditoria
  const {
    logs,
    loading: loadingAuditoria,
    error: errorAuditoria,
  } = useAuditoria(undefined, undefined, 10);

  const {
    stats: statsAuditoria,
    topAcoes,
    topTabelas: _topTabelas,
    loading: loadingStatsAuditoria,
  } = useAuditoriaStats();

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        🧪 Teste de Módulos Prontos - AirTrust
      </h1>

      {/* MÓDULO 1: PESSOAS */}
      <section style={sectionStyle}>
        <h2 style={headerStyle}>1️⃣ Pessoas (Funcionários)</h2>
        {loadingFuncionarios && <p style={loadingStyle}>⏳ Carregando...</p>}
        {errorFuncionarios && <p style={errorStyle}>❌ Erro: {errorFuncionarios}</p>}
        {!loadingFuncionarios && !errorFuncionarios && (
          <>
            <p style={successStyle}>✅ Total: {funcionarios?.length || 0} funcionários</p>
            <details>
              <summary style={summaryStyle}>Ver dados (primeiros 2)</summary>
              <pre style={preStyle}>{JSON.stringify(funcionarios?.slice(0, 2), null, 2)}</pre>
            </details>
          </>
        )}
      </section>

      {/* MÓDULO 2: QUALIFICAÇÕES */}
      <section style={sectionStyle}>
        <h2 style={headerStyle}>2️⃣ Qualificações</h2>

        <div style={{ marginBottom: '15px' }}>
          <h3 style={{ fontSize: '1.1em', marginBottom: '5px' }}>📋 Catálogo de Qualificações</h3>
          {loadingQualificacoes && <p style={loadingStyle}>⏳ Carregando...</p>}
          {errorQualificacoes && <p style={errorStyle}>❌ Erro: {errorQualificacoes}</p>}
          {!loadingQualificacoes && !errorQualificacoes && (
            <>
              <p style={successStyle}>✅ Total: {qualificacoes?.length || 0} qualificações</p>
              <details>
                <summary style={summaryStyle}>Ver dados (primeiros 2)</summary>
                <pre style={preStyle}>{JSON.stringify(qualificacoes?.slice(0, 2), null, 2)}</pre>
              </details>
            </>
          )}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h3 style={{ fontSize: '1.1em', marginBottom: '5px' }}>📜 Histórico de Qualificações</h3>
          {loadingHistorico && <p style={loadingStyle}>⏳ Carregando...</p>}
          {errorHistorico && <p style={errorStyle}>❌ Erro: {errorHistorico}</p>}
          {!loadingHistorico && !errorHistorico && (
            <>
              <p style={successStyle}>✅ Total: {historico?.length || 0} registros</p>
              <details>
                <summary style={summaryStyle}>Ver dados (primeiros 2)</summary>
                <pre style={preStyle}>{JSON.stringify(historico?.slice(0, 2), null, 2)}</pre>
              </details>
            </>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: '1.1em', marginBottom: '5px' }}>🎓 Habilitações</h3>
          {loadingHabilitacoes && <p style={loadingStyle}>⏳ Carregando...</p>}
          {errorHabilitacoes && <p style={errorStyle}>❌ Erro: {errorHabilitacoes}</p>}
          {!loadingHabilitacoes && !errorHabilitacoes && (
            <>
              <p style={successStyle}>✅ Total: {habilitacoes?.length || 0} habilitações</p>
              <details>
                <summary style={summaryStyle}>Ver dados (primeiros 2)</summary>
                <pre style={preStyle}>{JSON.stringify(habilitacoes?.slice(0, 2), null, 2)}</pre>
              </details>
            </>
          )}
        </div>
      </section>

      {/* MÓDULO 3: SESSÕES */}
      <section style={sectionStyle}>
        <h2 style={headerStyle}>3️⃣ Simuladores (Sessões)</h2>
        {loadingSessoes && <p style={loadingStyle}>⏳ Carregando...</p>}
        {errorSessoes && <p style={errorStyle}>❌ Erro: {errorSessoes}</p>}
        {!loadingSessoes && !errorSessoes && (
          <>
            <p style={successStyle}>✅ Total: {sessoes?.length || 0} sessões</p>
            <details>
              <summary style={summaryStyle}>Ver dados (primeiros 2)</summary>
              <pre style={preStyle}>{JSON.stringify(sessoes?.slice(0, 2), null, 2)}</pre>
            </details>
          </>
        )}
      </section>

      {/* MÓDULO 7: COMPLIANCE */}
      <section style={sectionStyle}>
        <h2 style={headerStyle}>7️⃣ Compliance</h2>
        {loadingCompliance && <p style={loadingStyle}>⏳ Carregando...</p>}
        {errorCompliance && <p style={errorStyle}>❌ Erro: {errorCompliance}</p>}
        {!loadingCompliance && !errorCompliance && (
          <>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={statCardStyle('green')}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {statsCompliance?.em_dia || 0}
                </div>
                <div style={{ fontSize: '12px' }}>Em Dia</div>
              </div>
              <div style={statCardStyle('yellow')}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {statsCompliance?.vencendo || 0}
                </div>
                <div style={{ fontSize: '12px' }}>Vencendo</div>
              </div>
              <div style={statCardStyle('red')}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {statsCompliance?.vencido || 0}
                </div>
                <div style={{ fontSize: '12px' }}>Vencido</div>
              </div>
            </div>
            <p style={successStyle}>✅ Total: {compliance?.length || 0} registros</p>
            <details>
              <summary style={summaryStyle}>Ver dados (primeiros 2)</summary>
              <pre style={preStyle}>{JSON.stringify(compliance?.slice(0, 2), null, 2)}</pre>
            </details>
          </>
        )}
      </section>

      {/* MÓDULO 8: AUDITORIA */}
      <section style={sectionStyle}>
        <h2 style={headerStyle}>8️⃣ Auditoria</h2>

        <div style={{ marginBottom: '15px' }}>
          <h3 style={{ fontSize: '1.1em', marginBottom: '5px' }}>📊 Estatísticas</h3>
          {loadingStatsAuditoria && <p style={loadingStyle}>⏳ Carregando...</p>}
          {!loadingStatsAuditoria && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <div style={statCardStyle('blue')}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {statsAuditoria?.total_logs || 0}
                  </div>
                  <div style={{ fontSize: '12px' }}>Total de Logs</div>
                </div>
                <div style={statCardStyle('purple')}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {statsAuditoria?.total_tabelas || 0}
                  </div>
                  <div style={{ fontSize: '12px' }}>Tabelas</div>
                </div>
                <div style={statCardStyle('orange')}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {statsAuditoria?.total_acoes || 0}
                  </div>
                  <div style={{ fontSize: '12px' }}>Ações</div>
                </div>
              </div>

              {topAcoes && topAcoes.length > 0 && (
                <details>
                  <summary style={summaryStyle}>Top 5 Ações</summary>
                  <pre style={preStyle}>{JSON.stringify(topAcoes, null, 2)}</pre>
                </details>
              )}
            </>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: '1.1em', marginBottom: '5px' }}>📝 Últimos Logs</h3>
          {loadingAuditoria && <p style={loadingStyle}>⏳ Carregando...</p>}
          {errorAuditoria && <p style={errorStyle}>❌ Erro: {errorAuditoria}</p>}
          {!loadingAuditoria && !errorAuditoria && (
            <>
              <p style={successStyle}>✅ Total: {logs?.length || 0} logs</p>
              <details>
                <summary style={summaryStyle}>Ver dados (primeiros 2)</summary>
                <pre style={preStyle}>{JSON.stringify(logs?.slice(0, 2), null, 2)}</pre>
              </details>
            </>
          )}
        </div>
      </section>

      {/* RESUMO FINAL */}
      <section style={{ ...sectionStyle, background: '#f0f9ff', border: '2px solid #3b82f6' }}>
        <h2 style={{ fontSize: '1.3em', marginBottom: '15px', color: '#1e40af' }}>
          ✅ Checklist de Integração
        </h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <CheckItem
            label="1. Pessoas"
            status={!loadingFuncionarios && !errorFuncionarios && funcionarios.length > 0}
          />
          <CheckItem
            label="2. Qualificações (Catálogo)"
            status={!loadingQualificacoes && !errorQualificacoes && qualificacoes.length > 0}
          />
          <CheckItem
            label="2. Qualificações (Histórico)"
            status={!loadingHistorico && !errorHistorico}
          />
          <CheckItem label="2. Habilitações" status={!loadingHabilitacoes && !errorHabilitacoes} />
          <CheckItem label="3. Sessões de Simulador" status={!loadingSessoes && !errorSessoes} />
          <CheckItem label="7. Compliance" status={!loadingCompliance && !errorCompliance} />
          <CheckItem label="8. Auditoria (Logs)" status={!loadingAuditoria && !errorAuditoria} />
          <CheckItem label="8. Auditoria (Stats)" status={!loadingStatsAuditoria} />
        </ul>
      </section>
    </div>
  );
}

// Componente auxiliar para checklist
function CheckItem({ label, status }: { label: string; status: boolean }) {
  return (
    <li
      style={{
        padding: '8px',
        marginBottom: '5px',
        background: status ? '#d1fae5' : '#fee2e2',
        border: `1px solid ${status ? '#10b981' : '#ef4444'}`,
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <span style={{ fontSize: '18px' }}>{status ? '✅' : '❌'}</span>
      <span style={{ fontWeight: '500' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>
        {status ? 'OK' : 'ERRO'}
      </span>
    </li>
  );
}

// Estilos inline
const sectionStyle: React.CSSProperties = {
  marginBottom: '30px',
  padding: '15px',
  border: '1px solid #ccc',
  borderRadius: '8px',
  background: '#fafafa',
};

const headerStyle: React.CSSProperties = {
  fontSize: '1.3em',
  marginBottom: '10px',
  color: '#333',
};

const loadingStyle: React.CSSProperties = {
  color: '#f59e0b',
  fontWeight: 'bold',
};

const errorStyle: React.CSSProperties = {
  color: '#ef4444',
  fontWeight: 'bold',
};

const successStyle: React.CSSProperties = {
  color: '#10b981',
  fontWeight: 'bold',
  marginBottom: '10px',
};

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '5px',
  background: '#e5e7eb',
  borderRadius: '4px',
  marginBottom: '5px',
};

const preStyle: React.CSSProperties = {
  background: '#1f2937',
  color: '#10b981',
  padding: '10px',
  borderRadius: '4px',
  overflow: 'auto',
  fontSize: '12px',
  maxHeight: '300px',
};

function statCardStyle(color: string): React.CSSProperties {
  const colors = {
    green: { bg: '#d1fae5', border: '#10b981' },
    yellow: { bg: '#fef3c7', border: '#f59e0b' },
    red: { bg: '#fee2e2', border: '#ef4444' },
    blue: { bg: '#dbeafe', border: '#3b82f6' },
    purple: { bg: '#e9d5ff', border: '#a855f7' },
    orange: { bg: '#fed7aa', border: '#f97316' },
  };

  const c = colors[color as keyof typeof colors] || colors.blue;

  return {
    flex: 1,
    padding: '15px',
    textAlign: 'center',
    background: c.bg,
    border: `2px solid ${c.border}`,
    borderRadius: '8px',
  };
}
