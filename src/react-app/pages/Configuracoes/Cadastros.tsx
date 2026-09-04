import { Suspense, useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import { Plus, Briefcase, Building2, Plane, Edit2, Trash2, Layers } from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';
import { SettingsSectionIntro } from './components/SettingsSectionIntro';

const ModalCadastro = lazyWithRetry(
  () =>
    import('../../components/shared/ModalCadastro').then((module) => ({
      default: module.ModalCadastro,
    })),
  'ConfiguracoesModalCadastro',
);

const modalFallback = <div className="fixed inset-0 z-modal bg-black/30" />;

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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const timestamp = new Date().getTime();
      const [resFuncoes, resSetores, resAeronaves, resModelos] = await Promise.all([
        fetch(`${API_BASE_URL}/funcoes?t=${timestamp}`, { headers }),
        fetch(`${API_BASE_URL}/setores?t=${timestamp}`, { headers }),
        fetch(`${API_BASE_URL}/aeronaves?t=${timestamp}`, { headers }),
        fetch(`${API_BASE_URL}/modelos-aeronave?t=${timestamp}`, { headers }),
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

    // Limpar dados - apenas enviar os campos necessários
    const cleanData = {
      ...(data.id && { id: data.id }),
      modelo: data.modelo,
      prefixo: data.prefixo || null,
      status: data.status || 'ATIVO',
      observacoes: data.observacoes || null,
    };

    console.log('[salvarAeronave] Enviando:', cleanData);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(cleanData),
    });

    if (!response.ok) {
      let errMsg = 'Erro ao salvar aeronave';
      try {
        const errBody = (await response.json()) as any;
        errMsg = errBody?.error || errBody?.message || errMsg;
      } catch {
        errMsg = `Erro ${response.status} ao salvar aeronave`;
      }
      console.error('[salvarAeronave] Error:', response.status, errMsg);
      throw new Error(errMsg);
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
        <SettingsSectionIntro
          badge="Base operacional"
          title="Cadastros"
          description="Gerenciar funções, setores, equipamentos e aeronaves do sistema."
          icon={<Layers className="h-5 w-5" />}
        />

        {/* Abas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <button
              onClick={() => setAbaAtiva('funcoes')}
              className={`flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                abaAtiva === 'funcoes'
                  ? 'border-blue-200 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Funções
            </button>

            <button
              onClick={() => setAbaAtiva('setores')}
              className={`flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                abaAtiva === 'setores'
                  ? 'border-blue-200 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Setores
            </button>

            <button
              onClick={() => setAbaAtiva('modelos')}
              className={`flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                abaAtiva === 'modelos'
                  ? 'border-blue-200 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              Equipamentos
            </button>

            <button
              onClick={() => setAbaAtiva('aeronaves')}
              className={`flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                abaAtiva === 'aeronaves'
                  ? 'border-blue-200 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Plane className="w-4 h-4" />
              Aeronaves
            </button>
          </div>
        </div>

        {abaAtiva === 'funcoes' && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Funções e Cargos
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {funcoes.length} funções cadastradas
                </p>
              </div>
              <button
                onClick={() => setModalFuncao({ isOpen: true, data: null })}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" /> Nova Função
              </button>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase w-28">
                      Ações
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Código
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Categoria
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {funcoes.map((func: any) => (
                    <tr
                      key={func.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <td className="flex gap-2 px-6 py-3">
                        <button
                          onClick={() => setModalFuncao({ isOpen: true, data: func })}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50"
                          title="Editar"
                          aria-label={`Editar função ${func.nome}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <RowActionsMenu
                          label={`Mais ações para a função ${func.nome}`}
                          actions={[
                            {
                              label: 'Excluir função',
                              destructive: true,
                              icon: Trash2,
                              onSelect: () => excluirFuncao(func.id),
                            },
                          ]}
                        />
                      </td>
                      <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-100">
                        {func.codigo}
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {func.nome}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {func.descricao}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {func.categoria}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            func.ativo
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-100 text-slate-800'
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Setores e Departamentos
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {setores.length} setores cadastrados
                </p>
              </div>
              <button
                onClick={() => setModalSetor({ isOpen: true, data: null })}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" /> Novo Setor
              </button>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-28">
                      Ações
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Código
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Responsável
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Centro de Custo
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {setores.map((setor: any) => (
                    <tr
                      key={setor.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <td className="flex gap-2 px-6 py-3">
                        <button
                          onClick={() => setModalSetor({ isOpen: true, data: setor })}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50"
                          title="Editar"
                          aria-label={`Editar setor ${setor.nome}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <RowActionsMenu
                          label={`Mais ações para o setor ${setor.nome}`}
                          actions={[
                            {
                              label: 'Excluir setor',
                              destructive: true,
                              icon: Trash2,
                              onSelect: () => excluirSetor(setor.id),
                            },
                          ]}
                        />
                      </td>
                      <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-100">
                        {setor.codigo}
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {setor.nome}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {setor.descricao}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {setor.responsavel}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {setor.centro_custo}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Equipamentos
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {modelos.length} equipamentos cadastrados
                </p>
              </div>
              <button
                onClick={() => setModalModelo({ isOpen: true, data: null })}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" /> Novo Equipamento
              </button>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-28">
                      Ações
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Equipamento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Fabricante
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Categoria
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {modelos.map((modelo: any) => (
                    <tr
                      key={modelo.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <td className="flex gap-2 px-6 py-3">
                        <button
                          onClick={() => setModalModelo({ isOpen: true, data: modelo })}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50"
                          title="Editar"
                          aria-label={`Editar equipamento ${modelo.modelo}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <RowActionsMenu
                          label={`Mais ações para o equipamento ${modelo.modelo}`}
                          actions={[
                            {
                              label: 'Excluir equipamento',
                              destructive: true,
                              icon: Trash2,
                              onSelect: () => excluirModelo(modelo.id),
                            },
                          ]}
                        />
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {modelo.modelo}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {modelo.fabricante}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {modelo.tipo}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {modelo.categoria}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Aeronaves
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {aeronaves.length} aeronaves cadastradas
                </p>
              </div>
              <button
                onClick={() => setModalAeronave({ isOpen: true, data: null })}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" /> Nova Aeronave
              </button>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-28">
                      Ações
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Equipamento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Prefixo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                      Ano
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {aeronaves.map((aeronave: any) => (
                    <tr
                      key={aeronave.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <td className="flex gap-2 px-6 py-3">
                        <button
                          onClick={() => setModalAeronave({ isOpen: true, data: aeronave })}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50"
                          title="Editar"
                          aria-label={`Editar aeronave ${aeronave.prefixo ?? aeronave.modelo}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <RowActionsMenu
                          label={`Mais ações para a aeronave ${aeronave.prefixo ?? aeronave.modelo}`}
                          actions={[
                            {
                              label: 'Excluir aeronave',
                              destructive: true,
                              icon: Trash2,
                              onSelect: () => excluirAeronave(aeronave.id),
                            },
                          ]}
                        />
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {aeronave.modelo}
                      </td>
                      <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-100">
                        {aeronave.prefixo}
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {aeronave.ano_fabricacao}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
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
          <Suspense fallback={modalFallback}>
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
          </Suspense>
        )}

        {modalSetor.isOpen && (
          <Suspense fallback={modalFallback}>
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
                { name: 'centro_custo', label: 'Centro de Custo', type: 'text' },
                { name: 'ativo', label: 'Ativo', type: 'checkbox' },
              ]}
            />
          </Suspense>
        )}

        {modalAeronave.isOpen && (
          <Suspense fallback={modalFallback}>
            <ModalCadastro
              title={modalAeronave.data ? 'Editar Aeronave' : 'Nova Aeronave'}
              isOpen={modalAeronave.isOpen}
              onClose={() => setModalAeronave({ isOpen: false, data: null })}
              onSave={salvarAeronave}
              initialData={modalAeronave.data}
              fields={[
                {
                  name: 'modelo',
                  label: 'Equipamento',
                  type: 'select',
                  required: true,
                  options: modelos.map((m: any) => ({
                    value: m.modelo,
                    label: m.modelo + (m.fabricante ? ` (${m.fabricante})` : ''),
                  })),
                },
                { name: 'prefixo', label: 'Prefixo', type: 'text', placeholder: 'Ex: PP-HMR' },
                {
                  name: 'status',
                  label: 'Status',
                  type: 'select',
                  options: [
                    { value: 'ATIVO', label: 'Ativo' },
                    { value: 'INATIVO', label: 'Inativo' },
                  ],
                },
                { name: 'observacoes', label: 'Observações', type: 'textarea' },
              ]}
            />
          </Suspense>
        )}

        {modalModelo.isOpen && (
          <Suspense fallback={modalFallback}>
            <ModalCadastro
              title={modalModelo.data ? 'Editar Equipamento' : 'Novo Equipamento'}
              isOpen={modalModelo.isOpen}
              onClose={() => setModalModelo({ isOpen: false, data: null })}
              onSave={salvarModelo}
              initialData={modalModelo.data}
              fields={[
                {
                  name: 'modelo',
                  label: 'Equipamento',
                  type: 'text',
                  required: true,
                  placeholder: 'Ex: AW139, S76, EC135, Bell 407',
                },
                {
                  name: 'fabricante',
                  label: 'Fabricante',
                  type: 'text',
                  placeholder: 'Ex: Leonardo, Sikorsky, Airbus Helicopters',
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
          </Suspense>
        )}
    </div>
  );
}
