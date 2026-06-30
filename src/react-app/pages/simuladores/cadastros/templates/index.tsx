/**
 * CRUD DE TEMPLATES DE DOCUMENTOS
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { SimuladoresCard, EmptyState, Badge } from '../../components/SimuladoresLayout';
import { Plus, FileText } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Template {
  id: number;
  nome: string;
  tipo: 'FICHA' | 'CERTIFICADO' | 'RELATORIO';
  descricao?: string;
  conteudo?: string;
}

export default function CrudTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [templateEditando, setTemplateEditando] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'FICHA' as 'FICHA' | 'CERTIFICADO' | 'RELATORIO',
    descricao: '',
    conteudo: '',
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarTemplates();
  }, []);

  useEffect(() => {
    if (modalAberto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [modalAberto]);

  const carregarTemplates = async () => {
    try {
      setCarregando(true);
      const response = await fetch(`${API_BASE_URL}/simuladores/templates`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) setTemplates(data.data || []);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setCarregando(false);
    }
  };

  const abrirModal = (template?: Template) => {
    if (template) {
      setTemplateEditando(template);
      setFormData({
        nome: template.nome,
        tipo: template.tipo,
        descricao: template.descricao || '',
        conteudo: template.conteudo || '',
      });
    } else {
      setTemplateEditando(null);
      setFormData({ nome: '', tipo: 'FICHA', descricao: '', conteudo: '' });
    }
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!formData.nome) {
      toast.warning('Por favor, preencha o nome do template');
      return;
    }

    try {
      setSalvando(true);
      const url = templateEditando
        ? `${API_BASE_URL}/simuladores/templates/${templateEditando.id}`
        : `${API_BASE_URL}/simuladores/templates`;

      const response = await fetch(url, {
        method: templateEditando ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.warning(`Template ${templateEditando ? 'atualizado' : 'criado'} com sucesso!`);
        setModalAberto(false);
        carregarTemplates();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.warning(`Erro ao salvar template: ${errorData.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.warning('Não foi possível salvar o template. Verifique a conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Tem certeza que deseja excluir este template?'))) return;

    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/templates/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      if (response.ok) {
        toast.warning('Template excluído com sucesso!');
        carregarTemplates();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.warning(`Erro ao excluir template: ${errorData.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.warning('Não foi possível excluir o template. Verifique a conexão.');
    }
  };

  const getTipoVariant = (tipo: string): 'info' | 'success' | 'neutral' => {
    switch (tipo) {
      case 'FICHA':
        return 'info';
      case 'CERTIFICADO':
        return 'success';
      case 'RELATORIO':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <button
          onClick={() => abrirModal()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Novo Template
        </button>
      </div>
      {!carregando && (
        <SimuladoresCard padding="none">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Descrição
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{tpl.nome}</td>
                  <td className="px-6 py-4">
                    <Badge variant={getTipoVariant(tpl.tipo)}>{tpl.tipo}</Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{tpl.descricao || '-'}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => abrirModal(tpl)}
                      className="text-sm text-primary hover:text-primary/80"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluir(tpl.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {templates.length === 0 && (
            <EmptyState
              icon={<FileText className="w-12 h-12" />}
              title="Nenhum template cadastrado"
              description="Comece criando um novo template de documento."
            />
          )}
        </SimuladoresCard>
      )}

      {/* Modal */}
      {modalAberto && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {templateEditando ? 'Editar Template' : 'Novo Template'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                <select
                  value={formData.tipo}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tipo: e.target.value as 'FICHA' | 'CERTIFICADO' | 'RELATORIO',
                    })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="FICHA">Ficha de Avaliação</option>
                  <option value="CERTIFICADO">Certificado</option>
                  <option value="RELATORIO">Relatório</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Conteúdo HTML
                </label>
                <textarea
                  value={formData.conteudo}
                  onChange={(e) => setFormData({ ...formData, conteudo: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                  rows={10}
                  placeholder="Cole aqui o HTML do template..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
