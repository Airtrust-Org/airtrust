import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Button } from '@/react-app/components/UI/Button';
import { Input } from '@/react-app/components/UI/Input';
import { ArrowLeft, Plus, Trash2, X, ChevronUp, ChevronDown, Inbox } from 'lucide-react';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { getColorByIndex } from '@/react-app/utils/colorPalette';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';
import {
  filterCompatibleChecks,
} from '@/react-app/utils/checkCompatibility';
import { isQualificationCheck } from '@/react-app/utils/isQualificationCheck';

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
  /** Normalizado via isQualificationCheck — pode ser number | boolean | string | null */
  is_check?: number | boolean | string | null;
  categoria?: string | null;
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
  codigo_canonico?: string | null;
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

type SortField = 'codigo' | 'nome' | 'dispositivo' | 'tipo' | 'modelo' | 'duracao' | 'manobras';
type SortDirection = 'asc' | 'desc';
type SortableColumn = { field: SortField; label: string };

const SORTABLE_COLUMNS: SortableColumn[] = [
  { field: 'codigo', label: 'Código' },
  { field: 'nome', label: 'Nome' },
  { field: 'dispositivo', label: 'Dispositivo' },
  { field: 'tipo', label: 'Tipo' },
  { field: 'modelo', label: 'Modelo' },
  { field: 'duracao', label: 'Duração' },
  { field: 'manobras', label: 'Manobras' },
];

export default function ModelosSessaoPage({ embedded = false, onBack }: ModelosSessaoPageProps) {
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
  // True when editing a model whose physical codigo carries an internal
  // versioning suffix distinct from its canonical display code — that
  // suffix is managed by the matrix import system and must not be
  // silently overwritten by a form save.
  const codigoSomenteLeitura = Boolean(
    modeloSelecionado?.codigo_canonico &&
      modeloSelecionado.codigo_canonico !== modeloSelecionado.codigo,
  );
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
  const [carregandoDetalhesModelo, setCarregandoDetalhesModelo] = useState(false);

  const SORT_STORAGE_KEY = `airtrust:modelos-sessao:${embedded ? 'embedded' : 'full'}:sort`;

  const getStoredSort = useCallback((): { field: SortField; direction: SortDirection } => {
    try {
      const stored = localStorage.getItem(SORT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && 'field' in parsed && 'direction' in parsed) {
          return parsed as { field: SortField; direction: SortDirection };
        }
      }
    } catch {}
    return { field: 'codigo', direction: 'asc' };
  }, [SORT_STORAGE_KEY]);

  const [sortField, setSortFieldState] = useState<SortField>(() => getStoredSort().field);
  const [sortDirection, setSortDirectionState] = useState<SortDirection>(() => getStoredSort().direction);

  const setSortField = (field: SortField) => {
    setSortFieldState(field);
    const dir = getStoredSort().direction;
    try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ field, direction: dir })); } catch {}
  };

  const setSortDirection = (direction: SortDirection) => {
    setSortDirectionState(direction);
    try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ field: sortField, direction })); } catch {}
  };

  const setSort = (field: SortField, direction: SortDirection) => {
    setSortFieldState(field);
    setSortDirectionState(direction);
    try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ field, direction })); } catch {}
  };

  const handleSortClick = (field: SortField) => {
    if (field === sortField) {
      const newDir = sortDirection === 'asc' ? 'desc' : 'asc';
      setSort(field, newDir);
    } else {
      setSort(field, 'asc');
    }
  };

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
      const resCats = await fetch(`${API_BASE_URL}/categorias?ativo=1`, { headers: _authH() as Record<string, string> });
      const dataCats = await resCats.json();
      const categorias = Array.isArray(dataCats.data) ? dataCats.data : [];
      
      const catVoo = categorias.find((c: QualificacaoTipo) => c.codigo === 'VOO');
      const catCheck = categorias.find((c: QualificacaoTipo) => c.codigo === 'CHECK');

      const sortData = (arr: QualificacaoTipo[]) => {
        return arr.sort((a, b) => {
          const c1 = String(a.codigo || '').toLowerCase();
          const c2 = String(b.codigo || '').toLowerCase();
          if (c1 < c2) return -1;
          if (c1 > c2) return 1;
          const n1 = String(a.nome || '').toLowerCase();
          const n2 = String(b.nome || '').toLowerCase();
          return n1.localeCompare(n2);
        });
      };

      const vooUrl = catVoo?.id 
        ? `${API_BASE_URL}/qualificacoes/tipos?ativo=1&categoria_id=${catVoo.id}`
        : `${API_BASE_URL}/qualificacoes/tipos?ativo=1&categoria=VOO`;
      const resVoo = await fetch(vooUrl, { headers: _authH() as Record<string, string> });
      const dataVoo = await resVoo.json();
      if (dataVoo.success) {
        setQualificacoesTipos(sortData(dataVoo.data || []));
      }

      const checkUrl = catCheck?.id
        ? `${API_BASE_URL}/qualificacoes/tipos?ativo=1&categoria_id=${catCheck.id}`
        : `${API_BASE_URL}/qualificacoes/tipos?ativo=1&categoria=CHECK`;
      const resCheck = await fetch(checkUrl, { headers: _authH() as Record<string, string> });
      const dataCheck = await resCheck.json();
      if (dataCheck.success) {
        const todos: QualificacaoTipo[] = [...(dataVoo.data || []), ...(dataCheck.data || [])];
        const uniqueTodos = Array.from(new Map(todos.map(item => [item.id, item])).values());
        
        // Usar helper normalizado: aceita is_check=1, is_check=true, categoria='CHECK' (case-insensitive)
        setTiposCheckFAP(sortData(uniqueTodos.filter(isQualificationCheck)));
        // Qualificação principal: tudo que NÃO é check
        setQualificacoesTipos(sortData(uniqueTodos.filter((q) => !isQualificationCheck(q))));
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
      const res = await fetch(`${API_BASE_URL}/simuladores/manobras`, {
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
        // Carregar todos os IDs vinculados sem filtro de aeronave — preservar seleções existentes.
        // O filtro de compatibilidade é aplicado apenas na UI (checksCompativeis).
        setChecksIdsModelo(data.data.map((c: { id: number }) => Number(c.id)));
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
      setCodigo(modelo.codigo_canonico || modelo.codigo);
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
    
    if (geraQualificacao && checksIncompativeis.length > 0) {
      toast.warning('Remova os checks incompatíveis antes de salvar.');
      return;
    }

    try {
      // When editing a versioned model, `codigo` displays the clean
      // codigo_canonico (read-only in that case) — never submit that in
      // place of the physical codigo, which carries the internal
      // versioning identity (e.g. `@M2026.07-V2`) managed by the matrix
      // import system.
      const codigoParaSalvar = codigoSomenteLeitura ? modeloSelecionado!.codigo : codigo;
      const body = {
        codigo: codigoParaSalvar,
        nome,
        tipo: tipoDispositivo,
        tipo_sessao_id: tipoSessaoId,
        modelo_aeronave: tipoAeronave, // nome do modelo (ex: AW139)
        descricao,
        duracao_estimada: duracaoEstimada,
        gera_qualificacao: geraQualificacao ? 1 : 0,
        qualificacao_tipo_id: geraQualificacao ? qualificacaoTipoId : null,
        checks_ids: geraQualificacao ? checksIdsModelo : [],
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

  const sortCollator = useMemo(() => new Intl.Collator('pt-BR', { sensitivity: 'base' }), []);
  const codeCollator = useMemo(() => new Intl.Collator('pt-BR', { numeric: true }), []);
  // The physical `codigo` column may carry an internal versioning suffix
  // (e.g. `@M2026.07-V2`, `@M2026.07-REMEDIATION-<uuid>`) that must never
  // reach the user. `codigo_canonico` is the clean, user-facing code.
  const codigoExibicao = useCallback((m: ModeloSessao) => m.codigo_canonico || m.codigo, []);

  // Checks compatíveis com o equipamento selecionado no modal — derivado uma única vez
  const checksCompativeis = useMemo(
    () =>
      [...filterCompatibleChecks(tiposCheckFAP, tipoAeronave)].sort((a, b) =>
        codeCollator.compare(a.codigo, b.codigo),
      ),
    [tiposCheckFAP, tipoAeronave, codeCollator],
  );

  const checksIncompativeis = useMemo(() => {
    return checksIdsModelo
      .filter((id) => !checksCompativeis.some((c) => c.id === id))
      .map((id) => tiposCheckFAP.find((c) => c.id === id) || qualificacoesTipos.find((q) => q.id === id))
      .filter(Boolean) as QualificacaoTipo[];
  }, [checksIdsModelo, checksCompativeis, tiposCheckFAP, qualificacoesTipos]);

  const modelosFiltrados = useMemo(() => {
    const filtrados = modelos.filter((m) => {
      if (filtroTipoSessao && m.tipo_sessao_id !== filtroTipoSessao) return false;
      if (filtroTipoDispositivo && (m.tipo || 'SIMULADOR') !== filtroTipoDispositivo) return false;
      if (filtroModeloAeronave && m.modelo_aeronave !== filtroModeloAeronave) return false;
      return true;
    });

    return [...filtrados].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      let cmp = 0;

      switch (sortField) {
        case 'codigo':
          cmp = codeCollator.compare(codigoExibicao(a), codigoExibicao(b));
          break;
        case 'nome':
          cmp = sortCollator.compare(a.nome, b.nome);
          break;
        case 'dispositivo':
          cmp = sortCollator.compare(
            a.tipo || 'SIMULADOR',
            b.tipo || 'SIMULADOR',
          );
          break;
        case 'tipo':
          cmp = sortCollator.compare(
            a.tipo_sessao_nome || '',
            b.tipo_sessao_nome || '',
          );
          break;
        case 'modelo':
          cmp = sortCollator.compare(
            a.modelo_aeronave || '',
            b.modelo_aeronave || '',
          );
          break;
        case 'duracao':
          cmp = (a.duracao_estimada || 120) - (b.duracao_estimada || 120);
          break;
        case 'manobras':
          cmp = (a.total_manobras || 0) - (b.total_manobras || 0);
          break;
      }

      return cmp * dir;
    });
  }, [modelos, filtroTipoSessao, filtroTipoDispositivo, filtroModeloAeronave, sortField, sortDirection, sortCollator, codeCollator, codigoExibicao]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-7 w-48 rounded bg-slate-200 mb-2" />
          <div className="h-4 w-64 rounded bg-slate-100" />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 grid grid-cols-8 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3.5 grid grid-cols-8 gap-4 border-b border-gray-100 dark:border-slate-800">
              {[...Array(8)].map((_, j) => (
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
      <div className="flex items-center justify-between">
        <div>
          {embedded && onBack && (
            <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-1">
              <ArrowLeft className="w-3 h-3" />
              Gestão
            </button>
          )}
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Modelos de Sessão</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Configure modelos com suas manobras e ordem</p>
        </div>
        <Button onClick={() => abrirModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Modelo
        </Button>
      </div>

      {/* Filtros e Ordenação */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Dispositivo</label>
            <select
              value={filtroTipoDispositivo || ''}
              onChange={(e) => setFiltroTipoDispositivo((e.target.value as TipoDispositivo) || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
            >
              <option value="">Todos</option>
              <option value="SIMULADOR">Simulador</option>
              <option value="AERONAVE">Aeronave</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Filtrar por Tipo</label>
            <select
              value={filtroTipoSessao || ''}
              onChange={(e) => setFiltroTipoSessao(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Filtrar por Equipamento
            </label>
            <select
              value={filtroModeloAeronave || ''}
              onChange={(e) => setFiltroModeloAeronave(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
            >
              <option value="">Todos os equipamentos</option>
              {[...new Set(modelos.map((m) => m.modelo_aeronave).filter(Boolean))].map((modelo) => (
                <option key={modelo} value={modelo}>
                  {modelo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={() => {
                setFiltroTipoSessao(null);
                setFiltroTipoDispositivo(null);
                setFiltroModeloAeronave(null);
                setSort('codigo', 'asc');
              }}
              className="w-full"
            >
              Limpar Filtros
            </Button>
          </div>
        </div>
        <div className="text-sm text-gray-600 dark:text-slate-400">
          Exibindo <span className="font-semibold">{modelosFiltrados.length}</span> de{' '}
          <span className="font-semibold">{modelos.length}</span> modelos
        </div>
      </div>

      {/* Lista de Modelos */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              {SORTABLE_COLUMNS.map(({ field, label }) => {
                const isActive = sortField === field;
                const ariaSort: 'ascending' | 'descending' | 'none' = isActive
                  ? (sortDirection === 'asc' ? 'ascending' : 'descending')
                  : 'none';
                return (
                  <th
                    key={field}
                    aria-sort={ariaSort}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase"
                  >
                    <button
                      type="button"
                      onClick={() => handleSortClick(field)}
                      className={`inline-flex items-center gap-1 transition-colors ${
                        isActive
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {label}
                      {isActive ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {modelosFiltrados.map((modelo) => {
              const tipoInfo = tiposSessao.find((t) => t.id === modelo.tipo_sessao_id);
              return (
                <tr key={modelo.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center whitespace-nowrap px-2 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-mono rounded">
                      {codigoExibicao(modelo)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-slate-100">{modelo.nome}</p>
                      {modelo.descricao && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate max-w-md">
                          {modelo.descricao}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {(modelo.tipo || 'SIMULADOR') === 'AERONAVE' ? (
                      <span className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400">
                        Aeronave
                      </span>
                    ) : (
                      <span className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400">
                        Simulador
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {tipoInfo ? (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: tipoInfo.cor || getColorByIndex(tipoInfo.id) }}
                      >
                        {modelo.tipo_sessao_nome || '-'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600 dark:text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-gray-600 dark:text-slate-400">{modelo.modelo_aeronave || '-'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-sm text-gray-900 dark:text-slate-100">{modelo.duracao_estimada || 120} min</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="inline-flex items-center whitespace-nowrap px-2.5 py-1 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-semibold rounded">
                      {modelo.total_manobras || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => abrirModal(modelo)}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                      >
                        Editar
                      </Button>
                      <RowActionsMenu
                        label={`Mais ações para ${codigoExibicao(modelo)}`}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {modelosFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 mb-4">
            <Inbox className="w-8 h-8 text-gray-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">
            {modelos.length === 0
              ? 'Nenhum modelo cadastrado'
              : 'Nenhum modelo corresponde aos filtros'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md">
            {modelos.length === 0
              ? 'Crie modelos de sessão para padronizar os treinamentos.'
              : 'Ajuste os filtros para encontrar modelos de sessão específicos.'}
          </p>
        </div>
      )}

      {/* Modal Principal */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setModalAberto(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{modoEdicao ? 'Editar' : 'Novo'} Modelo</h3>
            </div>

            <div className="p-6 space-y-4">
              {carregandoDetalhesModelo && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                  Carregando checks FAP e manobras salvas do modelo...
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Código <span className="text-red-500">*</span></label>
                  <Input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    maxLength={20}
                    disabled={codigoSomenteLeitura}
                  />
                  {codigoSomenteLeitura && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      Código gerenciado pela versão vigente da matriz; não editável aqui.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Duração (min) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    value={duracaoEstimada}
                    onChange={(e) => setDuracaoEstimada(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nome <span className="text-red-500">*</span></label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
              </div>

              {/* Tipo de dispositivo: Simulador ou Aeronave */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Dispositivo <span className="text-red-500">*</span>
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
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300'
                            : 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                          : 'border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500 text-gray-600 dark:text-slate-400'
                      }`}
                    >
                      {opt === 'SIMULADOR' ? '🖥️ Simulador' : '✈️ Aeronave (Voo Real)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Tipo de Sessão <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Equipamento
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Descrição</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>

              {/* Checkbox Gera Qualificação */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
                <input
                  type="checkbox"
                  id="geraQualificacao"
                  checked={geraQualificacao}
                  onChange={(e) => setGeraQualificacao(e.target.checked)}
                  className="w-5 h-5 text-blue-600 bg-white border-gray-300 rounded focus:ring-primary/30"
                />
                <label htmlFor="geraQualificacao" className="flex-1 cursor-pointer">
                  <span className="font-medium text-gray-900 dark:text-slate-100">Gera Qualificação</span>
                  <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                    Ao finalizar esta sessão, o botão "Gerar Qualificação" será exibido na ficha de
                    avaliação
                  </p>
                </label>
              </div>

              {/* Qualificação e FAPs (só aparece quando Gera Qualificação está ativo) */}
              {geraQualificacao && (
                <div className="space-y-4 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg">
                  <div>
                    <label className="block text-sm font-semibold text-green-900 dark:text-green-300 mb-1">
                      Qualificação de Voo Gerada
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-green-300 dark:border-green-500/30 rounded-md text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
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
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      Esta qualificação será gerada automaticamente ao clicar em "Gerar
                      Qualificação"
                    </p>
                  </div>

                  {checksCompativeis.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-green-900 dark:text-green-300 mb-2">
                        Checks FAP Padrão desta Sessão{' '}
                        <span className="font-normal text-green-700 dark:text-green-400">
                          ({checksCompativeis.length})
                        </span>
                      </label>
                      <p className="text-xs text-green-700 dark:text-green-400 mb-2">
                        Estes checks FAP serão pré-selecionados ao criar uma sessão com este modelo.
                        As FAPs aprovadas também geram qualificações automáticas.
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {checksCompativeis.map((check) => (
                          <label
                            key={check.id}
                            className="flex items-center gap-2 p-2 hover:bg-green-100 dark:hover:bg-green-500/20 rounded cursor-pointer"
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
                              <span className="text-xs font-mono bg-green-200 dark:bg-green-500/30 text-green-800 dark:text-green-300 px-1.5 py-0.5 rounded">
                                {check.codigo}
                              </span>
                              <span className="text-sm text-green-900 dark:text-green-300 ml-1.5">{check.nome}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {checksIncompativeis.length > 0 && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <label className="block text-sm font-semibold text-red-900 dark:text-red-300 mb-1">
                            Atenção: Checks Incompatíveis Detectados
                          </label>
                          <p className="text-xs text-red-700 dark:text-red-400 mb-2">
                            O modelo de aeronave selecionado ({tipoAeronave}) não é compatível com os seguintes checks já vinculados:
                          </p>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {checksIncompativeis.map((check) => (
                              <span key={check.id} className="text-xs font-mono bg-red-200 dark:bg-red-500/30 text-red-800 dark:text-red-300 px-1.5 py-0.5 rounded">
                                {check.codigo}
                              </span>
                            ))}
                          </div>
                        </div>
                        <Button
                          type="button"
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                          onClick={() => {
                            setChecksIdsModelo((prev) =>
                              prev.filter((id) => !checksIncompativeis.some((c) => c.id === id)),
                            );
                          }}
                        >
                          Remover checks incompatíveis
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-slate-700 pt-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
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
                        className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 p-2 rounded border border-gray-200 dark:border-slate-700"
                      >
                        <span className="text-xs font-mono text-gray-500 dark:text-slate-400 w-6">{m.ordem}</span>
                        <span className="text-xs font-mono bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded shrink-0">
                          {m.manobra_codigo}
                        </span>
                        <span className="text-sm flex-1 truncate text-gray-900 dark:text-slate-100">
                          {m.manobra_nome || m.manobra_descricao}
                        </span>
                        {/* Seletor A / B / AB */}
                        <div className="flex rounded overflow-hidden border border-gray-300 dark:border-slate-600 shrink-0 text-xs font-bold">
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
                                  : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
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
                            className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded disabled:opacity-30"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moverManobra(idx, 'down')}
                            disabled={idx === manobrasSelecionadas.length - 1}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded disabled:opacity-30"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removerManobra(m.manobra_id)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-4">
                    Nenhuma manobra adicionada
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-2">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in" onClick={() => setModalManobras(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Adicionar Manobras</h3>
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
                      className={`w-full text-left p-3 rounded border transition-colors ${
                        adicionada
                          ? 'bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-700 opacity-50 cursor-not-allowed'
                          : 'bg-white dark:bg-slate-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 border-gray-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="font-mono text-xs bg-gray-200 dark:bg-slate-700 px-2 py-0.5 rounded text-gray-800 dark:text-slate-300">
                        {m.codigo}
                      </span>
                      <p className="text-sm mt-1 text-gray-900 dark:text-slate-100">{m.nome || m.descricao}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-slate-700">
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
