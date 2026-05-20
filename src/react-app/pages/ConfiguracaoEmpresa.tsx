import { useState, useEffect } from 'react';
import { Building2, Save, AlertCircle, CheckCircle } from 'lucide-react';
import styles from './ConfiguracaoEmpresa.module.css';

interface EmpresaConfig {
  empresa_id?: number;
  nome: string;
  logo_url?: string;
  template_certificado?: string;
  cor_primaria: string;
  cor_secundaria: string;
}

export default function ConfiguracaoEmpresa() {
  const [config, setConfig] = useState<EmpresaConfig | null>(null);
  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    carregarConfig();
  }, []);

  const carregarConfig = async () => {
    try {
      setLoading(true);

      const minhaEmpresaRes = await apiFetch('/api/empresas/minha');
      const minhaEmpresaData = await minhaEmpresaRes.json();
      const currentEmpresaId = Number(minhaEmpresaData?.data?.id || 0);

      if (!currentEmpresaId) {
        setMessage({ text: 'Empresa ativa não identificada', type: 'error' });
        setLoading(false);
        return;
      }

      setEmpresaId(currentEmpresaId);

      const res = await apiFetch(`/api/empresas/${currentEmpresaId}/config`);
      const data = await res.json();

      if (data.success) {
        setConfig(data.data);
      } else {
        setMessage({ text: `Erro ao carregar: ${data.error}`, type: 'error' });
      }
    } catch (err) {
      console.error('Erro ao carregar config:', err);
      setMessage({ text: `Erro: ${String(err)}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!config || !empresaId) return;

    try {
      setSaving(true);
      setMessage(null);

      const res = await apiFetch(`/api/empresas/${empresaId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: config.nome,
          logo_url: config.logo_url,
          template_certificado: config.template_certificado,
          cor_primaria: config.cor_primaria,
          cor_secundaria: config.cor_secundaria,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ text: '✅ Configurações salvas com sucesso!', type: 'success' });
        setTimeout(() => carregarConfig(), 500); // Recarregar após 500ms
      } else {
        setMessage({ text: `Erro: ${data.error}`, type: 'error' });
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      setMessage({ text: `Erro: ${String(err)}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Carregando configurações...</div>;
  }

  if (!config) {
    return <div className={styles.error}>Erro ao carregar configurações</div>;
  }

  return (
    <div>
      <div className={styles.container}>
        <div className={styles.header}>
          <Building2 className={styles.icon} />
          <div>
            <h1>Configuração da Empresa</h1>
            <p>Gerencie informações, cores e template de certificados</p>
          </div>
        </div>

        {message && (
          <div className={styles[`message${message.type === 'success' ? 'Sucess' : 'Error'}`]}>
            <div className={styles.messageContent}>
              {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* CARD 1: Informações Básicas */}
        <div className={styles.card}>
          <h2>Informações Básicas</h2>
          <div className={styles.formGroup}>
            <label>Nome da Empresa *</label>
            <input
              type="text"
              value={config.nome}
              onChange={(e) => setConfig({ ...config, nome: e.target.value })}
              placeholder="Ex: Costa do Sol Aviação"
              className={styles.input}
            />
          </div>

          <button onClick={handleSalvar} disabled={saving} className={styles.buttonPrimary}>
            <Save size={18} />
            {saving ? 'Salvando...' : 'Salvar Empresa'}
          </button>
        </div>

        {/* CARD 2: Logo */}
        <div className={styles.card}>
          <h2>Logo da Empresa</h2>
          {config.logo_url && (
            <div className={styles.logoPreview}>
              <img src={config.logo_url} alt="Logo da empresa" loading="lazy" decoding="async" />
              <span className={styles.badge}>Logo configurada</span>
            </div>
          )}

          <div className={styles.formGroup}>
            <label>URL da Logo</label>
            <input
              type="text"
              value={config.logo_url || ''}
              onChange={(e) => setConfig({ ...config, logo_url: e.target.value })}
              placeholder="https://exemplo.com/logo.png"
              className={styles.input}
            />
          </div>

          <button onClick={handleSalvar} disabled={saving} className={styles.buttonSecondary}>
            <Save size={18} />
            Salvar Logo
          </button>
        </div>

        {/* CARD 3: Cores do Certificado */}
        <div className={styles.card}>
          <h2>Cores do Certificado</h2>
          <div className={styles.formGroup}>
            <label>Cor Primária *</label>
            <div className={styles.colorInput}>
              <input
                type="color"
                value={config.cor_primaria}
                onChange={(e) => setConfig({ ...config, cor_primaria: e.target.value })}
              />
              <code>{config.cor_primaria}</code>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Cor Secundária *</label>
            <div className={styles.colorInput}>
              <input
                type="color"
                value={config.cor_secundaria}
                onChange={(e) => setConfig({ ...config, cor_secundaria: e.target.value })}
              />
              <code>{config.cor_secundaria}</code>
            </div>
          </div>

          <button onClick={handleSalvar} disabled={saving} className={styles.buttonSuccess}>
            <Save size={18} />
            Salvar Cores
          </button>
        </div>

        {/* CARD 4: Template do Certificado */}
        <div className={styles.card}>
          <h2>Template do Certificado</h2>
          <div className={styles.formGroup}>
            <label>Conteúdo HTML</label>
            <textarea
              value={config.template_certificado || ''}
              onChange={(e) => setConfig({ ...config, template_certificado: e.target.value })}
              placeholder="Cole aqui o template HTML do certificado..."
              className={styles.textarea}
              rows={6}
            />
          </div>

          <button onClick={handleSalvar} disabled={saving} className={styles.buttonPrimary}>
            <Save size={18} />
            Salvar Template
          </button>
        </div>
      </div>
    </div>
  );
}
