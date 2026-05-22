import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Button } from '@/react-app/components/UI/Button';
import { Input } from '@/react-app/components/UI/Input';
import { Plus, Trash2, X, ChevronUp, ChevronDown } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { getColorByIndex } from '@/react-app/utils/colorPalette';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';
import {
  filterCompatibleCheckIds,
  filterCompatibleChecks,
} from '@/react-app/utils/checkCompatibility';

interface TipoSessao {
  id: number;
  codigo: string;
  nome: string;
  cor?: string;
}

interface ModeloAeronave {
  id: number;
  modelo: string;
  fabricante?: string;
  tipo?: string;
  categoria?: string;
}

interface Manobra {
  id: number;
  codigo: string;
  nome?: string;
  descricao?: string;
}

interface QualificacaoTipo {
  id: number;
  codigo: string;
  nome: string;
  is_check?: number;
  categoria?: string;
  validade?: number;
}

type Tripulante = 'A' | 'B' | 'AB';

interface ManobraSelecionada {
  manobra_id: number;
  manobra_codigo: string;
  manobra_descricao: string;
  manobra_nome?: string;
  ordem: number;
  tripulante: Tripulante;
}

type TipoDispositivo = 'SIMULADOR' | 'AERONAVE';

interface ModeloSessao {
  id: number;
  codigo: string;
  nome: string;
  tipo_sessao_id: number;
  tipo?: TipoDispositivo;
  tipo_aeronave?: string;
  modelo_aeronave?: string;
  tipo_sessao_nome?: string;
  descricao?: string;
  duracao_estimada: number;
  total_manobras?: number;
  gera_qualificacao?: number;
  qualificacao_tipo_id?: number | null;
  qualificacao_tipo_nome?: string;
  qualificacao_tipo_codigo?: string;
}

interface ModelosSessaoPageProps {
  embedded?: boolean;
}

export default function ModelosSessaoPage({ embedded = false }: ModelosSessaoPageProps) {
  const [modelos, setModelos] = useState<ModeloSessao[]>([]);
  const [tiposSessao, setTiposSessao] = useState<TipoSessao[]>([]);
  const [modelosAeronave, setModelosAeronave] = useState<ModeloAeronave[]>([]);
  const [manobras, setManobras] = useState<Manobra[]>([]);
  const [qualificacoesTipos, setQualificacoesTipos] = useState<QualificacaoTipo[]>([]);
  const [tiposCheckFAP, setTiposCheckFAP] = useState<QualificacaoTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalManobras, setModalManobras] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [modeloSelecionado, setModeloSelecionado] = useState<ModeloSessao | null>(null);

  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [tipoSessaoId, setTipoSessaoId] = useState<number | null>(null);
  const [tipoDispositivo, setTipoDispositivo] = useState<TipoDispositivo>('SIMULADOR');
  const [tipoAeronave, setTipoAeronave] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [duracaoEstimada, setDuracaoEstimada] = useState(120);
  const [geraQualificacao, setGeraQualificacao] = useState(false);
  const [qualificacaoTipoId, setQualificacaoTipoId] = useState<number | null>(null);
  const [checksIdsModelo, setChecksIdsModelo] = useState<number[]>([]);
  const [manobrasSelecionadas, setManobrasSelecionadas] = useState<ManobraSelecionada[]>([]);
  const [manobrasSelecionadasAntes, setManobrasSelecionadasAntes] = useState<ManobraSelecionada[]>(
    [],
  );
  const [filtroManobra, setFiltroManobra] = useState('');
  const [filtroTipoSessao, setFiltroTipoSessao] = useState<number | null>(null);
  const [filtroTipoDispositivo, setFiltroTipoDispositivo] = useState<TipoDispositivo | null>(null);
  const [filtroModeloAeronave, setFiltroModeloAeronave] = useState<string | null>(null);
  const [ordenacao, setOrdenacao] = useState<'nome' | 'tipo' | 'aeronave'>('nome');
  const [carregandoDetalhesModelo, setCarregandoDetalhesModelo] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const _authH = () => {
    const t = getAccessToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      await Promise.all([
        carregarModelos(),
        carregarTiposSessao(),
        carregarModelosAeronave(),
        carregarManobras(),
        carregarQualificacoesTipos(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const carregarQualificacoesTipos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/qualificacoes/tipos?ativo=1`, { headers: _authH() });
      const data = await res.json();
      if (data.success) {
        const todos: QualificacaoTipo[] = data.data || [];
        // Separar: tipos normais (não check) para qualificação principal
        setQualificacoesTipos(todos.filter((q) => !q.is_check && q.categoria !== 'CHECK'));
        // Tipos check/FAP para os checks padrão
        setTiposCheckFAP(todos.filter((q) => q.is_check === 1 || q.categoria === 'CHECK'));
      }
    } catch (err) {
      console.error('Erro ao carregar qualificações:', err);
    }
  };

  const carregarModelos = async () => {
    try {
      // 🔧 Adicionar timestamp para evitar cache HTTP
      const res = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao?t=${Date.now()}`, {
        headers: _authH(),
      });
      const data = await res.json();
      if (data.success) setModelos(data.data || []);
    } catch (err) {
      console.error('Erro ao carregar modelos:', err);
    }
  };

  const carregarTiposSessao = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/tipos-sessao`, { headers: _authH() });
      const data = await res.json();
      if (data.success) setTiposSessao(data.data || []);
    } catch (err) {
      console.error('Erro ao carregar tipos:', err);
    }
  };

  const carregarModelosAeronave = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/modelos-aeronave`, { headers: _authH() });
      const data = await res.json();
      if (data.success) setModelosAeronave(data.data || []);
    } catch (err) {
      console.error('Erro ao carregar modelos de aeronave:', err);
    }
  };

  const carregarManobras = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/cadastro/manobras`, {
        headers: _authH(),
      });
      const data = await res.json();
      if (data.success) setManobras(data.data || []);
    } catch (err) {
      console.error('Erro ao carregar manobras:', err);
    }
  };

  const carregarManobrasModelo = async (id: number) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/simuladores/modelos-sessao/${id}/manobras?t=${Date.now()}`,
        {
          headers: _authH(),
        },
      );
      const data = await res.json();
      if (data.success && data.data) {
        const manobrasFormatadas = data.data.map((m: Record<string, any>) => ({
          manobra_id: m.manobra_id,
          manobra_codigo: m.manobra_codigo,
          manobra_descricao: m.manobra_descricao,
          manobra_nome: m.manobra_nome || null,
          ordem: m.ordem,
          tripulante: (m.tripulante as Tripulante) || 'AB',
        }));
        setManobrasSelecionadas(manobrasFormatadas);
        // 🔧 Guardar estado original para comparação
        setManobrasSelecionadasAntes(JSON.parse(JSON.stringify(manobrasFormatadas)));
      }
    } catch (_err) {
      console.error('Erro ao carregar manobras do modelo:', _err);
    }
  };

  const carregarChecksModelo = async (id: number) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/simuladores/modelos-sessao/${id}/checks?t=${Date.now()}`,
        {
          headers: _authH(),
        },
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setChecksIdsModelo(
          filterCompatibleChecks(data.data, tipoAeronave).map((c: { id: number }) => c.id),
        );
      }
    } catch (err) {
      console.error('Erro ao carregar checks do modelo:', err);
    }
  };

  const abrirModal = async (modelo?: ModeloSessao) => {
    if (modelo) {
      setCarregandoDetalhesModelo(true);
      setModoEdicao(true);
      setModeloSelecionado(modelo);
      setCodigo(modelo.codigo);
      setNome(modelo.nome);
      setTipoSessaoId(modelo.tipo_sessao_id);
      setTipoDispositivo(modelo.tipo || 'SIMULADOR');
      setTipoAeronave(modelo.modelo_aeronave || null);
      setDescricao(modelo.descricao || '');
      setDuracaoEstimada(modelo.duracao_estimada || 120);
      setGeraQualificacao(modelo.gera_qualificacao === 1);
      setQualificacaoTipoId(modelo.qualificacao_tipo_id || null);
      setChecksIdsModelo([]); // limpar estado anterior antes do fetch
      setManobrasSelecionadas([]);
      setManobrasSelecionadasAntes([]);
      setModalAberto(true);
      try {
        await Promise.all([carregarManobrasModelo(modelo.id), carregarChecksModelo(modelo.id)]);
      } finally {
        setCarregandoDetalhesModelo(false);
      }
    } else {
      limparForm();
      setModalAberto(true);
    }
  };

  const limparForm = () => {
    setModoEdicao(false);
    setModeloSelecionado(null);
    setCodigo('');
    setNome('');
    setTipoSessaoId(null);
    setTipoDispositivo('SIMULADOR');
    setTipoAeronave(null);
    setDescricao('');
    setDuracaoEstimada(120);
    setGeraQualificacao(false);
    setQualificacaoTipoId(null);
    setChecksIdsModelo([]);
    setManobrasSelecionadas([]);
    setManobrasSelecionadasAntes([]);
  };

  const salvar = async () => {
    if (!codigo || !nome) {
      toast.warning('Preencha código e nome do modelo');
      return;
    }

    try {
      const checksCompativeis = filterCompatibleCheckIds(
        checksIdsModelo,
        tiposCheckFAP,
        tipoAeronave,
      );
      const body = {
        codigo,
        nome,
        tipo: tipoDispositivo,
        tipo_sessao_id: tipoSessaoId,
        modelo_aeronave: tipoAeronave, // nome do modelo (ex: AW139)
        descricao,
        duracao_estimada: duracaoEstimada,
        gera_qualificacao: geraQualificacao ? 1 : 0,
        qualificacao_tipo_id: geraQualificacao ? qualificacaoTipoId : null,
        checks_ids: geraQualificacao ? checksCompativeis : [],
      };
      const url = modoEdicao
        ? `${API_BASE_URL}/simuladores/modelos-sessao/${modeloSelecionado!.id}`
        : `${API_BASE_URL}/simuladores/modelos-sessao`;
      const method = modoEdicao ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ..._authH() },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(modoEdicao ? 'Modelo atualizado' : 'Modelo criado');
        const modeloId = modoEdicao ? modeloSelecionado!.id : data.data.id;

        // 🔧 CORREÇÃO: Comparar manobras antes e depois
        const manobrasAlteradas =
          JSON.stringify(manobrasSelecionadas) !== JSON.stringify(manobrasSelecionadasAntes);

        if (manobrasSelecionadas.length > 0 && manobrasAlteradas) {
          // Manobras foram alteradas: salvar
          await salvarManobras(modeloId);
        } else if (
          manobrasSelecionadas.length === 0 &&
          manobrasSelecionadasAntes.length > 0 &&
          modoEdicao
        ) {
          // Tentou remover todas as manobras: solicitar confirmação
          if (
            await confirmDialog('Tem certeza que deseja remover TODAS as manobras deste modelo?')
          ) {
            await salvarManobras(modeloId);
          } else {
            toast.info('Manobras não foram alteradas');
            return;
          }
        }
        // ✅ Se igual: não faz nada (mantém manobras antigas)

        setModalAberto(false);
        limparForm();
        await carregarModelos();
        emitirEventoModulo({
          modulo: 'simuladores',
          tipo: 'SIMULADOR_ATUALIZADO',
        });
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Erro ao salvar');
    }
  };

  useEffect(() => {
    if (checksIdsModelo.length === 0) {
      return;
    }

    const checksNormalizados = filterCompatibleCheckIds(
      checksIdsModelo,
      tiposCheckFAP,
      tipoAeronave,
    );

    if (checksNormalizados.length !== checksIdsModelo.length) {
      setChecksIdsModelo(checksNormalizados);
    }
  }, [checksIdsModelo, tipoAeronave, tiposCheckFAP]);

  const salvarManobras = async (modeloId: number) => {
    try {
      const payload = {
        manobras: manobrasSelecionadas.map((m) => ({
          manobra_id: m.manobra_id,
          ordem: m.ordem,
          obrigatoria: 1,
          tripulante: m.tripulante || 'AB',
        })),
        substituir: true,
      };
      await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${modeloId}/manobras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authH() },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Erro ao salvar manobras:', err);
    }
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Excluir este modelo?'))) return;
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${id}`, {
        method: 'DELETE',
        headers: _authH(),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Modelo excluído');
        setModelos((prev) => prev.filter((m) => m.id !== id));
        await carregarModelos();
        emitirEventoModulo({
          modulo: 'simuladores',
          tipo: 'SIMULADOR_ATUALIZADO',
        });
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const adicionarManobra = (manobra: Manobra) => {
    if (manobrasSelecionadas.some((m) => m.manobra_id === manobra.id)) {
      toast.warning('Manobra já adicionada');
      return;
    }
    setManobrasSelecionadas([
      ...manobrasSelecionadas,
      {
        manobra_id: manobra.id,
        manobra_codigo: manobra.codigo,
        manobra_descricao: manobra.nome || manobra.descricao || manobra.codigo,
        manobra_nome: manobra.nome || null,
        ordem: manobrasSelecionadas.length + 1,
        tripulante: 'AB' as Tripulante,
      },
    ]);
  };

  const removerManobra = (manobraId: number) => {
    const novaLista = manobrasSelecionadas.filter((m) => m.manobra_id !== manobraId);
    novaLista.forEach((m, idx) => {
      m.ordem = idx + 1;
    });
    setManobrasSelecionadas(novaLista);
  };

  const moverManobra = (index: number, direcao: 'up' | 'down') => {
    if (
      (direcao === 'up' && index === 0) ||
      (direcao === 'down' && index === manobrasSelecionadas.length - 1)
    )
      return;
    const novaLista = [...manobrasSelecionadas];
    const targetIndex = direcao === 'up' ? index - 1 : index + 1;
    [novaLista[index], novaLista[targetIndex]] = [novaLista[targetIndex], novaLista[index]];
    novaLista.forEach((m, idx) => {
      m.ordem = idx + 1;
    });
    setManobrasSelecionadas(novaLista);
  };

  const manobrasFiltradas = manobras.filter(
    (m) =>
      m.codigo.toLowerCase().includes(filtroManobra.toLowerCase()) ||
      (m.nome || m.descricao || '').toLowerCase().includes(filtroManobra.toLowerCase()),
  );

  const modelosFiltrados = modelos
    .filter((m) => {
      if (filtroTipoSessao && m.tipo_sessao_id !== filtroTipoSessao) return false;
      if (filtroTipoDispositivo && (m.tipo || 'SIMULADOR') !== filtroTipoDispositivo) return false;
      if (filtroModeloAeronave && m.modelo_aeronave !== filtroModeloAeronave) return false;
      return true;
    })
    .sort((a, b) => {
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome);
      if (ordenacao === 'tipo')
        return (a.tipo_sessao_nome || '').localeCompare(b.tipo_sessao_nome || '');
      if (ordenacao === 'aeronave')
        return (a.modelo_aeronave || '').localeCompare(b.modelo_aeronave || '');
      return 0;
    });

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Modelos de Sessão</h2>
          <p className="text-sm text-gray-500 mt-1">Configure modelos com suas manobras e ordem</p>
        </div>
        <Button onClick={() => abrirModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Modelo
        </Button>
      </div>

      {/* Filtros e Ordenação */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dispositivo</label>
            <select
              value={filtroTipoDispositivo || ''}
              onChange={(e) => setFiltroTipoDispositivo((e.target.value as TipoDispositivo) || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Todos</option>
              <option value="SIMULADOR">Simulador</option>
              <option value="AERONAVE">Voo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Tipo</label>
            <select
              value={filtroTipoSessao || ''}
              onChange={(e) => setFiltroTipoSessao(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Todos os tipos</option>
              {tiposSessao.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} - {t.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filtrar por Equipamento
            </label>
            <select
              value={filtroModeloAeronave || ''}
              onChange={(e) => setFiltroModeloAeronave(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Todos os equipamentos</option>
              {[...new Set(modelos.map((m) => m.modelo_aeronave).filter(Boolean))].map((modelo) => (
                <option key={modelo} value={modelo}>
                  {modelo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ordenar por</label>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as 'nome' | 'tipo' | 'aeronave')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="nome">Nome do Modelo</option>
              <option value="tipo">Tipo de Sessão</option>
              <option value="aeronave">Equipamento</option>
            </select>
          </div>

          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={() => {
                setFiltroTipoSessao(null);
                setFiltroTipoDispositivo(null);
                setFiltroModeloAeronave(null);
                setOrdenacao('nome');
              }}
              className="w-full"
            >
              Limpar Filtros
            </Button>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          Exibindo <span className="font-semibold">{modelosFiltrados.length}</span> de{' '}
          <span className="font-semibold">{modelos.length}</span> modelos
        </div>
      </div>

      {/* Lista de Modelos */}
      <div className="bg-white rounded-lg border overflow-x-auto overflow-y-auto max-h-[600px]">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Código
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nome
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[110px]">
                Dispositivo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tipo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Modelo
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Duração
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Manobras
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {modelosFiltrados.map((modelo) => {
              const tipoInfo = tiposSessao.find((t) => t.id === modelo.tipo_sessao_id);
              return (
                <tr key={modelo.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded">
                      {modelo.codigo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-sm">{modelo.nome}</p>
                      {modelo.descricao && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
                          {modelo.descricao}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(modelo.tipo || 'SIMULADOR') === 'AERONAVE' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                        ✈️ Voo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                        🖥️ Simulador
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {tipoInfo ? (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: tipoInfo.cor || getColorByIndex(tipoInfo.id) }}
                      >
                        {modelo.tipo_sessao_nome || '-'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600">{modelo.modelo_aeronave || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm">{modelo.duracao_estimada || 120} min</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                      {modelo.total_manobras || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => abrirModal(modelo)}
                        className="text-xs px-3 py-1"
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => excluir(modelo.id)}
                        className="text-red-600 hover:bg-red-50 px-2 py-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modelosFiltrados.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>
            {modelos.length === 0
              ? 'Nenhum modelo cadastrado'
              : 'Nenhum modelo corresponde aos filtros'}
          </p>
        </div>
      )}

      {/* Modal Principal */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white">
              <h3 className="text-lg font-semibold">{modoEdicao ? 'Editar' : 'Novo'} Modelo</h3>
            </div>

            <div className="p-6 space-y-4">
              {carregandoDetalhesModelo && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Carregando checks FAP e manobras salvas do modelo...
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código*</label>
                  <Input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duração (min)*
                  </label>
                  <Input
                    type="number"
                    value={duracaoEstimada}
                    onChange={(e) => setDuracaoEstimada(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome*</label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
              </div>

              {/* Tipo de dispositivo: Simulador ou Aeronave */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dispositivo*
                </label>
                <div className="flex gap-3">
                  {(['SIMULADOR', 'AERONAVE'] as TipoDispositivo[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setTipoDispositivo(opt)}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        tipoDispositivo === opt
                          ? opt === 'AERONAVE'
                            ? 'border-sky-500 bg-sky-50 text-sky-700'
                            : 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 hover:border-gray-400 text-gray-600'
                      }`}
                    >
                      {opt === 'SIMULADOR' ? '🖥️ Simulador' : '✈️ Aeronave (Voo Real)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Sessão*
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={tipoSessaoId || ''}
                    onChange={(e) => setTipoSessaoId(Number(e.target.value))}
                  >
                    <option value="">Selecione</option>
                    {tiposSessao.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo} - {t.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipamento
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={tipoAeronave || ''}
                    onChange={(e) => setTipoAeronave(e.target.value || null)}
                  >
                    <option value="">Todos os equipamentos</option>
                    {modelosAeronave.map((m) => (
                      <option key={m.id} value={m.modelo}>
                        {m.modelo} {m.fabricante ? `- ${m.fabricante}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>

              {/* Checkbox Gera Qualificação */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <input
                  type="checkbox"
                  id="geraQualificacao"
                  checked={geraQualificacao}
                  onChange={(e) => setGeraQualificacao(e.target.checked)}
                  className="w-5 h-5 text-blue-600 bg-white border-gray-300 rounded focus:ring-primary/30"
                />
                <label htmlFor="geraQualificacao" className="flex-1 cursor-pointer">
                  <span className="font-medium text-gray-900">Gera Qualificação</span>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Ao finalizar esta sessão, o botão "Gerar Qualificação" será exibido na ficha de
                    avaliação
                  </p>
                </label>
              </div>

              {/* Qualificação e FAPs (só aparece quando Gera Qualificação está ativo) */}
              {geraQualificacao && (
                <div className="space-y-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <label className="block text-sm font-semibold text-green-900 mb-1">
                      Qualificação Principal Gerada
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-green-300 rounded-md text-sm bg-white"
                      value={qualificacaoTipoId || ''}
                      onChange={(e) =>
                        setQualificacaoTipoId(e.target.value ? Number(e.target.value) : null)
                      }
                    >
                      <option value="">-- Selecione a qualificação gerada --</option>
                      {qualificacoesTipos.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.codigo} — {q.nome}
                          {q.validade ? ` (${q.validade} meses)` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-green-700 mt-1">
                      Esta qualificação será gerada automaticamente ao clicar em "Gerar
                      Qualificação"
                    </p>
                  </div>

                  {filterCompatibleChecks(tiposCheckFAP, tipoAeronave).length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-green-900 mb-2">
                        Checks FAP Padrão desta Sessão
                      </label>
                      <p className="text-xs text-green-700 mb-2">
                        Estes checks FAP serão pré-selecionados ao criar uma sessão com este modelo.
                        As FAPs aprovadas também geram qualificações automáticas.
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {filterCompatibleChecks(tiposCheckFAP, tipoAeronave).map((check) => (
                          <label
                            key={check.id}
                            className="flex items-center gap-2 p-2 hover:bg-green-100 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checksIdsModelo.includes(check.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setChecksIdsModelo((prev) =>
                                    prev.includes(check.id) ? prev : [...prev, check.id],
                                  );
                                } else {
                                  setChecksIdsModelo((prev) =>
                                    prev.filter((id) => id !== check.id),
                                  );
                                }
                              }}
                              className="w-3.5 h-3.5 text-green-600 border-green-300 rounded"
                            />
                            <div>
                              <span className="text-xs font-mono bg-green-200 text-green-800 px-1.5 py-0.5 rounded">
                                {check.codigo}
                              </span>
                              <span className="text-sm text-green-900 ml-1.5">{check.nome}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-medium text-gray-700">
                    Manobras ({manobrasSelecionadas.length})
                  </label>
                  <Button variant="secondary" onClick={() => setModalManobras(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar
                  </Button>
                </div>

                {manobrasSelecionadas.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {manobrasSelecionadas.map((m, idx) => (
                      <div
                        key={m.manobra_id}
                        className="flex items-center gap-2 bg-gray-50 p-2 rounded border"
                      >
                        <span className="text-xs font-mono text-gray-500 w-6">{m.ordem}</span>
                        <span className="text-xs font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">
                          {m.manobra_codigo}
                        </span>
                        <span className="text-sm flex-1 truncate">
                          {m.manobra_nome || m.manobra_descricao}
                        </span>
                        {/* Seletor A / B / AB */}
                        <div className="flex rounded overflow-hidden border border-gray-300 shrink-0 text-xs font-bold">
                          {(['A', 'B', 'AB'] as Tripulante[]).map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                const nova = [...manobrasSelecionadas];
                                nova[idx] = { ...nova[idx], tripulante: opt };
                                setManobrasSelecionadas(nova);
                              }}
                              className={`px-2 py-0.5 transition-colors ${
                                m.tripulante === opt
                                  ? opt === 'A'
                                    ? 'bg-primary text-white'
                                    : opt === 'B'
                                      ? 'bg-orange-500 text-white'
                                      : 'bg-purple-600 text-white'
                                  : 'bg-white text-gray-500 hover:bg-gray-100'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => moverManobra(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moverManobra(idx, 'down')}
                            disabled={idx === manobrasSelecionadas.length - 1}
                            className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removerManobra(m.manobra_id)}
                            className="p-1 hover:bg-red-100 text-red-600 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhuma manobra adicionada
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar}>{modoEdicao ? 'Atualizar' : 'Criar'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Manobras */}
      {modalManobras && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Adicionar Manobras</h3>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <Input
                placeholder="Buscar por código ou descrição..."
                value={filtroManobra}
                onChange={(e) => setFiltroManobra(e.target.value)}
              />

              <div className="space-y-2">
                {manobrasFiltradas.map((m) => {
                  const adicionada = manobrasSelecionadas.some((sel) => sel.manobra_id === m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => !adicionada && adicionarManobra(m)}
                      disabled={adicionada}
                      className={`w-full text-left p-3 rounded border ${
                        adicionada
                          ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                          : 'bg-white hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      <span className="font-mono text-xs bg-gray-200 px-2 py-0.5 rounded">
                        {m.codigo}
                      </span>
                      <p className="text-sm mt-1">{m.nome || m.descricao}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t">
              <Button onClick={() => setModalManobras(false)} className="w-full">
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
