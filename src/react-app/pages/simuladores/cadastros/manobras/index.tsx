/**
 * CRUD DE MANOBRAS - Padrão do Sistema
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Button } from '@/react-app/components/UI/Button';
import { Input } from '@/react-app/components/UI/Input';
import { ArrowLeft, Plus, Trash2, Upload, Inbox } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';

interface Manobra {
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
  tipo_aeronave?: string;
  descricao?: string;
  nivel_dificuldade?: 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
  tempo_estimado?: number;
  pontuacao_minima?: number;
}

interface Categoria {
  id: number;
  codigo: string;
  nome: string;
}

interface Props {
  onBack?: () => void;
  embedded?: boolean;
}

export default function CrudManobras({ embedded = false, onBack }: Props = {}) {
  const [manobras, setManobras] = useState<Manobra[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Manobra | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState<Partial<Manobra>>({
    codigo: '',
    nome: '',
    categoria: '',
    tipo_aeronave: '',
    descricao: '',
    nivel_dificuldade: 'BASICO',
    tempo_estimado: 0,
    pontuacao_minima: 0,
  });

  useEffect(() => {
    carregarManobras();
    carregarCategorias();
  }, []);

  useEffect(() => {
    carregarManobras();
  }, [filtroCategoria, filtroModelo]);

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal]);

  const _authH = () => {
    const t = getAccessToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const carregarManobras = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroCategoria) params.append('categoria', filtroCategoria);
      if (filtroModelo) params.append('tipo_aeronave', filtroModelo);
      const qs = params.toString();
      const url = `${API_BASE_URL}/simuladores/manobras${qs ? '?' + qs : ''}`;
      const response = await fetch(url, { headers: _authH() });
      if (response.ok) {
        const data = await response.json();
        if (data.success) setManobras(data.data || []);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarCategorias = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/categorias`, { headers: _authH() });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCategorias(data.data || []);
        }
      }
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  // Mapeia código de categoria para seu nome
  const getNomeCategoria = (codigo: string) => {
    const categoria = categorias.find((c) => c.codigo === codigo);
    return categoria ? categoria.nome : codigo;
  };

  const abrirModal = (manobra?: Manobra) => {
    if (manobra) {
      setEditando(manobra);
      setFormData(manobra);
    } else {
      setEditando(null);
      setFormData({
        codigo: '',
        nome: '',
        categoria: '',
        tipo_aeronave: '',
        descricao: '',
        nivel_dificuldade: 'BASICO',
        tempo_estimado: 0,
        pontuacao_minima: 0,
      });
    }
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
  };

  const salvar = async () => {
    if (!formData.codigo || !formData.nome) {
      toast.warning('Preencha código e nome');
      return;
    }

    try {
      setSalvando(true);
      const method = editando ? 'PUT' : 'POST';
      const url = editando
        ? `${API_BASE_URL}/simuladores/manobras/${editando.id}`
        : `${API_BASE_URL}/simuladores/manobras`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ..._authH() },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(editando ? 'Manobra atualizada!' : 'Manobra criada!');
        fecharModal();
        // Atualizar lista imediatamente com novo dado ou recarregar
        await carregarManobras();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Excluir esta manobra?'))) return;
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/manobras/${id}`, {
        method: 'DELETE',
        headers: _authH(),
      });
      if (response.ok) {
        toast.success('Manobra excluída!');
        setManobras((prev) => prev.filter((m) => m.id !== id));
        carregarManobras();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao excluir');
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao excluir');
    }
  };

  const manobrasFiltradas = manobras.filter(
    (m) =>
      m.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      m.nome.toLowerCase().includes(busca.toLowerCase()),
  );

  const getDificuldadeColor = (nivel?: string) => {
    switch (nivel) {
      case 'BASICO':
        return 'bg-green-100 text-green-700';
      case 'INTERMEDIARIO':
        return 'bg-yellow-100 text-yellow-700';
      case 'AVANCADO':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-7 w-40 rounded bg-slate-200 mb-2" />
          <div className="h-4 w-64 rounded bg-slate-100" />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 grid grid-cols-7 gap-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3.5 grid grid-cols-7 gap-4 border-b border-gray-100 dark:border-slate-800">
              {[...Array(7)].map((_, j) => (
                <div key={j} className="h-4 rounded bg-slate-100 dark:bg-slate-800" style={{ width: `${55 + Math.sin(i + j) * 20}%` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {embedded && onBack && (
            <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-1">
              <ArrowLeft className="w-3 h-3" />
              Gestão
            </button>
          )}
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Manobras</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Cadastro de manobras e exercícios</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">
            <Upload className="w-4 h-4 mr-2" />
            Importar Excel
          </Button>
          <Button onClick={() => abrirModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Manobra
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Buscar</label>
            <Input
              placeholder="Código ou nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Equipamento</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
            >
              <option value="">Todos os modelos</option>
              <option value="AW139">AW139</option>
              <option value="SK76">SK76</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Categoria</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.codigo}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={() => {
                setFiltroModelo('');
                setFiltroCategoria('');
                setBusca('');
              }}
              className="w-full"
            >
              Limpar Filtros
            </Button>
          </div>
        </div>
        <div className="text-sm text-gray-600 dark:text-slate-400">
          Exibindo <span className="font-semibold">{manobrasFiltradas.length}</span> de{' '}
          <span className="font-semibold">{manobras.length}</span> manobras
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Código
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Modelo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Nome
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Descrição
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Categoria
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Dificuldade
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {manobrasFiltradas.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center whitespace-nowrap px-2 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-mono rounded">
                    {m.codigo}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`inline-flex items-center whitespace-nowrap px-2 py-1 text-xs font-medium rounded ${
                      m.tipo_aeronave === 'SK76'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
                        : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                    }`}
                  >
                    {m.tipo_aeronave || '–'}
                  </span>
                </td>
                <td className="px-4 py-3.5 font-medium text-sm text-gray-900 dark:text-slate-100">{m.nome}</td>
                <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-slate-400 max-w-xl truncate">
                  {m.descricao || '-'}
                </td>
                <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-slate-400">
                  {getNomeCategoria(m.categoria) || '-'}
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span
                    className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium ${getDificuldadeColor(
                      m.nivel_dificuldade,
                    )}`}
                  >
                    {m.nivel_dificuldade || '-'}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => abrirModal(m)}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                    >
                      Editar
                    </Button>
                    <RowActionsMenu
                      label="Mais ações"
                      actions={[
                        {
                          label: 'Excluir manobra',
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => excluir(m.id),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {manobrasFiltradas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 mb-4">
            <Inbox className="w-8 h-8 text-gray-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">Nenhuma manobra encontrada</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md">Cadastre manobras e exercícios para compor os modelos de sessão.</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={fecharModal}>
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-lg w-full animate-scale-in max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{editando ? 'Editar' : 'Nova'} Manobra</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Código <span className="text-red-500">*</span></label>
                  <Input
                    value={formData.codigo || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, codigo: e.target.value.toUpperCase() })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Equipamento
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                    value={formData.tipo_aeronave || ''}
                    onChange={(e) => setFormData({ ...formData, tipo_aeronave: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    <option value="AW139">AW139</option>
                    <option value="SK76">SK76</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Categoria</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={formData.categoria || ''}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.codigo}>
                      {cat.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nome <span className="text-red-500">*</span></label>
                <Input
                  value={formData.nome || ''}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Descrição</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={formData.descricao || ''}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Nível de Dificuldade
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={formData.nivel_dificuldade || 'BASICO'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      nivel_dificuldade: e.target.value as Manobra['nivel_dificuldade'],
                    })
                  }
                >
                  <option value="BASICO">Básico</option>
                  <option value="INTERMEDIARIO">Intermediário</option>
                  <option value="AVANCADO">Avançado</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
              <Button variant="secondary" onClick={fecharModal}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
