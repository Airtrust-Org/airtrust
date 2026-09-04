/**
 * CRUD DE MODELOS DE SESSAO
 *
 * Tela legada mantida por compatibilidade, agora integrada ao contrato moderno
 * de modelos-sessao.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Link, List, Plus, Trash2 } from 'lucide-react';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { confirmDialog, showAlertDialog } from '@/react-app/utils/confirmDialog';

import ImportarRelacoesInteligente from '../../components/ImportarRelacoes';
import { Badge, EmptyState, SimuladoresCard } from '../../components/SimuladoresLayout';

interface Modelo {
  id: number;
  codigo: string;
  codigo_canonico?: string | null;
  nome: string;
  tipo: 'INICIAL' | 'RECORRENTE';
  duracao_minutos: number;
  total_manobras?: number;
  descricao?: string;
}

interface Manobra {
  id: number;
  codigo: string;
  descricao: string;
  categoria: string;
  ordem: number;
  obrigatoria?: number;
}

interface ManobraDisponivel {
  id: number;
  codigo: string;
  descricao: string;
  categoria: string;
}

interface Props {
  onBack?: () => void;
}

function normalizarTipoModelo(valor: unknown): 'INICIAL' | 'RECORRENTE' {
  const normalized = String(valor || '')
    .trim()
    .toUpperCase();

  return normalized.includes('REC') ? 'RECORRENTE' : 'INICIAL';
}

function normalizarModelo(raw: Record<string, unknown>): Modelo {
  return {
    id: Number(raw.id || 0),
    codigo: String(raw.codigo || ''),
    nome: String(raw.nome || ''),
    tipo: normalizarTipoModelo(raw.tipo_sessao_codigo || raw.tipo_sessao_nome || raw.tipo),
    duracao_minutos: Number(raw.duracao_estimada || raw.duracao_minutos || 120),
    total_manobras: Number(raw.total_manobras || 0),
    descricao: raw.descricao ? String(raw.descricao) : '',
  };
}

function normalizarManobra(raw: Record<string, unknown>): Manobra {
  return {
    id: Number(raw.manobra_id || raw.id || 0),
    codigo: String(raw.manobra_codigo || raw.codigo || ''),
    descricao: String(raw.manobra_descricao || raw.manobra_nome || raw.descricao || ''),
    categoria: String(raw.manobra_categoria || raw.categoria || ''),
    ordem: Number(raw.ordem || 0),
    obrigatoria: Number(raw.obrigatoria || 0),
  };
}

function buildModeloPayload(formData: Partial<Modelo>) {
  return {
    codigo: String(formData.codigo || '').trim(),
    nome: String(formData.nome || '').trim(),
    descricao: String(formData.descricao || '').trim() || null,
    duracao_estimada: Number(formData.duracao_minutos || 120),
  };
}

export default function CrudModelos({ onBack }: Props = {}) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'edit' | 'manobras' | 'importar'>('list');
  const [modeloSelecionado, setModeloSelecionado] = useState<Modelo | null>(null);
  const [manobrasDoModelo, setManobrasDoModelo] = useState<Manobra[]>([]);
  const [manobrasDisponiveis, setManobrasDisponiveis] = useState<ManobraDisponivel[]>([]);
  const [showAddManobra, setShowAddManobra] = useState(false);
  const [manobraSelecionada, setManobraSelecionada] = useState<number | null>(null);
  const [editando, setEditando] = useState<Modelo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState<Partial<Modelo>>({
    codigo: '',
    nome: '',
    tipo: 'INICIAL',
    duracao_minutos: 120,
    descricao: '',
  });

  useEffect(() => {
    carregarModelos();
  }, []);

  const carregarModelos = async () => {
    try {
      setLoading(true);
      const cacheBuster = `?_t=${Date.now()}`;
      const token = getAccessToken();

      const response = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao${cacheBuster}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar modelos');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Erro ao carregar modelos');
      }

      const modelosBase = (data.data || []).map((item: Record<string, unknown>) =>
        normalizarModelo(item),
      );

      const modelosComContagem = await Promise.all(
        modelosBase.map(async (modelo: Modelo) => {
          const manobrasResponse = await fetch(
            `${API_BASE_URL}/simuladores/modelos-sessao/${modelo.id}/manobras${cacheBuster}`,
            {
              headers: {
                'Cache-Control': 'no-cache',
                Authorization: token ? `Bearer ${token}` : '',
              },
            },
          );

          if (!manobrasResponse.ok) {
            return modelo;
          }

          const manobrasData = await manobrasResponse.json();
          return {
            ...modelo,
            total_manobras: manobrasData.data?.length || 0,
          };
        }),
      );

      setModelos(modelosComContagem);
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
      toast.warning(error instanceof Error ? error.message : 'Erro ao carregar modelos');
    } finally {
      setLoading(false);
    }
  };

  const abrirFormulario = (modelo?: Modelo) => {
    if (modelo) {
      setEditando(modelo);
      setFormData(modelo);
    } else {
      setEditando(null);
      setFormData({
        codigo: '',
        nome: '',
        tipo: 'INICIAL',
        duracao_minutos: 120,
        descricao: '',
      });
    }

    setView('edit');
  };

  const voltarParaLista = () => {
    setView('list');
    setEditando(null);
    setModeloSelecionado(null);
    setManobrasDoModelo([]);
    setShowAddManobra(false);
    setManobraSelecionada(null);
  };

  const verManobras = async (modelo: Modelo) => {
    setModeloSelecionado(modelo);
    setView('manobras');

    try {
      const cacheBuster = `?_t=${Date.now()}`;
      const token = getAccessToken();
      const response = await fetch(
        `${API_BASE_URL}/simuladores/modelos-sessao/${modelo.id}/manobras${cacheBuster}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            Authorization: token ? `Bearer ${token}` : '',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Erro ao carregar manobras');
      }

      const data = await response.json();
      setManobrasDoModelo(
        (data.data || []).map((item: Record<string, unknown>) => normalizarManobra(item)),
      );
    } catch (error) {
      console.error('Erro ao carregar manobras:', error);
      toast.warning(error instanceof Error ? error.message : 'Erro ao carregar manobras');
    }
  };

  const salvar = async () => {
    if (!formData.codigo || !formData.nome) {
      toast.warning('Preencha os campos obrigatorios: codigo e nome');
      return;
    }

    try {
      setSalvando(true);

      const method = editando ? 'PUT' : 'POST';
      const url = editando
        ? `${API_BASE_URL}/simuladores/modelos-sessao/${editando.id}`
        : `${API_BASE_URL}/simuladores/modelos-sessao`;

      const token = getAccessToken();
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(buildModeloPayload(formData)),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao salvar modelo');
      }

      showAlertDialog(editando ? 'Modelo atualizado com sucesso!' : 'Modelo criado com sucesso!');
      voltarParaLista();
      carregarModelos();
    } catch (error) {
      console.error('Erro ao salvar modelo:', error);
      toast.warning(error instanceof Error ? error.message : 'Erro ao salvar modelo');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Tem certeza que deseja excluir este modelo?'))) {
      return;
    }

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao excluir modelo');
      }

      toast.warning('Modelo excluido com sucesso!');
      carregarModelos();
    } catch (error) {
      console.error('Erro ao excluir modelo:', error);
      toast.warning(error instanceof Error ? error.message : 'Erro ao excluir modelo');
    }
  };

  const clonar = async (id: number) => {
    if (!(await confirmDialog('Deseja clonar este modelo?'))) {
      return;
    }

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${id}/clonar`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao clonar modelo');
      }

      toast.warning('Modelo clonado!');
      carregarModelos();
    } catch (error) {
      console.error('Erro ao clonar modelo:', error);
      toast.warning(error instanceof Error ? error.message : 'Erro ao clonar modelo');
    }
  };

  const carregarManobrasDisponiveis = async () => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/manobras`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar manobras disponiveis');
      }

      const data = await response.json();
      setManobrasDisponiveis(data.data || []);
    } catch (error) {
      console.error('Erro ao carregar manobras disponiveis:', error);
      toast.warning(
        error instanceof Error ? error.message : 'Erro ao carregar manobras disponiveis',
      );
    }
  };

  const adicionarManobra = async () => {
    if (!manobraSelecionada || !modeloSelecionado) {
      return;
    }

    try {
      const token = getAccessToken();
      const response = await fetch(
        `${API_BASE_URL}/simuladores/modelos-sessao/${modeloSelecionado.id}/manobras`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({
            manobras: [{ manobra_id: manobraSelecionada, obrigatoria: 0 }],
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao adicionar manobra');
      }

      setShowAddManobra(false);
      setManobraSelecionada(null);
      verManobras(modeloSelecionado);
      carregarModelos();
    } catch (error) {
      console.error('Erro ao adicionar manobra:', error);
      toast.warning(error instanceof Error ? error.message : 'Erro ao adicionar manobra');
    }
  };

  const removerManobra = async (manobraId: number) => {
    if (!(await confirmDialog('Deseja remover esta manobra do modelo?'))) {
      return;
    }

    if (!modeloSelecionado) {
      return;
    }

    try {
      const token = getAccessToken();
      const response = await fetch(
        `${API_BASE_URL}/simuladores/modelos-sessao/${modeloSelecionado.id}/manobras/${manobraId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao remover manobra');
      }

      verManobras(modeloSelecionado);
      carregarModelos();
    } catch (error) {
      console.error('Erro ao remover manobra:', error);
      toast.warning(error instanceof Error ? error.message : 'Erro ao remover manobra');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (view === 'importar') {
    return (
      <ImportarRelacoesInteligente
        endpoint="/simuladores/modelos-sessao/importar-relacoes"
        title="Importar Relacoes Modelo-Manobra"
        description="Crie ou atualize vinculos entre modelos de sessao e manobras a partir de uma planilha XLSX."
        onBack={voltarParaLista}
        onImportSuccess={() => {
          carregarModelos();
          setView('list');
          showAlertDialog('Importacao concluida com sucesso.');
        }}
      />
    );
  }

  return (
    <>
      {view === 'list' && (
        <div className="space-y-4">
          <div className="mb-4 flex justify-end gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            )}

            <button
              onClick={() => setView('importar')}
              className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"
            >
              <Link className="h-4 w-4" />
              Importar Relacoes
            </button>

            <button
              onClick={() => abrirFormulario()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Novo Modelo
            </button>
          </div>

          <SimuladoresCard padding="none">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-700">
                    Codigo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-700">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-700">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-slate-700">
                    Duracao
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-slate-700">
                    Manobras
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-700">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {modelos.map((modelo) => (
                  <tr key={modelo.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {modelo.codigo_canonico || modelo.codigo}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{modelo.nome}</td>
                    <td className="px-4 py-3">
                      <Badge variant={modelo.tipo === 'INICIAL' ? 'info' : 'success'}>
                        {modelo.tipo}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">
                      {modelo.duracao_minutos} min
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <List className="h-3.5 w-3.5" />
                        {modelo.total_manobras || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => verManobras(modelo)}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-1 text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        >
                          Ver Manobras
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirFormulario(modelo)}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-1 text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => clonar(modelo.id)}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        >
                          Clonar
                        </button>
                        <RowActionsMenu
                          label={`Mais ações para ${modelo.codigo_canonico || modelo.codigo}`}
                          actions={[
                            {
                              label: 'Excluir modelo',
                              destructive: true,
                              icon: Trash2,
                              onSelect: () => excluir(modelo.id),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {modelos.length === 0 && (
              <div className="p-12">
                <EmptyState
                  icon={<FileText className="h-12 w-12" />}
                  title="Nenhum modelo encontrado"
                  description='Clique em "Novo Modelo" para criar um.'
                />
              </div>
            )}
          </SimuladoresCard>
        </div>
      )}

      {view === 'edit' && (
        <div className="space-y-4">
          <div className="mb-4 flex justify-end gap-2">
            <button
              onClick={voltarParaLista}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </div>

          <SimuladoresCard padding="md">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Codigo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.codigo || ''}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Ex: S001"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
                  <select
                    value={formData.tipo || 'INICIAL'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tipo: e.target.value as 'INICIAL' | 'RECORRENTE',
                      })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="INICIAL">INICIAL</option>
                    <option value="RECORRENTE">RECORRENTE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nome || ''}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Ex: Sessao Inicial AW139"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Duracao (minutos) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.duracao_minutos || 120}
                  onChange={(e) =>
                    setFormData({ ...formData, duracao_minutos: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Descricao</label>
                <textarea
                  value={formData.descricao || ''}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Descricao do modelo de sessao..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={voltarParaLista}
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
                {salvando ? 'Salvando...' : editando ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </SimuladoresCard>
        </div>
      )}

      {view === 'manobras' && modeloSelecionado && (
        <div className="space-y-4">
          <div className="mb-4 flex justify-end gap-2">
            <button
              onClick={async () => {
                await carregarManobrasDisponiveis();
                setShowAddManobra(true);
              }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Adicionar Manobra
            </button>

            <button
              onClick={voltarParaLista}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </div>

          <SimuladoresCard padding="none">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {manobrasDoModelo.length} manobras cadastradas
                </h3>
                <span className="text-xs text-slate-600">
                  Tipo: <strong>{modeloSelecionado.tipo}</strong> • Duracao:{' '}
                  <strong>{modeloSelecionado.duracao_minutos} min</strong>
                </span>
              </div>
            </div>

            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-700">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-700">
                    Codigo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-700">
                    Descricao
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-700">
                    Categoria
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-700">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {manobrasDoModelo.map((manobra) => (
                  <tr key={`${manobra.id}-${manobra.ordem}`} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                      {manobra.ordem}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                      {manobra.codigo}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">{manobra.descricao}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                        {manobra.categoria}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <button
                        onClick={() => removerManobra(manobra.id)}
                        className="font-medium text-red-600 hover:text-red-800"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {manobrasDoModelo.length === 0 && (
              <div className="p-12">
                <EmptyState
                  icon={<FileText className="h-12 w-12" />}
                  title="Nenhuma manobra cadastrada"
                  description="Este modelo ainda nao possui manobras."
                  action={
                    <button
                      onClick={async () => {
                        await carregarManobrasDisponiveis();
                        setShowAddManobra(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar primeira manobra
                    </button>
                  }
                />
              </div>
            )}
          </SimuladoresCard>

          {showAddManobra && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
                <div className="border-b border-slate-200 p-6">
                  <h3 className="text-xl font-bold text-slate-900">Adicionar Manobra</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Selecione uma manobra para adicionar ao modelo
                  </p>
                </div>

                <div className="p-6">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Manobra <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={manobraSelecionada || ''}
                    onChange={(e) => setManobraSelecionada(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Selecione uma manobra...</option>
                    {manobrasDisponiveis
                      .filter((manobra) => !manobrasDoModelo.some((item) => item.id === manobra.id))
                      .map((manobra) => (
                        <option key={manobra.id} value={manobra.id}>
                          {manobra.codigo} - {manobra.descricao} ({manobra.categoria})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-6">
                  <button
                    onClick={() => {
                      setShowAddManobra(false);
                      setManobraSelecionada(null);
                    }}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={adicionarManobra}
                    disabled={!manobraSelecionada}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
