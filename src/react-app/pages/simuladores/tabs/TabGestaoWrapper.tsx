/**
 * TabGestaoWrapper - Aba Gestão com navegação interna
 * Os cadastros abrem DENTRO da aba, não como páginas separadas
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { appFetch } from '@/react-app/lib/app-fetch';
import {
  Plane,
  Settings,
  ClipboardCheck,
  FileText,
  BookOpen,
  BookOpenCheck,
  Library,
  ArrowUpRight,
  ArrowLeft,
} from 'lucide-react';
import { useGuiasInstrutorPermissions } from '@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions';

function useCountUp(target: number, duration = 600, start = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!start || target === 0) {
      setValue(target);
      return;
    }
    startTimeRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, start]);

  return value;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-3.5">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-slate-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-3 w-40 rounded bg-slate-100" />
        </div>
        <div className="h-5 w-8 rounded bg-slate-100" />
      </div>
    </div>
  );
}

// Import direto dos componentes de cadastro (sem lazy loading para evitar erros de fetch)
import SimuladoresPage from '../cadastros/simuladores/index';
import ManobrasPage from '../cadastros/manobras/index';
import CategoriasPage from '../cadastros/categorias/index';
import TiposSessaoPage from '../cadastros/tipos-sessao/index';
import ModelosSessaoPage from '../cadastros/modelos-sessao/index';
import CurriculosVooPage from '../cadastros/curriculos-voo/index';

type SubView = 'menu' | 'simuladores' | 'manobras' | 'categorias' | 'tipos' | 'modelos' | 'curriculos';

interface GestaoStats {
  simuladores: number;
  manobras: number;
  categorias: number;
  tiposSessao: number;
  modelosSessao: number;
  curriculosVoo: number;
}

const colorClasses: Record<string, { icon: string; badge: string }> = {
  blue:   { icon: 'bg-blue-100 text-blue-700',        badge: 'bg-blue-50 text-blue-700' },
  green:  { icon: 'bg-emerald-100 text-emerald-700',  badge: 'bg-emerald-50 text-emerald-700' },
  purple: { icon: 'bg-violet-100 text-violet-700',    badge: 'bg-violet-50 text-violet-700' },
  orange: { icon: 'bg-amber-100 text-amber-700',       badge: 'bg-amber-50 text-amber-700' },
  indigo: { icon: 'bg-indigo-100 text-indigo-700',     badge: 'bg-indigo-50 text-indigo-700' },
  teal:   { icon: 'bg-teal-100 text-teal-700',         badge: 'bg-teal-50 text-teal-700' },
};

export default function TabGestaoWrapper() {
  const navigate = useNavigate();
  const { podeGerenciar: podeGerenciarGuias } = useGuiasInstrutorPermissions();
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubView>('menu');
  const [stats, setStats] = useState<GestaoStats>({
    simuladores: 0,
    manobras: 0,
    categorias: 0,
    tiposSessao: 0,
    modelosSessao: 0,
    curriculosVoo: 0,
  });
  // Sentinel: null = carregando, false = OK, true = erro naquela entidade
  const [entityErrors, setEntityErrors] = useState<Record<string, boolean>>({});

  const countSim = useCountUp(stats.simuladores, 500, dataReady);
  const countMan = useCountUp(stats.manobras, 500, dataReady);
  const countCat = useCountUp(stats.categorias, 500, dataReady);
  const countTip = useCountUp(stats.tiposSessao, 500, dataReady);
  const countMod = useCountUp(stats.modelosSessao, 500, dataReady);
  const countCur = useCountUp(stats.curriculosVoo, 500, dataReady);

  // countMap usa os IDs dos cards como chave
  const countMap: Record<string, number> = {
    simuladores: countSim,
    manobras: countMan,
    categorias: countCat,
    tipos: countTip,
    modelos: countMod,
    curriculos: countCur,
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setDataReady(false);
      setErro(null);
      setEntityErrors({});
      const _gt = getAccessToken();
      const _gh = _gt ? { Authorization: `Bearer ${_gt}` } : {};
      const noStore = { headers: _gh, cache: 'no-store' as RequestCache };
      const [simRes, manobrasRes, categoriasRes, tiposRes, modelosRes, curriculosRes] = await Promise.all([
        fetch(`${API_BASE_URL}/simuladores?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/manobras?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/categorias?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/tipos-sessao?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/modelos-sessao?_=${Date.now()}`, noStore),
        appFetch(`/api/simuladores/curriculos-voo?_=${Date.now()}`, { cache: 'no-store' }),
      ]);

      const [simData, manobrasData, categoriasData, tiposData, modelosData, curriculosData] = await Promise.all([
        simRes.ok ? simRes.json() : Promise.resolve(null),
        manobrasRes.ok ? manobrasRes.json() : Promise.resolve(null),
        categoriasRes.ok ? categoriasRes.json() : Promise.resolve(null),
        tiposRes.ok ? tiposRes.json() : Promise.resolve(null),
        modelosRes.ok ? modelosRes.json() : Promise.resolve(null),
        curriculosRes.ok ? curriculosRes.json() : Promise.resolve(null),
      ]);

      // Track which entities failed
      const failures: Record<string, boolean> = {};
      let anyFailure = false;

      const calc = (data: any, key: string): number => {
        if (!data) { failures[key] = true; anyFailure = true; return 0; }
        if (!data.success) { failures[key] = true; anyFailure = true; return 0; }
        return data.data?.length || 0;
      };

      setStats({
        simuladores: calc(simData, 'simuladores'),
        manobras: calc(manobrasData, 'manobras'),
        categorias: calc(categoriasData, 'categorias'),
        tiposSessao: calc(tiposData, 'tipos'),
        modelosSessao: calc(modelosData, 'modelos'),
        curriculosVoo: calc(curriculosData, 'curriculos'),
      });
      setEntityErrors(failures);
      if (anyFailure) {
        setErro('Alguns dados não puderam ser carregados. Verifique sua conexão e tente novamente.');
      }
      setDataReady(true);
    } catch (error) {
      console.error('Erro ao carregar dados de gestao:', error);
      setErro('Não foi possível carregar os dados de gestão. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const gestaoCards = [
    {
      id: 'simuladores' as SubView,
      titulo: 'Simuladores',
      descricao: 'Equipamentos de simulação disponíveis',
      icon: Plane,
      color: 'blue',
      valor: stats.simuladores,
    },
    {
      id: 'manobras' as SubView,
      titulo: 'Manobras',
      descricao: 'Exercícios e procedimentos avaliados',
      icon: Settings,
      color: 'green',
      valor: stats.manobras,
    },
    {
      id: 'categorias' as SubView,
      titulo: 'Categorias',
      descricao: 'Classificação de manobras por tipo',
      icon: ClipboardCheck,
      color: 'purple',
      valor: stats.categorias,
    },
    {
      id: 'tipos' as SubView,
      titulo: 'Tipos de Sessão',
      descricao: 'Categorias de treinamento e avaliação',
      icon: FileText,
      color: 'orange',
      valor: stats.tiposSessao,
    },
    {
      id: 'modelos' as SubView,
      titulo: 'Modelos de Sessão',
      descricao: 'Templates reutilizáveis de sessões',
      icon: BookOpen,
      color: 'indigo',
      valor: stats.modelosSessao,
    },
    {
      id: 'curriculos' as SubView,
      titulo: 'Currículos de Voo',
      descricao: 'Sessões e ordem que compõem cada treinamento',
      icon: BookOpenCheck,
      color: 'teal',
      valor: stats.curriculosVoo,
    },
  ];

  const estruturaCards = gestaoCards.filter((c) => ['simuladores', 'tipos', 'modelos', 'curriculos'].includes(c.id));
  const bibliotecaCards = gestaoCards.filter((c) => ['manobras', 'categorias'].includes(c.id));

  const renderCard = (card: typeof gestaoCards[number]) => {
    const Icon = card.icon;
    const colors = colorClasses[card.color];
    const count = countMap[card.id];
    const hasError = entityErrors[card.id] === true;
    return (
      <button
        key={card.id}
        onClick={() => setSubView(card.id)}
        className="group flex items-center gap-3 w-full rounded-lg border border-gray-200 bg-white p-3.5 text-left transition-all duration-150 hover:border-gray-300 hover:shadow-sm"
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{card.titulo}</p>
          <p className="text-xs text-gray-500 mt-0.5">{card.descricao}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasError ? (
            <span
              className="text-xs font-semibold text-red-600"
              title="Falha ao carregar. Este total nao representa zero real."
            >
              Erro
            </span>
          ) : (
            <span className="text-lg font-semibold text-gray-900 tabular-nums">{count}</span>
          )}
          <ArrowUpRight className="h-3.5 w-3.5 text-gray-400 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </button>
    );
  };

  // Sub-view render
  if (subView !== 'menu') {
    const handleBack = () => {
      setSubView('menu');
      fetchData();
    };

    return (
      <div className="animate-fade-in">
        {subView === 'simuladores' && <SimuladoresPage embedded onBack={handleBack} />}
        {subView === 'manobras' && <ManobrasPage embedded onBack={handleBack} />}
        {subView === 'categorias' && <CategoriasPage embedded onBack={handleBack} />}
        {subView === 'tipos' && <TiposSessaoPage embedded onBack={handleBack} />}
        {subView === 'modelos' && <ModelosSessaoPage embedded onBack={handleBack} />}
        {subView === 'curriculos' && <CurriculosVooPage embedded onBack={handleBack} />}
      </div>
    );
  }

  // Menu principal de gestão
  return (
    <div className="animate-fade-in space-y-5">
      {/* Page header — mesmo estilo das sub-páginas */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Gestão</h2>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie a estrutura operacional e a biblioteca pedagógica dos simuladores.
        </p>
      </div>

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{erro}</p>
              <p className="mt-1">
                As fontes com falha aparecem como <span className="font-semibold">Erro</span> e
                nao como zero real.
              </p>
            </div>
            <button
              onClick={() => {
                void fetchData();
              }}
              className="shrink-0 rounded-md bg-amber-100 px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-200"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
            <div className="grid gap-2.5">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
            <div className="grid gap-2.5">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Estrutura operacional */}
          <section className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Estrutura operacional</p>
            <div className="grid gap-2.5">
              {estruturaCards.map(renderCard)}
            </div>
          </section>

          {/* Biblioteca de avaliação */}
          <section className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Biblioteca de avaliação</p>
            <div className="grid gap-2.5">
              {bibliotecaCards.map(renderCard)}
              {podeGerenciarGuias && (
                <button
                  onClick={() => navigate('/simuladores/configuracoes/guias-instrutor')}
                  className="group flex items-center gap-3 w-full rounded-lg border border-gray-200 bg-white p-3.5 text-left transition-all duration-150 hover:border-gray-300 hover:shadow-sm"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                    <Library className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">Gerenciar Guias do Instrutor</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Publicação, versionamento e vínculo com sessões
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
