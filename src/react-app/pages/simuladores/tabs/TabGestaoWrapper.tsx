/**
 * TabGestaoWrapper - Aba Gestão com navegação interna
 * Os cadastros abrem DENTRO da aba, não como páginas separadas
 */

import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import {
  Plane,
  Settings,
  ClipboardCheck,
  FileText,
  BookOpen,
  ArrowUpRight,
  ArrowLeft,
} from 'lucide-react';

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

type SubView = 'menu' | 'simuladores' | 'manobras' | 'categorias' | 'tipos' | 'modelos';

interface GestaoStats {
  simuladores: number;
  manobras: number;
  categorias: number;
  tiposSessao: number;
  modelosSessao: number;
}

const colorClasses: Record<string, { icon: string; badge: string }> = {
  blue:   { icon: 'bg-blue-100 text-blue-700',       badge: 'bg-blue-50 text-blue-700' },
  green:  { icon: 'bg-emerald-100 text-emerald-700',  badge: 'bg-emerald-50 text-emerald-700' },
  purple: { icon: 'bg-violet-100 text-violet-700',    badge: 'bg-violet-50 text-violet-700' },
  orange: { icon: 'bg-amber-100 text-amber-700',      badge: 'bg-amber-50 text-amber-700' },
  indigo: { icon: 'bg-indigo-100 text-indigo-700',    badge: 'bg-indigo-50 text-indigo-700' },
};

export default function TabGestaoWrapper() {
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [subView, setSubView] = useState<SubView>('menu');
  const [stats, setStats] = useState<GestaoStats>({
    simuladores: 0,
    manobras: 0,
    categorias: 0,
    tiposSessao: 0,
    modelosSessao: 0,
  });

  const countSim = useCountUp(stats.simuladores, 500, dataReady);
  const countMan = useCountUp(stats.manobras, 500, dataReady);
  const countCat = useCountUp(stats.categorias, 500, dataReady);
  const countTip = useCountUp(stats.tiposSessao, 500, dataReady);
  const countMod = useCountUp(stats.modelosSessao, 500, dataReady);

  // countMap usa os IDs dos cards como chave
  const countMap: Record<string, number> = {
    simuladores: countSim,
    manobras: countMan,
    categorias: countCat,
    tipos: countTip,
    modelos: countMod,
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setDataReady(false);
      const _gt = getAccessToken();
      const _gh = _gt ? { Authorization: `Bearer ${_gt}` } : {};
      const noStore = { headers: _gh, cache: 'no-store' as RequestCache };
      const [simRes, manobrasRes, categoriasRes, tiposRes, modelosRes] = await Promise.all([
        fetch(`${API_BASE_URL}/simuladores?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/manobras?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/categorias?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/tipos-sessao?_=${Date.now()}`, noStore),
        fetch(`${API_BASE_URL}/simuladores/modelos-sessao?_=${Date.now()}`, noStore),
      ]);

      const [simData, manobrasData, categoriasData, tiposData, modelosData] = await Promise.all([
        simRes.json(),
        manobrasRes.json(),
        categoriasRes.json(),
        tiposRes.json(),
        modelosRes.json(),
      ]);

      setStats({
        simuladores: simData.success ? simData.data?.length || 0 : 0,
        manobras: manobrasData.success ? manobrasData.data?.length || 0 : 0,
        categorias: categoriasData.success ? categoriasData.data?.length || 0 : 0,
        tiposSessao: tiposData.success ? tiposData.data?.length || 0 : 0,
        modelosSessao: modelosData.success ? modelosData.data?.length || 0 : 0,
      });
      setDataReady(true);
    } catch (error) {
      console.error('Erro ao carregar dados de gestao:', error);
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
  ];

  const estruturaCards = gestaoCards.filter((c) => ['simuladores', 'tipos', 'modelos'].includes(c.id));
  const bibliotecaCards = gestaoCards.filter((c) => ['manobras', 'categorias'].includes(c.id));

  const renderCard = (card: typeof gestaoCards[number]) => {
    const Icon = card.icon;
    const colors = colorClasses[card.color];
    const count = countMap[card.id];
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
          <span className="text-lg font-semibold text-gray-900 tabular-nums">{count}</span>
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

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
            <div className="grid gap-2.5">
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
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
