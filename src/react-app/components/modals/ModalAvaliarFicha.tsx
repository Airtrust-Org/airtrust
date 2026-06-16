/**
 * MODAL: Avaliar Ficha de Sessão
 * Permite ao instrutor avaliar as manobras e adicionar observações gerais
 * Redesenhado: layout full-page inspirado em formulário de avaliação aeronáutica
 */

import { useState, useEffect } from 'react';
import { X, Save, Info, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

type Tripulante = 'A' | 'B' | 'AB';
type NotaValor = number | null | 'NR';

interface Manobra {
  id: number;
  ordem: number;
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  resultado: NotaValor;
  observacoes: string;
  tripulante?: Tripulante;
}

interface FichaContexto {
  colaborador_id_aluno?: number;
  instrutor_id?: number;
  data_sessao?: string;
  tipo_sessao?: string;
  sessao_titulo?: string;
  tipo_aeronave?: string;
  participante_nome?: string;
  participante_funcao?: string;
  instrutor_nome?: string;
}

interface ModalAvaliarFichaProps {
  isOpen: boolean;
  onClose: () => void;
  fichaId: number;
  onSucesso: () => void;
}

/** Normaliza o resultado vindo da API para NotaValor */
function normalizeResultado(raw: unknown): NotaValor {
  if (raw === null || raw === undefined) return null;
  if (raw === 'NR' || raw === 'NAO_REALIZADA') return 'NR';
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Badge de tripulante – versão pill/chip (light background) */
function TripulanteBadge({ tripulante }: { tripulante?: Tripulante }) {
  if (!tripulante || tripulante === 'AB') {
    return (
      <span className="inline-flex items-center justify-center bg-violet-50 text-violet-600 border border-violet-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0">
        AB
      </span>
    );
  }
  if (tripulante === 'A') {
    return (
      <span className="inline-flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0">
        A
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center bg-orange-50 text-orange-600 border border-orange-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0">
      B
    </span>
  );
}

/** Cor do botão de nota – Apple-inspired: neutral unselected, soft color when selected */
function getScoreButtonClass(resultado: NotaValor, targetNota: number): string {
  const isSelected = resultado === targetNota;
  if (!isSelected) {
    return 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700';
  }
  if (targetNota >= 1 && targetNota <= 4)
    return 'border border-rose-300 bg-rose-50 text-rose-700 font-semibold ring-1 ring-rose-200';
  if (targetNota >= 5 && targetNota <= 7)
    return 'border border-amber-300 bg-amber-50 text-amber-700 font-semibold ring-1 ring-amber-200';
  return 'border border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-200';
}

/** Formata data YYYY-MM-DD → DD/MM/YYYY */
function formatarData(data?: string): string {
  if (!data) return '';
  const parts = data.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return data;
}

/** Divide o título da sessão em título principal e subtítulo */
function splitTitulo(titulo?: string): { principal: string; sub?: string } {
  if (!titulo) return { principal: 'Ficha de Avaliação' };
  // Tenta separar pelo último ":" ou " - " ou " / "
  const sepMatch = titulo.match(/^(.+?)[\s–\-:\/]+(.+)$/);
  if (sepMatch && sepMatch[1].length < 40) {
    return { principal: sepMatch[1].trim(), sub: sepMatch[2].trim() };
  }
  return { principal: titulo };
}

export default function ModalAvaliarFicha({
  isOpen,
  onClose,
  fichaId,
  onSucesso,
}: ModalAvaliarFichaProps) {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [manobras, setManobras] = useState<Manobra[]>([]);
  const [observacoesGerais, setObservacoesGerais] = useState('');
  const [fichaContexto, setFichaContexto] = useState<FichaContexto>({});
  const [descExpandida, setDescExpandida] = useState<Set<number>>(new Set());

  // Reset ao abrir
  useEffect(() => {
    if (isOpen) {
      setDescExpandida(new Set());
    }
  }, [isOpen]);

  // Carregar ficha quando modal abrir
  useEffect(() => {
    if (isOpen && fichaId) {
      const carregarFicha = async () => {
        try {
          setLoading(true);
          const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${fichaId}`, {
            headers: { Authorization: `Bearer ${getAccessToken()}` },
          });

          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.success || !result?.data) {
            toast.error(
              result?.error ||
                'Não foi possível carregar a ficha. Tente novamente ou acione o administrador.',
            );
            onClose();
            return;
          }

          if (result.success && result.data) {
            const mapManobras = (raw: unknown[]): Manobra[] =>
              raw.map((m: any) => ({
                ...m,
                nome: m.nome || m.descricao || m.codigo,
                resultado: normalizeResultado(m.resultado),
                tripulante: (['A', 'B', 'AB'].includes(String(m.tripulante || '').toUpperCase())
                  ? String(m.tripulante).toUpperCase()
                  : 'AB') as Tripulante,
              }));

            const ctx: FichaContexto = {
              colaborador_id_aluno: result.data.colaborador_id_aluno,
              instrutor_id: result.data.instrutor_id,
              data_sessao: result.data.data_sessao || result.data.data,
              tipo_sessao: result.data.tipo_sessao || result.data.sessao_titulo,
              sessao_titulo: result.data.sessao_titulo,
              tipo_aeronave: result.data.tipo_aeronave || result.data.simulador,
              participante_nome: result.data.tripulante_nome || result.data.participante_nome,
              participante_funcao: result.data.tripulante_funcao || result.data.participante_funcao,
              instrutor_nome: result.data.instrutor_nome,
            };
            setFichaContexto(ctx);

            const manobrasCarregadas = result.data.manobras || [];

            if (manobrasCarregadas.length === 0) {
              toast.error(
                'Ficha sem manobras. Corrija o cadastro do modelo antes de avaliar o tripulante.',
              );
              onClose();
            } else {
              console.log('✅ [CARREGAMENTO] Manobras recebidas:', manobrasCarregadas.length);
              setManobras(mapManobras(manobrasCarregadas));
              setObservacoesGerais(result.data.observacoes_gerais || '');
            }
          }
        } catch (error) {
          console.error('Erro ao carregar ficha:', error);
          toast.error('Erro ao carregar ficha');
          onClose();
        } finally {
          setLoading(false);
        }
      };

      carregarFicha();
    }
  }, [isOpen, fichaId, onClose]);

  const handleNotaChange = (manobraOrdem: number, nota: NotaValor) => {
    setManobras((prev) =>
      prev.map((m) => (m.ordem === manobraOrdem ? { ...m, resultado: nota } : m)),
    );
  };

  const handleObservacaoChange = (manobraOrdem: number, obs: string) => {
    setManobras((prev) =>
      prev.map((m) => (m.ordem === manobraOrdem ? { ...m, observacoes: obs } : m)),
    );
  };

  const salvarDados = async () => {
    const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${fichaId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        recalculate_status: true,
        observacoes: observacoesGerais,
        manobras: manobras.map((m) => ({
          ordem: m.ordem,
          resultado: m.resultado,
          observacoes: m.observacoes || '',
        })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Erro ao salvar avaliação');
    }
  };

  /** Salva rascunho sem fechar o modal */
  const handleSalvarRascunho = async () => {
    try {
      setSalvando(true);
      await salvarDados();
      toast.success('Rascunho salvo!');
    } catch (error) {
      console.error('❌ Erro ao salvar rascunho:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  /** Finaliza: salva e fecha */
  const handleFinalizar = async () => {
    try {
      setSalvando(true);
      await salvarDados();
      toast.success('Avaliação finalizada com sucesso!');
      onSucesso();
      onClose();
    } catch (error) {
      console.error('❌ Erro ao finalizar avaliação:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar avaliação');
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  const toggleDescricao = (ordem: number) => {
    setDescExpandida((prev) => {
      const next = new Set(prev);
      if (next.has(ordem)) next.delete(ordem);
      else next.add(ordem);
      return next;
    });
  };

  const { principal: tituloP, sub: tituloSub } = splitTitulo(fichaContexto.sessao_titulo);

  // Rótulo de função
  const funcaoLabel =
    fichaContexto.participante_funcao === 'PIC'
      ? 'Tripulante A'
      : fichaContexto.participante_funcao === 'SIC'
        ? 'Tripulante B'
        : fichaContexto.participante_funcao || '';

  // Progress indicator
  const totalManobras = manobras.length;
  const doneManobras = manobras.filter((m) => m.resultado !== null).length;
  const progressPercent = totalManobras > 0 ? Math.round((doneManobras / totalManobras) * 100) : 0;

  const renderManobra = (man: Manobra) => {
    const temDescricao = !!man.descricao && man.descricao !== man.nome;
    const expandida = descExpandida.has(man.ordem);

    return (
      <div
        key={man.id}
        className="bg-white rounded-xl border border-gray-100 p-4 transition-all hover:border-gray-200"
      >
        {/* Cabeçalho: badge + nome + código + botão info */}
        <div className="flex items-start gap-3 mb-3">
          <TripulanteBadge tripulante={man.tripulante} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">
                  {man.ordem}. {man.nome}
                </p>
                {temDescricao && (
                  <p
                    className={`text-xs text-gray-500 mt-1 leading-snug ${expandida ? '' : 'line-clamp-2'}`}
                  >
                    {man.descricao}
                  </p>
                )}
                <p className="text-[10px] font-mono text-gray-400 mt-1 uppercase tracking-wide">
                  {man.codigo}
                </p>
              </div>
              {temDescricao && (
                <button
                  onClick={() => toggleDescricao(man.ordem)}
                  className={`shrink-0 p-1 rounded-full transition mt-0.5 ${
                    expandida
                      ? 'bg-blue-50 text-blue-500'
                      : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                  }`}
                  title={expandida ? 'Recolher descrição' : 'Ver descrição completa'}
                >
                  <Info size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Botões de nota: grid responsivo — 6 colunas no mobile, 11 no sm+ */}
        <div className="grid grid-cols-6 sm:grid-cols-11 gap-1 sm:gap-1 mb-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((nota) => (
            <button
              key={nota}
              onClick={() => handleNotaChange(man.ordem, man.resultado === nota ? null : nota)}
              className={`h-9 w-full rounded-lg text-xs font-medium transition-all ${getScoreButtonClass(man.resultado, nota)}`}
            >
              {nota}
            </button>
          ))}
          {/* NR — ocupa 2 colunas no mobile para alinhar com a segunda linha */}
          <button
            onClick={() => handleNotaChange(man.ordem, man.resultado === 'NR' ? null : 'NR')}
            className={`col-span-2 sm:col-span-1 h-9 w-full rounded-lg text-xs font-medium transition-all ${
              man.resultado === 'NR'
                ? 'border border-slate-300 bg-slate-100 text-slate-600 font-semibold ring-1 ring-slate-200'
                : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700'
            }`}
            title="Não Realizado"
          >
            NR
          </button>
        </div>

        {/* Observações */}
        <textarea
          value={man.observacoes}
          onChange={(e) => handleObservacaoChange(man.ordem, e.target.value)}
          placeholder="Observações desta manobra (opcional)"
          className="w-full px-3 py-2 text-xs text-gray-600 border border-gray-100 rounded-lg bg-gray-50/50 placeholder-gray-300 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 resize-none transition"
          rows={2}
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-modal overflow-y-auto bg-gray-50">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Esquerda: back button + título + progress count */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              disabled={salvando}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition shrink-0"
              title="Fechar"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <span className="text-sm font-semibold text-gray-900">Avaliação de Ficha</span>
              {!loading && totalManobras > 0 && (
                <span className="ml-3 text-xs text-gray-400">
                  {doneManobras}/{totalManobras} manobras
                </span>
              )}
            </div>
          </div>

          {/* Direita: ações */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSalvarRascunho}
              disabled={salvando || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition"
            >
              <Save size={13} />
              <span className="hidden sm:inline">Salvar Rascunho</span>
              <span className="sm:hidden">Rascunho</span>
            </button>
            <button
              onClick={handleFinalizar}
              disabled={salvando || loading}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-primary disabled:opacity-50 transition"
            >
              {salvando ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : null}
              Finalizar
            </button>
            <button
              onClick={onClose}
              disabled={salvando}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {!loading && totalManobras > 0 && (
          <div className="h-0.5 bg-gray-100 absolute bottom-0 left-0 right-0">
            <div
              className="h-0.5 bg-blue-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Conteúdo ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Header: clean white with metadata */}
          <div className="bg-white border-b border-gray-100">
            <div className="px-5 py-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                  {fichaContexto.tipo_aeronave || 'Simulador'}
                  {fichaContexto.data_sessao ? ` · ${formatarData(fichaContexto.data_sessao)}` : ''}
                </span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">{tituloP}</h1>
              {tituloSub && <p className="text-sm text-gray-500 mt-0.5">{tituloSub}</p>}
            </div>
          </div>

          {/* Boxes de participantes */}
          <div className="grid grid-cols-2 gap-px bg-gray-100">
            {/* Avaliador */}
            <div className="bg-white px-5 py-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Avaliador
              </p>
              <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">
                {fichaContexto.instrutor_nome || '—'}
              </p>
            </div>
            {/* Avaliado */}
            <div className="bg-white px-5 py-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Avaliado{funcaoLabel ? ` · ${funcaoLabel}` : ''}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm font-medium text-gray-900">
                  {fichaContexto.participante_nome || '—'}
                </p>
                {fichaContexto.participante_funcao === 'PIC' && (
                  <span className="inline-flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                    A
                  </span>
                )}
                {fichaContexto.participante_funcao === 'SIC' && (
                  <span className="inline-flex items-center justify-center bg-orange-50 text-orange-600 border border-orange-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                    B
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Legenda */}
        <div className="bg-white rounded-xl border border-gray-100 px-4 sm:px-5 py-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-6 gap-y-3">
            {/* Notas */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
              <span className="font-medium text-gray-400 uppercase tracking-wider text-[10px] shrink-0">
                Notas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>1–4
                Insatisfatório
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>5–7 Regular
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>8–10 Excelente
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0"></span>NR
              </span>
            </div>

            {/* Divider */}
            <div className="h-px w-full sm:h-4 sm:w-px bg-gray-100" />

            {/* PF */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
              <span className="font-medium text-gray-400 uppercase tracking-wider text-[10px] shrink-0">
                PF
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                  A
                </span>
                Tripulante A
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center bg-orange-50 text-orange-600 border border-orange-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                  B
                </span>
                Tripulante B
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center bg-violet-50 text-violet-600 border border-violet-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                  AB
                </span>
                Ambos
              </span>
            </div>
          </div>
        </div>

        {/* Manobras */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Carregando manobras...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {manobras.map(renderManobra)}
            </div>

            {/* Observações Gerais */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Observações Gerais da Sessão
              </label>
              <textarea
                value={observacoesGerais}
                onChange={(e) => setObservacoesGerais(e.target.value)}
                placeholder="Adicione observações gerais sobre o desempenho na sessão..."
                className="w-full px-3 py-2 text-xs text-gray-600 border border-gray-100 rounded-lg bg-gray-50/50 placeholder-gray-300 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 resize-none transition"
                rows={4}
              />
            </div>

            {/* Footer CTA */}
            <div className="flex justify-center pb-8">
              <button
                onClick={handleFinalizar}
                disabled={salvando}
                className="flex items-center gap-2 px-10 py-3 text-sm font-semibold text-white bg-blue-500 rounded-xl hover:bg-primary disabled:opacity-50 transition-all"
              >
                {salvando ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : null}
                Finalizar Avaliação da Ficha
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
