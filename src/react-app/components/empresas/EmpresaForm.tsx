import React, { useState, useEffect } from 'react';
import {
  Building2,
  Settings,
  FileText,
  Upload,
  Image as ImageIcon,
  Save,
  Loader2,
  Edit2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, ensureValidAccessToken } from '../../config/api';

// Helper para resolver URL do logo (suporta data URLs e paths relativos /api/assets/...)
function getLogoUrl(logoUrl: string | null | undefined): string | undefined {
  if (!logoUrl) return undefined;
  // URLs completas (http/https) passam direto
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
    return logoUrl;
  }
  // Paths relativos com /api/ precisam de origin prefix
  if (logoUrl.startsWith('/api/')) {
    const path = logoUrl.replace('/api/', '/');
    return `${API_BASE_URL}${path}`;
  }
  // Caso contrário, retorna como está
  return logoUrl;
}

interface EmpresaFormProps {
  empresaId?: number | null; // Null se for criar nova (apenas Admin)
  isSelfEdit?: boolean; // True se a empresa está editando a si mesma
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface EmpresaData {
  id?: number;
  nome: string;
  codigo: string;
  cnpj?: string;
  dominio?: string;
  plano: 'basic' | 'pro' | 'enterprise';
  max_funcionarios: number;
  max_storage_mb: number;
  logo_url?: string | null;
  ativo: number;
  // Configs extendidas
  certificado_logo_url?: string | null;
  certificado_template_html?: string | null;
  cores_tema?: Record<string, unknown> | null;
  // Adicionando campos faltantes para evitar uso de 'any' e data loss
  dias_alerta_vencimento?: number;
  email_notificacoes?: string;
  webhook_url?: string;
  timezone?: string;
  logo_relatorio?: string;
  modulos_ativos?: string[];
}

const emptyData: EmpresaData = {
  nome: '',
  codigo: '',
  cnpj: '',
  plano: 'basic',
  max_funcionarios: 100,
  max_storage_mb: 1000,
  ativo: 1,
};

// Template de certificado padrão baseado no modelo Costa do Sol
// Template padrão — A4 página única, conforme NR-1 / ANAC, design Apple-style
const DEFAULT_CERTIFICATE_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    @page { size: A4; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; background: #fff; }
    .cert-page {
      width: 210mm; min-height: 297mm;
      padding: 18mm 18mm 14mm;
      display: flex; flex-direction: column; gap: 24px;
    }
    /* HEADER */
    .header {
      display: flex; justify-content: center; align-items: center;
      padding-bottom: 12px; border-bottom: 2px solid #0071e3;
    }
    .header img { max-height: 72px; max-width: 210px; object-fit: contain; }
    /* MAIN TITLE */
    .main-title {
      text-align: center; font-size: 26pt; font-weight: 700;
      letter-spacing: -0.5px; color: #1d1d1f; margin: 0;
    }
    .main-title + .main-sub { margin-top: 12px; }
    .main-sub { text-align: center; font-size: 10pt; color: #6e6e73; margin: 0; line-height: 1.4; }
    /* INFO GRID */
    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px 18px;
    }
    .info-item {
      background: #f5f5f7; border-radius: 10px; padding: 12px 16px; min-height: 64px;
    }
    .info-item .label { font-size: 7.5pt; color: #6e6e73; text-transform: uppercase; letter-spacing: .5px; }
    .info-item .value { font-size: 10pt; font-weight: 600; color: #1d1d1f; margin-top: 4px; line-height: 1.3; }
    /* TRAINING BOX */
    .training-box {
      background: linear-gradient(135deg, #0071e3 0%, #0077ed 100%);
      border-radius: 14px; padding: 16px 20px; color: #fff;
    }
    .training-box .qual-name { font-size: 15pt; font-weight: 700; }
    .training-box .qual-meta { font-size: 9pt; opacity: .85; margin-top: 4px; }
    .instructor-section {
      border: 1px solid #dbeafe; background: #eff6ff; border-radius: 9px;
      padding: 7px 10px; display: grid; grid-template-columns: minmax(0, 1fr) auto;
      align-items: center; gap: 8px 14px; min-height: 0;
    }
    .instructor-name-block, .instructor-meta-block {
      display: flex; align-items: center; gap: 7px; min-width: 0;
    }
    .instructor-label, .instructor-meta-label {
      color: #64748b; font-size: 7.1pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: .45px; white-space: nowrap;
    }
    .instructor-name, .instructor-meta-value {
      color: #1d1d1f; font-size: 9pt; font-weight: 700; line-height: 1.15;
    }
    /* CONTEUDO PROGRAMATICO */
    .program-section { flex: 1; }
    .program-label {
      font-size: 7.4pt; font-weight: 700; text-transform: uppercase;
      letter-spacing: .6px; color: #1d1d1f; margin-bottom: 8px;
      padding-bottom: 5px; border-bottom: 1px solid #e5e5ea;
    }
    .program-content {
      column-count: 2; column-gap: 18px;
      font-size: 6.6pt; color: #424245; line-height: 1.18;
    }
    .program-item { display: block; margin-bottom: 2px; }
    /* FOOTER */
    .footer {
      border-top: 1px solid #e5e5ea; padding-top: 12px;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .qr-block { display: flex; align-items: center; gap: 10px; }
    .qr-code { width: 72px; height: 72px; }
    .qr-info { font-size: 7pt; color: #6e6e73; line-height: 1.5; }
    .sig-box {
      text-align: right; border: 1px solid #0071e3; padding: 10px 14px;
      border-radius: 10px; background: #fbfbfd;
    }
    .sig-box strong { font-size: 8.5pt; color: #1d1d1f; display: block; }
    .sig-box span { font-size: 7.5pt; color: #6e6e73; }
  </style>
</head>
<body>
<div class="cert-page">
  <!-- HEADER -->
  <div class="header">
    <img src="{{logo_url}}" alt="Logo" />
  </div>

  <!-- TÍTULO -->
  <div>
    <div class="main-title">Certificado</div>
    <div class="main-sub">Certificamos que o(a) profissional abaixo concluiu com aproveitamento o treinamento:</div>
  </div>

  <!-- DADOS DO FUNCIONÁRIO -->
  <div class="info-grid">
    <div class="info-item">
      <div class="label">Funcionário</div>
      <div class="value">{{nome_funcionario}}</div>
    </div>
    <div class="info-item">
      <div class="label">CANAC / Matrícula</div>
      <div class="value">{{codigo_anac}} &nbsp;·&nbsp; {{matricula}}</div>
    </div>
    <div class="info-item">
      <div class="label">Data de Conclusão</div>
      <div class="value">{{data_conclusao}}</div>
    </div>
    <div class="info-item">
      <div class="label">Validade</div>
      <div class="value">{{data_vencimento}}</div>
    </div>
  </div>

  {{instrutor_section}}

  <!-- QUALIFICAÇÃO -->
  <div class="training-box">
    <div class="qual-name">{{nome_qualificacao}}</div>
    <div class="qual-meta">Carga Horária: {{carga_horaria}}h &nbsp;·&nbsp; Categoria: {{categoria}} &nbsp;·&nbsp; Código: {{codigo_qualificacao}}</div>
  </div>

  <!-- CONTEÚDO PROGRAMÁTICO NR-1 -->
  <div class="program-section">
    <div class="program-label">Conteúdo Programático</div>
    <div class="program-content">{{conteudo}}</div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="qr-block">
      <img src="{{qr_code_data_url}}" class="qr-code" alt="QR Code" />
      <div class="qr-info">
        <strong>Nº {{numero_certificado}}</strong><br />
        ID: {{hash_id}}<br />
        Validação Digital AirTrust
      </div>
    </div>
    <div class="sig-box">
      <strong>Assinatura Eletrônica Autenticada</strong>
      <span>{{nome_empresa}} — Departamento de Treinamento</span>
    </div>
  </div>
</div>
</body>
</html>`;

// Dados mock para preview do editor de template
const MOCK_TEMPLATE_DATA: Record<string, string> = {
  '{{nome_funcionario}}': 'Ramon Godinho',
  '{{codigo_anac}}': 'ANAC-001234',
  '{{matricula}}': '00264',
  '{{nome_qualificacao}}': 'Operação AW139 — Piloto em Comando',
  '{{codigo_qualificacao}}': 'G1',
  '{{categoria}}': 'Ground',
  '{{carga_horaria}}': '40',
  '{{instrutor_nome}}': 'Negreiros Silva Exemplo',
  '{{instrutor_codigo_anac}}': 'ANAC-009876',
  '{{instrutor_matricula}}': '00123',
  '{{instrutor_section}}':
    '<div class="instructor-section"><div class="instructor-name-block"><span class="instructor-label">Instrutor</span><span class="instructor-name">Negreiros Silva Exemplo</span></div><div class="instructor-meta-block"><span class="instructor-meta-label">CANAC / Matrícula</span><span class="instructor-meta-value">ANAC-009876 &nbsp;·&nbsp; 00123</span></div></div>',
  '{{data_conclusao}}': '25/03/2026',
  '{{data_vencimento}}': '25/03/2027',
  '{{numero_certificado}}': 'CERT-00264-G1-20260325-ab12cd34',
  '{{hash_id}}': 'AB12CD34EF56',
  '{{nome_empresa}}': 'AirTrust Aviation',
  '{{logo_url}}':
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjQwIiB2aWV3Qm94PSIwIDAgMTIwIDQwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iNDAiIHJ4PSI4IiBmaWxsPSIjMDA3MWUzIi8+PHRleHQgeD0iMTAiIHk9IjI2IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiNmZmYiPkFpclRydXN0PC90ZXh0Pjwvc3ZnPg==',
  '{{qr_code_data_url}}':
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIHZpZXdCb3g9IjAgMCA3MiA3MiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIGZpbGw9IiNmNWY1ZjciIHJ4PSI0Ii8+PHRleHQgeD0iMzYiIHk9IjQwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ibW9ub3NwYWNlIiBmb250LXNpemU9IjEwIiBmaWxsPSIjNmU2ZTczIj5RUiBDb2RlPC90ZXh0Pjwvc3ZnPg==',
  '{{conteudo}}':
    '<span class="program-item">• Regulamentos de Aeronavegabilidade</span><span class="program-item">• Performance e Limitações da Aeronave</span><span class="program-item">• Sistemas e Equipamentos AW139</span><span class="program-item">• Procedimentos de Emergência</span><span class="program-item">• Método SRM / CRM</span><span class="program-item">• Navegação Aerodinâmica</span><span class="program-item">• Meteorologia e NOTAM</span><span class="program-item">• NR-1: Gerenciamento de Riscos</span>',
};

function applyMockData(template: string): string {
  return Object.entries(MOCK_TEMPLATE_DATA).reduce(
    (html, [key, value]) => html.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value),
    template,
  );
}

function ensureInstrutorPlaceholderInTemplate(template: string): string {
  if (!template.trim()) {
    return template;
  }
  const hasInstrutorPlaceholder = template.includes('{{instrutor_section}}');

  const style = `
    .instructor-section {
      border: 1px solid #dbeafe; background: #eff6ff; border-radius: 9px;
      padding: 7px 10px; display: grid; grid-template-columns: minmax(0, 1fr) auto;
      align-items: center; gap: 8px 14px; min-height: 0;
    }
    .instructor-name-block, .instructor-meta-block {
      display: flex; align-items: center; gap: 7px; min-width: 0;
    }
    .instructor-label, .instructor-meta-label {
      color: #64748b; font-size: 7.1pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: .45px; white-space: nowrap;
    }
    .instructor-name, .instructor-meta-value {
      color: #1d1d1f; font-size: 9pt; font-weight: 700; line-height: 1.15;
    }
`;

  let result = template;
  if (!result.includes('instructor-section')) {
    result = /<\/style>/i.test(result)
      ? result.replace(/<\/style>/i, `${style}\n  </style>`)
      : `<style>${style}</style>${result}`;
  }

  if (hasInstrutorPlaceholder) {
    return result;
  }

  if (result.includes('</div>\n\n  <!-- QUALIFICAÇÃO -->')) {
    return result.replace(
      '</div>\n\n  <!-- QUALIFICAÇÃO -->',
      '</div>\n\n  {{instrutor_section}}\n\n  <!-- QUALIFICAÇÃO -->',
    );
  }

  if (/<div[^>]+class=["'][^"']*training-box[^"']*["']/i.test(result)) {
    return result.replace(
      /(<div[^>]+class=["'][^"']*training-box[^"']*["'][^>]*>)/i,
      '{{instrutor_section}}\n\n  $1',
    );
  }

  return /<\/body>/i.test(result)
    ? result.replace(/<\/body>/i, '{{instrutor_section}}</body>')
    : `${result}\n{{instrutor_section}}`;
}

export function EmpresaForm({
  empresaId,
  isSelfEdit = false,
  onSuccess,
  onCancel,
}: EmpresaFormProps) {
  const [activeTab, setActiveTab] = useState<'geral' | 'sistema' | 'certificados'>('geral');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<EmpresaData>(emptyData);
  const [logoPreviewError, setLogoPreviewError] = useState(false);

  // Upload states
  const [uploadingLogoEmpresa, setUploadingLogoEmpresa] = useState(false);

  // Template Modal
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateHtml, setTemplateHtml] = useState('');

  // Preview com mock data — substitui variáveis para mostrar como o certificado ficará
  const previewSrcdoc = applyMockData(templateHtml || DEFAULT_CERTIFICATE_TEMPLATE);

  const getValidToken = async (): Promise<string> => {
    const token = await ensureValidAccessToken();

    if (!token) {
      throw new Error('Sua sessão expirou. Faça login novamente.');
    }

    return token;
  };

  useEffect(() => {
    if (empresaId || isSelfEdit) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, isSelfEdit]);

  useEffect(() => {
    setLogoPreviewError(false);
  }, [data.logo_url]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = await getValidToken();
      // Se for self edit, usa /minha, senão usa /empresas/:id (que precisa buscar config tb)

      let url = '';
      if (isSelfEdit) {
        url = `${API_BASE_URL}/empresas/minha`;
      } else if (empresaId) {
        // Backend agora retorna dados completos (incluindo config) neste endpoint
        url = `${API_BASE_URL}/empresas/${empresaId}`;
      }

      if (url) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();

        if (json.success) {
          setData(json.data);

          const resolvedEmpresaId = json.data.id || empresaId || (isSelfEdit ? 1 : null);
          if (resolvedEmpresaId) {
            const configRes = await fetch(`${API_BASE_URL}/empresas/${resolvedEmpresaId}/config`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const configJson = await configRes.json();
            if (configJson.success) {
              setTemplateHtml(
                ensureInstrutorPlaceholderInTemplate(
                  configJson.data?.certificado_template_html || '',
                ),
              );
            } else {
              setTemplateHtml(
                ensureInstrutorPlaceholderInTemplate(json.data.certificado_template_html || ''),
              );
            }
          } else {
            setTemplateHtml(
              ensureInstrutorPlaceholderInTemplate(json.data.certificado_template_html || ''),
            );
          }
        } else {
          toast.error(json.error || 'Erro ao carregar dados');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = await getValidToken();

      // Validações básicas
      if (!data.nome) return toast.error('Nome é obrigatório');
      if (!isSelfEdit && !data.codigo) return toast.error('Código é obrigatório');

      // 1. Salvar dados da empresa (tabela empresas)
      /* 
         Se for edição e selfEdit, usamos PUT /empresas/:id (nome, cnpj apenas?)
         Se for admin, pode editar tudo.
      */

      const empresaPayload: Record<string, string | number | null | undefined> = {
        nome: data.nome,
        cnpj: data.cnpj,
        dominio: data.dominio,
      };

      if (!isSelfEdit) {
        // Admin payloads
        empresaPayload.codigo = data.codigo; // Apenas create? Backend ignora se update?
        empresaPayload.plano = data.plano;
        empresaPayload.max_funcionarios = data.max_funcionarios;
        empresaPayload.max_storage_mb = data.max_storage_mb;
        empresaPayload.ativo = data.ativo;
      }

      // Criar ou Atualizar Empresa Base
      let savedId = data.id || empresaId;

      // Fallback: se for self-edit e não tiver ID (404 inicial), assumir ID 1 (Admin/System)
      // Isso permite salvar/recuperar a empresa principal mesmo se o loadData falhou
      if (isSelfEdit && !savedId) {
        savedId = 1;
      }

      if (!savedId && !isSelfEdit) {
        // Create
        const res = await fetch(`${API_BASE_URL}/empresas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(empresaPayload),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Erro ao criar empresa');
        savedId = json.data.id; // Supondo que retorna ID
      } else if (savedId) {
        // Update
        const res = await fetch(`${API_BASE_URL}/empresas/${savedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(empresaPayload),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Erro ao atualizar empresa');
      }

      // 2. Salvar Configurações (Certificados, etc) na tabela empresas_config
      // Endpoint PUT /empresas/:id/config
      const configPayload = {
        certificado_template_html: templateHtml,
        cores_tema: data.cores_tema,
        // Enviar todos os campos de config para evitar data loss
        dias_alerta_vencimento: data.dias_alerta_vencimento,
        email_notificacoes: data.email_notificacoes,
        webhook_url: data.webhook_url,
        timezone: data.timezone,
        logo_relatorio: data.logo_relatorio,
        modulos_ativos: data.modulos_ativos,
      };

      if (savedId) {
        const resConfig = await fetch(`${API_BASE_URL}/empresas/${savedId}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(configPayload),
        });
        const jsonConfig = await resConfig.json().catch(() => ({}));
        if (!resConfig.ok || !jsonConfig.success) {
          throw new Error(jsonConfig.error || 'Erro ao salvar configurações da empresa');
        }
      }

      // Update state with saved ID to allow uploads immediately
      if (savedId) {
        setData((prev) => ({ ...prev, id: savedId ?? undefined }));
      }

      toast.success(isSelfEdit ? 'Dados atualizados!' : 'Empresa salva com sucesso!');
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    const targetId = data.id || empresaId || (isSelfEdit ? 1 : undefined);

    if (!targetId) {
      toast.error('Salve a empresa antes de persistir o template');
      return;
    }

    try {
      setSaving(true);
      const token = await getValidToken();
      const res = await fetch(`${API_BASE_URL}/empresas/${targetId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          certificado_template_html: templateHtml,
          certificado_logo_url: data.certificado_logo_url || null,
          timezone: data.timezone,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Erro ao salvar template');
      }

      toast.success('Template salvo com sucesso');
      setShowTemplateEditor(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (target: 'empresa' | 'certificado', file: File) => {
    // Tenta usar o ID do estado ou da prop
    const id = data.id || empresaId;

    if (!id) {
      return toast.error('Salve a empresa antes de enviar o logo');
    }

    // Bloqueia upload de certificado (agora unificado)
    if (target === 'certificado') {
      return toast.info('O logo do certificado é o mesmo da empresa. Altere na aba Dados Gerais.');
    }

    try {
      setUploadingLogoEmpresa(true);

      const token = await ensureValidAccessToken();
      if (!token) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}/empresas/${id}/logo?target=${target}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok && res.status === 413) {
        toast.error('Arquivo muito grande. Máximo 2MB.');
        return;
      }

      const json = await res.json();

      if (json.success) {
        toast.success('Logo atualizado!');
        setLogoPreviewError(false);
        setData((prev) => ({ ...prev, logo_url: json.data.logo_url }));
      } else {
        toast.error(json.error || 'Erro no upload');
      }
    } catch (err) {
      console.error('[handleUpload]', err);
      toast.error('Erro ao enviar logo. Verifique a conexão e tente novamente.');
    } finally {
      setUploadingLogoEmpresa(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm flex flex-col h-full max-h-[80vh]">
      {/* Header Tabs */}
      <div className="flex border-b border-gray-200 px-6 pt-4 gap-6">
        <button
          onClick={() => setActiveTab('geral')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
            ${
              activeTab === 'geral'
                ? 'border-primary text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          <Building2 size={16} /> Dados Gerais
        </button>
        {!isSelfEdit && (
          <button
            onClick={() => setActiveTab('sistema')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
              ${
                activeTab === 'sistema'
                  ? 'border-primary text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            <Settings size={16} /> Sistema & Limites
          </button>
        )}
        <button
          onClick={() => setActiveTab('certificados')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
            ${
              activeTab === 'certificados'
                ? 'border-primary text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          <FileText size={16} /> Aparência e Certificados
        </button>
      </div>

      <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
        {/* TAB GERAL */}
        {activeTab === 'geral' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo Empresa */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo da Empresa (Painel)
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden relative">
                    {data.logo_url && !logoPreviewError ? (
                      <img
                        key={data.logo_url}
                        src={getLogoUrl(data.logo_url)}
                        className="w-full h-full object-contain"
                        alt="Logo"
                        onLoad={() => setLogoPreviewError(false)}
                        onError={() => setLogoPreviewError(true)}
                      />
                    ) : null}
                    <ImageIcon
                      className="text-gray-300 w-8 h-8"
                      style={{ display: data.logo_url && !logoPreviewError ? 'none' : '' }}
                    />
                    {uploadingLogoEmpresa && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <Loader2 className="animate-spin w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      id="upload-empresa"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) =>
                        e.target.files?.[0] && handleUpload('empresa', e.target.files[0])
                      }
                    />
                    <label
                      htmlFor="upload-empresa"
                      className="cursor-pointer px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm inline-flex items-center gap-2"
                    >
                      <Upload size={14} /> Alterar
                    </label>
                  </div>
                </div>
              </div>

              {/* Campos Básicos */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome da Empresa *
                  </label>
                  <input
                    type="text"
                    value={data.nome}
                    onChange={(e) => setData({ ...data, nome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30"
                    placeholder="Nome Exibido"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código (Slug)
                  </label>
                  <input
                    type="text"
                    value={data.codigo}
                    disabled={isSelfEdit || !!data.id}
                    onChange={(e) =>
                      setData({
                        ...data,
                        codigo: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                      })
                    }
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 ${
                      isSelfEdit || data.id ? 'bg-gray-100 text-gray-500' : ''
                    }`}
                    placeholder="codigo-unico"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input
                    type="text"
                    value={data.cnpj || ''}
                    onChange={(e) => setData({ ...data, cnpj: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30"
                    placeholder="00.000.000/0001-00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Domínio de E-mail
                  </label>
                  <input
                    type="text"
                    value={data.dominio || ''}
                    onChange={(e) => setData({ ...data, dominio: e.target.value.toLowerCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30"
                    placeholder="exemplo.com.br"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Campo informativo. Convites e acessos usam o vínculo explícito com a empresa.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB SISTEMA (Admin Only) */}
        {activeTab === 'sistema' && !isSelfEdit && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plano de Assinatura
                </label>
                <select
                  value={data.plano}
                  onChange={(e) =>
                    setData({ ...data, plano: e.target.value as EmpresaData['plano'] })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 bg-white"
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={data.ativo}
                  onChange={(e) => setData({ ...data, ativo: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 bg-white"
                >
                  <option value={1}>Ativo</option>
                  <option value={0}>Inativo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Limite de Usuários
                </label>
                <input
                  type="number"
                  value={data.max_funcionarios}
                  onChange={(e) => setData({ ...data, max_funcionarios: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Storage Limite (MB)
                </label>
                <input
                  type="number"
                  value={data.max_storage_mb}
                  onChange={(e) => setData({ ...data, max_storage_mb: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB CERTIFICADOS */}
        {activeTab === 'certificados' && (
          <div className="space-y-5">
            {/* Logo Certificado */}
            {/* Logo Certificado (Removido - usa logo principal) */}
            {/* <div>
               <h3 className="text-sm font-semibold text-gray-900 mb-3">Logo para Certificados</h3>
               ...
            </div> */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                O logo utilizado nos certificados será o mesmo logo principal da empresa configurado
                na aba "Dados Gerais".
              </p>
            </div>

            <hr className="border-gray-100" />

            {/* Template */}
            <div>
              <div className="flex justify-between items-end mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Template HTML</h3>
                  <p className="text-xs text-gray-500 mt-1">Personalize o layout do certificado.</p>
                </div>
                <button
                  onClick={() => setShowTemplateEditor(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Edit2 size={14} /> Editar Template
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-xs text-slate-600 max-h-32 overflow-hidden relative">
                {templateHtml
                  ? templateHtml.slice(0, 300) + '...'
                  : '// Nenhum template configurado'}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-50 to-transparent"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save size={16} />}
          {isSelfEdit ? 'Salvar Alterações' : data.id ? 'Atualizar Empresa' : 'Criar Empresa'}
        </button>
      </div>

      {/* MODAL TEMPLATE - Expandido para tela cheia */}
      {showTemplateEditor && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-2">
          <div className="bg-white rounded-xl shadow-2xl w-full h-full max-w-[98vw] max-h-[98vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-semibold text-lg">Editor de Template de Certificado</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Personalize o layout do certificado usando HTML e variáveis
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    // Template padrão baseado no modelo Costa do Sol
                    setTemplateHtml(DEFAULT_CERTIFICATE_TEMPLATE);
                  }}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Carregar Template Padrão
                </button>
                <button onClick={() => setShowTemplateEditor(false)}>
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden min-h-0">
              <div className="flex flex-col min-h-0">
                <label className="text-sm font-medium mb-2">HTML do Template</label>
                <textarea
                  value={templateHtml}
                  onChange={(e) => setTemplateHtml(e.target.value)}
                  className="flex-1 w-full p-4 border border-gray-200 rounded-lg font-mono text-xs focus:ring-2 focus:ring-primary/30 resize-none overflow-auto"
                  placeholder="<html>...</html>"
                  style={{ minHeight: '400px' }}
                />
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-semibold text-blue-800 mb-2">Variáveis Disponíveis:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-blue-700">
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{nome_funcionario}}'}</code>{' '}
                      Nome completo
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{codigo_anac}}'}</code> Código
                      ANAC
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{nome_qualificacao}}'}</code>{' '}
                      Nome da qualificação
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{codigo_qualificacao}}'}</code>{' '}
                      Código
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{categoria}}'}</code> Categoria
                      da qualificação
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{conteudo}}'}</code>{' '}
                      Conteúdo/Módulos
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{carga_horaria}}'}</code> Carga
                      horária
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{instrutor_section}}'}</code>{' '}
                      Bloco do instrutor, preenchido apenas para treinamentos de voo/solo
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{instrutor_nome}}'}</code> Nome
                      do instrutor quando aplicável
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">
                        {'{{instrutor_codigo_anac}}'}
                      </code>{' '}
                      Código ANAC do instrutor
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{instrutor_matricula}}'}</code>{' '}
                      Matrícula do instrutor
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{data_conclusao}}'}</code> Data
                      de conclusão
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{data_vencimento}}'}</code> Data
                      de vencimento
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{logo_url}}'}</code> URL do logo
                    </span>
                    <span>
                      <code className="bg-blue-100 px-1 rounded">{'{{nome_empresa}}'}</code> Nome da
                      empresa
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col bg-gray-50 rounded-lg border border-gray-200 overflow-hidden min-h-0">
                <div className="p-2 bg-gray-200 text-xs font-semibold text-gray-600 text-center shrink-0">
                  Preview em tempo real — dados de exemplo
                </div>
                {/* iframe srcdoc renderiza o HTML + CSS do template corretamente,
                    incluindo <style> tags, ao contrário de dangerouslySetInnerHTML
                    que é sanitizado pelo DOMPurify e perde as regras CSS. */}
                <iframe
                  srcDoc={previewSrcdoc}
                  title="Preview do certificado"
                  sandbox="allow-same-origin"
                  className="flex-1 w-full border-none"
                  style={{ minHeight: '480px' }}
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowTemplateEditor(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving}
                className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
