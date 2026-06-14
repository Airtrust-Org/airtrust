import { FileText, Plane, Clock, Users, AlertTriangle, BarChart3, Download, TrendingUp } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import { MOCK_RELATORIOS } from './data/controleVoosMockData';

const ICON_MAP: Record<string, React.ReactNode> = {
  Plane: <Plane className="h-6 w-6 text-blue-500" />,
  Clock: <Clock className="h-6 w-6 text-teal-500" />,
  Users: <Users className="h-6 w-6 text-purple-500" />,
  FileText: <FileText className="h-6 w-6 text-amber-500" />,
  AlertTriangle: <AlertTriangle className="h-6 w-6 text-red-500" />,
  BarChart3: <BarChart3 className="h-6 w-6 text-indigo-500" />,
  Download: <Download className="h-6 w-6 text-slate-500" />,
  TrendingUp: <TrendingUp className="h-6 w-6 text-emerald-500" />,
};

export default function ControleVoosRelatorios() {
  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="Relatórios Operacionais" description="Relatórios de voos, horas, jornadas, indisponibilidade e exportações" />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MOCK_RELATORIOS.map((rel) => (
              <div key={rel.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    {ICON_MAP[rel.icone] || <FileText className="h-6 w-6 text-slate-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{rel.titulo}</h3>
                      {rel.fase === 'Fase 2' && (
                        <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">FASE 2</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{rel.descricao}</p>
                    <button
                      disabled
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {rel.fase === 'Fase 2' ? 'Disponível na Fase 2' : 'Gerar relatório (protótipo)'}
                    </button>
                    <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">Funcionalidade em desenvolvimento</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{MOCK_RELATORIOS.length} relatórios disponíveis na versão completa — dados demonstrativos</p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
