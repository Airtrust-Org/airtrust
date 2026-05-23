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
import { SimuladoresCard } from '../components/SimuladoresLayout';

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
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="h-11 w-11 rounded-2xl bg-slate-200" />
        <div className="h-4 w-4 rounded bg-slate-200" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-5 w-28 rounded bg-slate-200" />
        <div className="h-4 w-48 rounded bg-slate-100" />
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
        <div className="h-8 w-16 rounded bg-slate-200" />
        <div className="h-4 w-24 rounded bg-slate-100" />
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
  const countMap: Record<string, number> = {
    simuladores: countSim,
    manobras: countMan,
    categorias: countCat,
    tiposSessao: countTip,
    modelosSessao: countMod,
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
      descricao: 'Gerenciar equipamentos de simulação disponíveis',
      icon: Plane,
      color: 'blue',
      valor: stats.simuladores,
      label: 'cadastrados',
    },
    {
      id: 'manobras' as SubView,
      titulo: 'Manobras',
      descricao: 'Cadastro de manobras e exercícios',
      icon: Settings,
      color: 'green',
      valor: stats.manobras,
      label: 'cadastradas',
    },
    {
      id: 'categorias' as SubView,
      titulo: 'Categorias de Manobra',
      descricao: 'Classificação de manobras e exercícios',
      icon: ClipboardCheck,
      color: 'purple',
      valor: stats.categorias,
      label: 'cadastradas',
    },
    {
      id: 'tipos' as SubView,
      titulo: 'Tipos de Sessão',
      descricao: 'Categorias de treinamento e avaliação',
      icon: FileText,
      color: 'orange',
      valor: stats.tiposSessao,
      label: 'cadastrados',
    },
    {
      id: 'modelos' as SubView,
      titulo: 'Modelos de Sessão',
      descricao: 'Templates de sessões de treinamento',
      icon: BookOpen,
      color: 'indigo',
      valor: stats.modelosSessao,
      label: 'cadastrados',
    },
  ];

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    green: 'bg-green-50 border-green-200 text-green-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-600',
  };

  // Se está em uma sub-view, renderiza o componente correspondente
  if (subView !== 'menu') {
    return (
      <div className="animate-fade-in">
        {/* Botão Voltar */}
        <button
          onClick={() => {
            setSubView('menu');
            fetchData();
          }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:border-slate-600 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Gestão
        </button>

        {/* Componente da sub-view */}
        <div className="space-y-4">
          {subView === 'simuladores' && <SimuladoresPage embedded />}
          {subView === 'manobras' && <ManobrasPage embedded />}
          {subView === 'categorias' && <CategoriasPage embedded />}
          {subView === 'tipos' && <TiposSessaoPage embedded />}
          {subView === 'modelos' && <ModelosSessaoPage embedded />}
        </div>
      </div>
    );
  }

  // Menu principal de gestão
  return (
    <div className="space-y-4">
      <SimuladoresCard className="overflow-hidden border-slate-200">
        <div className="border-b border-slate-200 bg-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gestão</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight text-slate-900">
            Cadastros do módulo
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Gerencie a estrutura operacional e a biblioteca pedagógica dos simuladores.
          </p>
        </div>

        {loading && (
          <div className="grid gap-4 p-6 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
              <div className="grid gap-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
              <div className="grid gap-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </div>
          </div>
        )}

        {!loading && (
        <div className="grid gap-4 p-6 xl:grid-cols-2">
          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Estrutura operacional
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                Base de sessões e equipamentos
              </h3>
            </div>
            <div className="grid gap-4">
              {gestaoCards
                .filter((card) => ['simuladores', 'tipos', 'modelos'].includes(card.id))
                .map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setSubView(card.id)}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${colorClasses[card.color]}`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                      <div className="mt-4">
                        <h4 className="text-base font-semibold text-slate-900">{card.titulo}</h4>
                        <p className="mt-1 text-sm text-slate-500">{card.descricao}</p>
                      </div>
                      <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
                        <div>
                          <span className="text-2xl font-bold text-slate-900 tabular-nums">{countMap[card.id]}</span>
                          <span className="ml-2 text-xs font-medium text-slate-500">
                            {card.label}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-slate-700">Abrir cadastro</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Biblioteca de avaliação
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                Conteúdo pedagógico das sessões
              </h3>
            </div>
            <div className="grid gap-4">
              {gestaoCards
                .filter((card) => ['manobras', 'categorias'].includes(card.id))
                .map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setSubView(card.id)}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${colorClasses[card.color]}`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                      <div className="mt-4">
                        <h4 className="text-base font-semibold text-slate-900">{card.titulo}</h4>
                        <p className="mt-1 text-sm text-slate-500">{card.descricao}</p>
                      </div>
                      <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
                        <div>
                          <span className="text-2xl font-bold text-slate-900 tabular-nums">{countMap[card.id]}</span>
                          <span className="ml-2 text-xs font-medium text-slate-500">
                            {card.label}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-slate-700">Abrir cadastro</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </section>
        </div>
        )}
      </SimuladoresCard>
    </div>
  );
}
