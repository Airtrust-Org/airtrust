import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Plus, Briefcase, Building2, Plane, Edit2, Trash2, Layers } from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { ModalCadastro } from '../../components/shared/ModalCadastro';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

type AbaAtiva = 'funcoes' | 'setores' | 'aeronaves' | 'modelos';

export function Cadastros() {
  const { token } = useAuth();
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('funcoes');

  const [funcoes, setFuncoes] = useState<any[]>([]);
  const [setores, setSetores] = useState<any[]>([]);
  const [aeronaves, setAeronaves] = useState<any[]>([]);
  const [modelos, setModelos] = useState<any[]>([]);

  const [modalFuncao, setModalFuncao] = useState<{ isOpen: boolean; data: any | null }>({
    isOpen: false,
    data: null,
  });
  const [modalSetor, setModalSetor] = useState<{ isOpen: boolean; data: any | null }>({
    isOpen: false,
    data: null,
  });
  const [modalAeronave, setModalAeronave] = useState<{ isOpen: boolean; data: any | null }>({
    isOpen: false,
    data: null,
  });
  const [modalModelo, setModalModelo] = useState<{ isOpen: boolean; data: any | null }>({
    isOpen: false,
    data: null,
  });

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const [resFuncoes, resSetores, resAeronaves, resModelos] = await Promise.all([
        fetch(`${API_BASE_URL}/funcoes`, { headers }),
        fetch(`${API_BASE_URL}/setores`, { headers }),
        fetch(`${API_BASE_URL}/aeronaves`, { headers }),
        fetch(`${API_BASE_URL}/modelos-aeronave`, { headers }),
      ]);

      console.log('[CADASTROS] Respostas:', {
        funcoes: resFuncoes.status,
        setores: resSetores.status,
        aeronaves: resAeronaves.status,
        modelos: resModelos.status,
      });

      if (resFuncoes.ok) {
        const data = await resFuncoes.json();
        setFuncoes(data.data || data || []);
      } else {
        console.error('[CADASTROS] Erro funções:', resFuncoes.status);
        setFuncoes([]);
      }

      if (resSetores.ok) {
        const data = await resSetores.json();
        setSetores(data.data || data || []);
      } else {
        console.error('[CADASTROS] Erro setores:', resSetores.status);
        setSetores([]);
      }

      if (resAeronaves.ok) {
        const data = await resAeronaves.json();
        setAeronaves(data.data || data || []);
      } else {
        console.error('[CADASTROS] Erro aeronaves:', resAeronaves.status);
        setAeronaves([]);
      }

      if (resModelos.ok) {
        const data = await resModelos.json();
        setModelos(data.data || data || []);
      } else {
        console.error('[CADASTROS] Erro modelos:', resModelos.status);
        setModelos([]);
      }
    } catch (error) {
      console.error('[CADASTROS] Erro ao carregar dados:', error);
      setFuncoes([]);
      setSetores([]);
      setAeronaves([]);
      setModelos([]);
    }
  }

  async function salvarFuncao(data: any) {
    const method = data.id ? 'PUT' : 'POST';
    const url = data.id ? `${API_BASE_URL}/funcoes/${data.id}` : `${API_BASE_URL}/funcoes`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[salvarFuncao] Error:', error);
      throw new Error('Erro ao salvar função');
    }
    await carregarDados();
  }

  async function excluirFuncao(id: number) {
    if (!(await confirmDialog('Deseja realmente excluir esta função?'))) return;

    const response = await fetch(`${API_BASE_URL}/funcoes/${id}`, {
      method: `DELETE`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error('Erro ao excluir função');
    await carregarDados();
  }

  async function salvarSetor(data: any) {
    const method = data.id ? 'PUT' : 'POST';
    const url = data.id ? `${API_BASE_URL}/setores/${data.id}` : `${API_BASE_URL}/setores`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[salvarSetor] Error:', error);
      throw new Error('Erro ao salvar setor');
    }
    await carregarDados();
  }

  async function excluirSetor(id: number) {
    if (!(await confirmDialog('Deseja realmente excluir este setor?'))) return;

    const response = await fetch(`${API_BASE_URL}/setores/${id}`, {
      method: `DELETE`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error('Erro ao excluir setor');
    await carregarDados();
  }

  async function salvarAeronave(data: any) {
    const method = data.id ? 'PUT' : 'POST';
    const url = data.id ? `${API_BASE_URL}/aeronaves/${data.id}` : `${API_BASE_URL}/aeronaves`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[salvarAeronave] Error:', error);
      throw new Error('Erro ao salvar aeronave');
    }
    await carregarDados();
  }

  async function excluirAeronave(id: number) {
    if (!(await confirmDialog('Deseja realmente excluir esta aeronave?'))) return;

    const response = await fetch(`${API_BASE_URL}/aeronaves/${id}`, {
      method: `DELETE`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error('Erro ao excluir aeronave');
    await carregarDados();
  }

  async function salvarModelo(data: any) {
    const method = data.id ? 'PUT' : 'POST';
    const url = data.id
      ? `${API_BASE_URL}/modelos-aeronave/${data.id}`
      : `${API_BASE_URL}/modelos-aeronave`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[salvarModelo] Error:', error);
      throw new Error('Erro ao salvar modelo');
    }
    await carregarDados();
  }

  async function excluirModelo(id: number) {
    if (!(await confirmDialog('Deseja realmente excluir este modelo?'))) return;

    const response = await fetch(`${API_BASE_URL}/modelos-aeronave/${id}`, {
      method: `DELETE`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error('Erro ao excluir modelo');
    await carregarDados();
  }

  return (
    <div className="space-y-4">
      {/* Abas */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setAbaAtiva('funcoes')}
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            abaAtiva === 'funcoes'
              ? 'bg-slate-100 text-primary font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Funções
        </button>

        <button
          onClick={() => setAbaAtiva('setores')}
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            abaAtiva === 'setores'
              ? 'bg-slate-100 text-primary font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Setores
        </button>

        <button
          onClick={() => setAbaAtiva('modelos')}
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            abaAtiva === 'modelos'
              ? 'bg-slate-100 text-primary font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          Equipamentos
        </button>

        <button
          onClick={() => setAbaAtiva('aeronaves')}
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            abaAtiva === 'aeronaves'
              ? 'bg-slate-100 text-primary font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Plane className="w-4 h-4" />
          Aeronaves
        </button>
      </div>

      {abaAtiva === 'funcoes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Funções e Cargos</h3>
              <p className="text-sm text-slate-600">{funcoes.length} funções cadastradas</p>
            </div>
            <button
              onClick={() => setModalFuncao({ isOpen: true, data: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Nova Função
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-28">
                    Ações
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Descrição
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Categoria
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {funcoes.map((func: any) => (
                  <tr key={func.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => setModalFuncao({ isOpen: true, data: func })}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => excluirFuncao(func.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-900">{func.codigo}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{func.nome}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{func.descricao}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{func.categoria}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          func.ativo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {func.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abaAtiva === 'setores' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Setores e Departamentos</h3>
              <p className="text-sm text-slate-600">{setores.length} setores cadastrados</p>
            </div>
            <button
              onClick={() => setModalSetor({ isOpen: true, data: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Novo Setor
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-28">
                    Ações
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Descrição
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Responsável
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {setores.map((setor: any) => (
                  <tr key={setor.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => setModalSetor({ isOpen: true, data: setor })}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => excluirSetor(setor.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-900">{setor.codigo}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{setor.nome}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{setor.descricao}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{setor.responsavel}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          setor.ativo
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {setor.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abaAtiva === 'modelos' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Equipamentos</h3>
              <p className="text-sm text-slate-600">{modelos.length} equipamentos cadastrados</p>
            </div>
            <button
              onClick={() => setModalModelo({ isOpen: true, data: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Novo Equipamento
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-28">
                    Ações
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Equipamento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Fabricante
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Categoria
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {modelos.map((modelo: any) => (
                  <tr key={modelo.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => setModalModelo({ isOpen: true, data: modelo })}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => excluirModelo(modelo.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-900">{modelo.codigo}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{modelo.nome}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{modelo.fabricante}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{modelo.tipo}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{modelo.categoria}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          modelo.ativo
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {modelo.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abaAtiva === 'aeronaves' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Aeronaves</h3>
              <p className="text-sm text-slate-600">{aeronaves.length} aeronaves cadastradas</p>
            </div>
            <button
              onClick={() => setModalAeronave({ isOpen: true, data: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Nova Aeronave
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-28">
                    Ações
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Equipamento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Fabricante
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Prefixo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                    Ano
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aeronaves.map((aeronave: any) => (
                  <tr key={aeronave.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => setModalAeronave({ isOpen: true, data: aeronave })}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => excluirAeronave(aeronave.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-900">
                      {aeronave.codigo}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{aeronave.modelo}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{aeronave.fabricante}</td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-900">
                      {aeronave.prefixo}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{aeronave.ano_fabricacao}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          aeronave.ativo
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {aeronave.status || (aeronave.ativo ? 'ATIVO' : 'INATIVO')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalFuncao.isOpen && (
        <ModalCadastro
          title={modalFuncao.data ? 'Editar Função' : 'Nova Função'}
          isOpen={modalFuncao.isOpen}
          onClose={() => setModalFuncao({ isOpen: false, data: null })}
          onSave={salvarFuncao}
          initialData={modalFuncao.data}
          fields={[
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text' },
            { name: 'categoria', label: 'Categoria', type: 'text' },
            { name: 'ativo', label: 'Ativo', type: 'checkbox' },
          ]}
        />
      )}

      {modalSetor.isOpen && (
        <ModalCadastro
          title={modalSetor.data ? 'Editar Setor' : 'Novo Setor'}
          isOpen={modalSetor.isOpen}
          onClose={() => setModalSetor({ isOpen: false, data: null })}
          onSave={salvarSetor}
          initialData={modalSetor.data}
          fields={[
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text' },
            { name: 'responsavel', label: 'Responsável', type: 'text' },
            { name: 'ativo', label: 'Ativo', type: 'checkbox' },
          ]}
        />
      )}

      {modalAeronave.isOpen && (
        <ModalCadastro
          title={modalAeronave.data ? 'Editar Aeronave' : 'Nova Aeronave'}
          isOpen={modalAeronave.isOpen}
          onClose={() => setModalAeronave({ isOpen: false, data: null })}
          onSave={salvarAeronave}
          initialData={modalAeronave.data}
          fields={[
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            {
              name: 'modelo',
              label: 'Equipamento',
              type: 'text',
              required: true,
              placeholder: 'Ex: Airbus A320, Boeing 737',
            },
            {
              name: 'fabricante',
              label: 'Fabricante',
              type: 'text',
              placeholder: 'Ex: Airbus, Boeing',
            },
            { name: 'prefixo', label: 'Prefixo', type: 'text', placeholder: 'Ex: PT-ABC' },
            { name: 'ano_fabricacao', label: 'Ano de Fabricação', type: 'number' },
            {
              name: 'status',
              label: 'Status',
              type: 'text',
              placeholder: 'ATIVO, MANUTENÇÃO, INATIVO',
            },
            { name: 'observacoes', label: 'Observações', type: 'textarea' },
            { name: 'ativo', label: 'Ativo', type: 'checkbox' },
          ]}
        />
      )}

      {modalModelo.isOpen && (
        <ModalCadastro
          title={modalModelo.data ? 'Editar Equipamento' : 'Novo Equipamento'}
          isOpen={modalModelo.isOpen}
          onClose={() => setModalModelo({ isOpen: false, data: null })}
          onSave={salvarModelo}
          initialData={modalModelo.data}
          fields={[
            {
              name: 'codigo',
              label: 'Código',
              type: 'text',
              required: true,
              placeholder: 'Ex: A320, B737',
            },
            {
              name: 'nome',
              label: 'Equipamento',
              type: 'text',
              required: true,
              placeholder: 'Ex: Airbus A320, Boeing 737',
            },
            {
              name: 'fabricante',
              label: 'Fabricante',
              type: 'text',
              placeholder: 'Ex: Airbus, Boeing, Embraer',
            },
            {
              name: 'tipo',
              label: 'Tipo',
              type: 'text',
              placeholder: 'Ex: Jato, Turboélice, Helicóptero',
            },
            {
              name: 'categoria',
              label: 'Categoria',
              type: 'text',
              placeholder: 'Ex: Comercial, Executivo, Militar',
            },
            { name: 'descricao', label: 'Descrição', type: 'textarea' },
            { name: 'ativo', label: 'Ativo', type: 'checkbox' },
          ]}
        />
      )}
    </div>
  );
}
