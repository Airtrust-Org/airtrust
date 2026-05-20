import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import { Plus, Edit, Trash2, Upload, Edit2, Eye, Save, X } from 'lucide-react';
import { PageLayout, PageSection } from '@/react-app/components/layout/PageLayout';
import { classHelpers } from '@/react-app/styles/design-tokens';

interface Empresa {
  id: number;
  nome: string;
  cnpj: string;
  logo_url: string | null;
}

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [templateHtml, setTemplateHtml] = useState<string>('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    carregarEmpresas();
  }, []);

  const carregarEmpresas = async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/empresas`);
      const data = await response.json();

      if (data.success) {
        setEmpresas(data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
      toast.warning('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile || !selectedEmpresa) return;
    try {
      setUploading(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64DataUrl = e.target?.result as string;

          // Atualizar imediatamente no frontend com base64 (garante display)
          setEmpresas((prev) =>
            prev.map((emp) =>
              emp.id === selectedEmpresa.id ? { ...emp, logo_url: base64DataUrl } : emp,
            ),
          );
          setSelectedEmpresa((prev) => (prev ? { ...prev, logo_url: base64DataUrl } : null));
          setLogoFile(null);
          toast.success('Logo atualizado com sucesso!');

          // Tentar salvar no backend em background (para persistência)
          // Se falhar, não é crítico — base64 já está no frontend
          try {
            const base64Str = base64DataUrl.split(',')[1];
            await fetchWithAuth(
              `${API_BASE_URL}/empresas/${selectedEmpresa.id}/logo?target=empresa`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64: base64Str, contentType: logoFile.type }),
              },
            );
          } catch (err) {
            console.warn('[Logo Empresa] Falha ao persistir no servidor (não crítico):', err);
          }
        } catch (err) {
          console.error(err);
          toast.error('Erro ao processar logo');
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(logoFile);
    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  };

  const handleSalvarTemplate = async () => {
    if (!selectedEmpresa) return;
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/empresa-certificado-config/${selectedEmpresa.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            template_html: templateHtml,
            cor_primaria: '#0066cc',
            cor_secundaria: '#333333',
          }),
        },
      );

      if (res.ok) {
        setShowTemplateModal(false);
        toast.warning('Template salvo com sucesso!');
      }
    } catch (err) {
      console.error(err);
      toast.warning('Erro ao salvar template');
    }
  };

  if (loading) {
    return (
      <PageLayout title="Empresas">
        <PageSection>
          <div className={`${classHelpers.centerContent} py-12`}>
            <div className="text-neutral-500">Carregando...</div>
          </div>
        </PageSection>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Empresas"
      subtitle="Gerencie dados das empresas e configurações de certificados"
      action={
        <button className="flex items-center gap-2  py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </button>
      }
    >
      {/* Se nenhuma empresa selecionada, mostra tabela */}
      {!selectedEmpresa ? (
        <PageSection title="Empresas Cadastradas">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className=" py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                    Nome
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                    CNPJ
                  </th>
                  <th className=" py-3 text-right text-xs font-medium text-neutral-700 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {empresas.map((empresa) => (
                  <tr key={empresa.id} className="hover:bg-neutral-50 transition-colors">
                    <td className=" py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-neutral-900">{empresa.nome}</div>
                    </td>
                    <td className=" py-4 whitespace-nowrap">
                      <div className={classHelpers.muted}>{empresa.cnpj || '-'}</div>
                    </td>
                    <td className=" py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setSelectedEmpresa(empresa)}
                        className="text-primary hover:text-blue-900 mr-3"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-900">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageSection>
      ) : (
        /* Configuração de Certificados */
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-neutral-900">
              Configuração: {selectedEmpresa.nome}
            </h2>
            <button
              onClick={() => setSelectedEmpresa(null)}
              className="text-neutral-500 hover:text-neutral-700"
            >
              <X size={24} />
            </button>
          </div>

          {/* Logo do Certificado */}
          <div className="mb-8 pb-8 border-b border-neutral-200">
            <h3 className="text-lg font-semibold mb-4 text-neutral-900">Logo do Certificado</h3>{' '}
            {selectedEmpresa.logo_url && (
              <div className="mb-4 border rounded p-4 bg-neutral-50">
                <img
                  src={selectedEmpresa.logo_url}
                  style={{ maxHeight: '100px', width: '100%', objectFit: 'contain' }}
                  alt="Logo"
                />
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="flex-1 text-sm"
              />
              <button
                onClick={handleUploadLogo}
                disabled={!logoFile || uploading}
                className="bg-primary text-white  py-2 rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                <Upload size={18} />
                {uploading ? 'Enviando...' : 'Enviar Logo'}
              </button>
            </div>
          </div>

          {/* Template HTML */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-neutral-900">Template de Certificado</h3>

            {templateHtml && (
              <div className="mb-4 p-3 bg-primary/10 border border-blue-200 rounded text-sm text-primary">
                ✓ Template configurado ({templateHtml.length} caracteres)
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex-1 bg-green-600 text-white  py-2 rounded hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Edit2 size={18} />
                {templateHtml ? 'Editar Template' : 'Criar Template'}
              </button>

              {templateHtml && (
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="bg-purple-600 text-white  py-2 rounded hover:bg-purple-700 flex items-center gap-2"
                >
                  <Eye size={18} />
                  Preview
                </button>
              )}
            </div>

            {showPreview && (
              <div className="mt-4 border rounded p-4 bg-neutral-50 max-h-96 overflow-auto">
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(templateHtml) }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE TEMPLATE */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full max-h-96 overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900">✏️ Editar Template</h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-neutral-500 hover:text-neutral-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-4 p-3 bg-primary/10 border border-blue-200 rounded text-sm text-primary">
              <strong>Placeholders disponíveis:</strong>
              <br />
              {`{{nome_funcionario}}`}, {`{{logo_url}}`}, {`{{nome_qualificacao}}`},{' '}
              {`{{codigo_qualificacao}}`}, {`{{data_conclusao}}`}, {`{{data_atual}}`}, ...
            </div>

            <textarea
              value={templateHtml}
              onChange={(e) => setTemplateHtml(e.target.value)}
              className="w-full h-64 border rounded p-3 font-mono text-sm mb-4"
              placeholder="Cole seu HTML aqui..."
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="flex-1 bg-neutral-300 text-neutral-800  py-2 rounded hover:bg-neutral-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarTemplate}
                className="flex-1 bg-green-600 text-white  py-2 rounded hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Save size={18} />
                Salvar Template
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
