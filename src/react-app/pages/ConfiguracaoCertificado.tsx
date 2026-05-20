import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

import { API_BASE_URL } from '@/react-app/config/api';
import { Edit2, Eye, EyeOff, X } from 'lucide-react';
import styles from './ConfiguracaoCertificado.module.css';
import PageHeader from '@/react-app/components/PageHeader';
import ContentCard from '@/react-app/components/ContentCard';

interface Empresa {
  id: number;
  nome: string;
  logo_url?: string;
}

interface CertConfig {
  empresa_id: number;
  template_html: string;
  logo_url?: string;
}

export default function ConfiguracaoCertificado() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  const [config, setConfig] = useState<CertConfig | null>(null);
  const [templateHtml, setTemplateHtml] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    carregarEmpresas();
  }, []);

  useEffect(() => {
    if (selectedEmpresa) {
      carregarConfigCertificado(selectedEmpresa);
    }
  }, [selectedEmpresa]);

  const carregarEmpresas = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/empresas`);
      const data = await res.json();
      setEmpresas(data.data || []);
      if (data.data?.length > 0) {
        setSelectedEmpresa(data.data[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar empresas:', err);
    } finally {
      setLoading(false);
    }
  };

  const carregarConfigCertificado = async (empresaId: number) => {
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/certificado`);
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        setTemplateHtml(data.data?.template_html || '');
      }
    } catch (err) {
      console.error('Erro ao carregar config:', err);
    }
  };

  const handleSalvarTemplate = async () => {
    if (!selectedEmpresa) return;

    try {
      setSaving(true);
      const res = await apiFetch(`/api/empresas/${selectedEmpresa}/certificado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_html: templateHtml }),
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        toast.warning('✓ Template salvo com sucesso!');
        carregarConfigCertificado(selectedEmpresa);
      }
    } catch (err) {
      toast.warning('✗ Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  const empresaSelecionada = empresas.find((e) => e.id === selectedEmpresa);
  const previewHtml = templateHtml
    .replace(
      /{{logo_url}}/g,
      empresaSelecionada?.logo_url ||
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    )
    .replace(/{{nome_funcionario}}/g, 'João Silva')
    .replace(/{{nome_qualificacao}}/g, 'Piloto Comercial')
    .replace(/{{data_conclusao}}/g, new Date().toLocaleDateString('pt-BR'));

  if (loading)
    return (
      <div className={styles.container}>
        <p>Carregando...</p>
      </div>
    );

  return (
    <div>
      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <a href="/">Início</a> / <a href="/configuracoes">Configurações</a> /{' '}
          <span>Certificados</span>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <h1>🎓 Configuração de Certificados</h1>
          <p className={styles.subtitle}>
            Personalize templates e cores de certificados por empresa
          </p>
        </div>

        {/* Seletor de Empresa */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>📋 Selecione a Empresa</h2>

          <div className={styles.formGroup}>
            <label>Empresa</label>
            <select
              value={selectedEmpresa || ''}
              onChange={(e) => setSelectedEmpresa(Number(e.target.value))}
              className={styles.select}
            >
              <option value="">-- Selecione uma empresa --</option>
              {empresas.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Informações da Empresa */}
        {empresaSelecionada && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>🏢 Informações da Empresa</h2>

            {empresaSelecionada.logo_url && (
              <div className={styles.logoPreview}>
                <img src={empresaSelecionada.logo_url} alt="Logo" loading="lazy" decoding="async" />
                <p className={styles.logoInfo}>Logo será incluído automaticamente</p>
              </div>
            )}
          </div>
        )}

        {/* Template de Certificado */}
        {selectedEmpresa && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>🎨 Template de Certificado</h2>

            <div className={styles.templateControls}>
              <button onClick={() => setShowModal(true)} className={styles.btnEdit}>
                <Edit2 size={18} />
                Editar Template
              </button>

              <button onClick={() => setShowPreview(!showPreview)} className={styles.btnPreview}>
                {showPreview ? <EyeOff size={18} /> : <Eye size={18} />}
                {showPreview ? 'Ocultar' : 'Ver'} Preview
              </button>
            </div>

            {templateHtml && (
              <div className={styles.info}>
                ✓ Template configurado ({templateHtml.length} caracteres)
              </div>
            )}

            {showPreview && (
              <div className={styles.previewBox}>
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
              </div>
            )}
          </div>
        )}

        {/* MODAL: EDITAR TEMPLATE */}
        {showModal && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h3>✏️ Editar Template - {empresaSelecionada?.nome}</h3>
                <button onClick={() => setShowModal(false)} className={styles.closeBtn}>
                  <X size={24} />
                </button>
              </div>

              <div className={styles.placeholders}>
                <strong>Placeholders disponíveis:</strong>
                <code>
                  {`{{logo_url}}`}, {`{{nome_funcionario}}`},{`{{nome_qualificacao}}`},{' '}
                  {`{{data_conclusao}}`}, ...
                </code>
              </div>

              <textarea
                value={templateHtml}
                onChange={(e) => setTemplateHtml(e.target.value)}
                className={styles.textarea}
                placeholder="Cole seu HTML aqui..."
              />

              <div className={styles.modalActions}>
                <button onClick={() => setShowModal(false)} className={styles.btnCancel}>
                  ✕ Cancelar
                </button>

                <button
                  onClick={handleSalvarTemplate}
                  disabled={saving}
                  className={styles.btnSuccess}
                >
                  {saving ? '⏳ Salvando...' : '💾 Salvar Template'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
