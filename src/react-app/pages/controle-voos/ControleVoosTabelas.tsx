import { MapPin, Tag, Layers, AlertTriangle, FolderTree, Ban, Building2, Calendar, Eye } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import {
  MOCK_AEROPORTOS,
  MOCK_TIPOS_VOO,
  MOCK_NATUREZAS_VOO,
  MOCK_CAUSAS_INDISPONIBILIDADE,
  MOCK_GRUPOS_INDISPONIBILIDADE,
  MOCK_TABELAS_AUXILIARES,
} from './data/controleVoosMockData';

const ICON_MAP: Record<string, React.ReactNode> = {
  MapPin: <MapPin className="h-5 w-5 text-blue-500" />,
  Tag: <Tag className="h-5 w-5 text-emerald-500" />,
  Layers: <Layers className="h-5 w-5 text-purple-500" />,
  AlertTriangle: <AlertTriangle className="h-5 w-5 text-red-500" />,
  FolderTree: <FolderTree className="h-5 w-5 text-amber-500" />,
  Ban: <Ban className="h-5 w-5 text-orange-500" />,
  Building2: <Building2 className="h-5 w-5 text-slate-500" />,
  Calendar: <Calendar className="h-5 w-5 text-teal-500" />,
};

export default function ControleVoosTabelas() {
  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="Tabelas Operacionais" description="Cadastros auxiliares: aeroportos, tipos, naturezas, causas, grupos e mais" />

          {/* Cards de tabelas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
            {MOCK_TABELAS_AUXILIARES.map((tab) => (
              <div key={tab.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    {ICON_MAP[tab.icone] || <Eye className="h-5 w-5 text-slate-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{tab.nome}</h3>
                      {tab.fase === 'Fase 2' && (
                        <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">FASE 2</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{tab.descricao}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 dark:text-slate-500">{tab.registros} registros</span>
                      <button
                        disabled
                        className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 cursor-not-allowed dark:text-slate-500"
                        title="Protótipo — visualização ampliada indisponível nesta prévia"
                      >
                        <Eye className="h-3 w-3" /> Ver
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Amostra: Aeroportos */}
          <section className="mb-8">
            <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-500" /> Aeroportos / Plataformas</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ICAO</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">IATA</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Cidade</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">UF</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {MOCK_AEROPORTOS.map((apt) => (
                    <tr key={apt.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">{apt.codigoIcao}</td>
                      <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">{apt.codigoIata || '—'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{apt.nome}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{apt.cidade}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{apt.uf}</td>
                      <td className="px-4 py-3 text-xs">{apt.tipo === 'aeroporto' ? (<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">Aeroporto</span>) : apt.tipo === 'plataforma' ? (<span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Plataforma</span>) : (<span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Heliponto</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Amostra: Tipos de Voo + Naturezas */}
          <div className="grid gap-6 sm:grid-cols-2 mb-8">
            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Tag className="h-4 w-4 text-emerald-500" /> Tipos de Voo</h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <tr><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {MOCK_TIPOS_VOO.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{t.nome}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{t.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Layers className="h-4 w-4 text-purple-500" /> Naturezas de Voo</h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <tr><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {MOCK_NATUREZAS_VOO.map((n) => (
                      <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{n.nome}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{n.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Amostra: Causas + Grupos */}
          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Causas de Indisponibilidade</h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <tr><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Causa</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Grupo</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {MOCK_CAUSAS_INDISPONIBILIDADE.map((c) => {
                      const grupo = MOCK_GRUPOS_INDISPONIBILIDADE.find((g) => g.id === c.grupoId);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{c.nome}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{grupo?.nome || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><FolderTree className="h-4 w-4 text-amber-500" /> Grupos de Indisponibilidade</h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <tr><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {MOCK_GRUPOS_INDISPONIBILIDADE.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{g.nome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{MOCK_TABELAS_AUXILIARES.length} tabelas auxiliares — dados demonstrativos — CRUD completo na versão final</p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
