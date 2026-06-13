import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench, ClipboardList, AlertTriangle, CheckCircle, Package, User, FileText, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroBreadcrumb from './components/MroBreadcrumb';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_OS, MOCK_AERONAVES } from './data/mroMockData';

type Section = 'dados' | 'tarefas' | 'discrepancias' | 'corretiva' | 'materiais' | 'mao-obra' | 'anexos' | 'signoff' | 'registro';
const SECTIONS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: 'dados', label: 'Dados Gerais', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'tarefas', label: 'Tarefas', icon: <CheckCircle className="h-4 w-4" /> },
  { key: 'discrepancias', label: 'Discrepâncias', icon: <AlertTriangle className="h-4 w-4" /> },
  { key: 'corretiva', label: 'Ação Corretiva', icon: <Wrench className="h-4 w-4" /> },
  { key: 'materiais', label: 'Materiais', icon: <Package className="h-4 w-4" /> },
  { key: 'mao-obra', label: 'Mão de Obra', icon: <User className="h-4 w-4" /> },
  { key: 'anexos', label: 'Anexos', icon: <Paperclip className="h-4 w-4" /> },
  { key: 'signoff', label: 'Sign-off', icon: <CheckCircle className="h-4 w-4" /> },
  { key: 'registro', label: 'Registro Técnico', icon: <FileText className="h-4 w-4" /> },
];

export default function MroOrdemServicoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>('dados');

  const os = MOCK_OS.find((o) => o.id === id);
  if (!os) {
    return <AppLayout><div className="w-full text-center py-12"><h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">OS não encontrada</h1><Link to="/mro/os" className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">← Voltar para lista</Link></div></AppLayout>;
  }
  const aeronave = MOCK_AERONAVES.find((a) => a.id === os.aeronaveId);

  return (
    <AppLayout>
      <div className="w-full">
      <MroPageShell>
        <MroBreadcrumb items={[{ label: 'Manutenção', to: '/mro' }, { label: 'Ordens de Serviço', to: '/mro/os' }, { label: os.numero }]} />
        <div className="mb-6">
          <button type="button" onClick={() => navigate('/mro/os')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" />Voltar para OS</button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3"><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{os.numero}</h1><MroStatusBadge status={os.status} /><MroStatusBadge status={os.tipo} /></div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{os.titulo}</p>
              {aeronave && <Link to={`/mro/aeronaves/${aeronave.id}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">{aeronave.matricula} — {aeronave.modelo}</Link>}
            </div>
          </div>
        </div>

        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {SECTIONS.map((section) => (
              <button key={section.key} type="button" onClick={() => setActiveSection(section.key)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${activeSection === section.key ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200'}`}>{section.icon}{section.label}</button>
            ))}
          </nav>
        </div>

        {activeSection === 'dados' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Informações da OS</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500 dark:text-slate-400">Número</dt><dd className="font-mono font-medium text-slate-800 dark:text-slate-200">{os.numero}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">ATA</dt><dd className="font-mono font-medium text-slate-800 dark:text-slate-200">{os.ata}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">Título</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{os.titulo}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">Descrição</dt><dd className="text-slate-700 dark:text-slate-300">{os.descricao}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Tipo</dt><dd><MroStatusBadge status={os.tipo} /></dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Status</dt><dd><MroStatusBadge status={os.status} /></dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Prioridade</dt><dd><MroStatusBadge status={os.prioridade} /></dd></div>
                <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">Motivo</dt><dd className="text-slate-700 dark:text-slate-300">{os.motivo}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Data Emissão</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{os.dataEmissao}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Data Prevista</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{os.dataPrevista}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Data Conclusão</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{os.dataConclusao || '—'}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">Oficina</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{os.oficina}</dd></div>
                {os.referenciaTecnica && <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">Ref. Técnica</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{os.referenciaTecnica}</dd></div>}
                {os.assinatura && <div><dt className="text-slate-500 dark:text-slate-400">Assinatura</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{os.assinatura}</dd></div>}
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Aeronave</h3>
              {aeronave ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500 dark:text-slate-400">Matrícula</dt><dd><Link to={`/mro/aeronaves/${aeronave.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{aeronave.matricula}</Link></dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">Modelo</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.modelo}</dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">Base</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.base}</dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">Status</dt><dd><MroStatusBadge status={aeronave.status} /></dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">Horas Totais</dt><dd className="font-mono font-medium text-slate-800 dark:text-slate-200">{aeronave.totalHoras.toFixed(1)} FH</dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">Ciclos Totais</dt><dd className="font-mono font-medium text-slate-800 dark:text-slate-200">{aeronave.totalCiclos}</dd></div>
                </dl>
              ) : <p className="text-sm text-slate-500">Aeronave não encontrada.</p>}
            </div>
          </div>
        )}

        {activeSection === 'tarefas' && <SectionCard title="Tarefas da OS" footer="* Tarefas demonstrativas. A versão completa terá integração com cartões de tarefa do MPD."><TaskItem done title="Executar inspeção conforme referência técnica" detail={`Ref: ${os.referenciaTecnica || os.ata} — Status: ${os.status === 'concluida' ? 'Concluída' : 'Pendente'}`} /><TaskItem title="Preencher cartão de tarefa" /><TaskItem title="Realizar teste operacional após execução" /></SectionCard>}
        {activeSection === 'discrepancias' && <SectionCard title="Discrepâncias Registradas" footer="* Módulo de discrepâncias completo disponível na versão final."><div className="rounded-lg border border-amber-100 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" /><div><p className="text-sm font-medium text-amber-800 dark:text-amber-300">{os.motivo}</p><p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Reportado em {os.dataEmissao}. Referência: {os.ata}</p></div></div></div></SectionCard>}
        {activeSection === 'corretiva' && <SectionCard title="Ação Corretiva" footer="* Detalhamento completo da ação corretiva disponível na versão final."><div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20"><div className="flex items-start gap-3"><Wrench className="mt-0.5 h-4 w-4 text-blue-500" /><div><p className="text-sm font-medium text-blue-800 dark:text-blue-300">Descrição da ação: {os.descricao}</p><p className="mt-2 text-xs text-blue-600 dark:text-blue-400">Oficina responsável: {os.oficina}</p></div></div></div></SectionCard>}
        {activeSection === 'materiais' && <SectionCard title="Materiais Utilizados" footer="* Lista de materiais completa disponível na versão final com integração ao estoque."><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-slate-200 dark:border-slate-700"><tr><th className="px-3 py-2 text-left text-xs font-medium text-slate-500">PN</th><th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Descrição</th><th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Lote</th><th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Qtd</th><th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Unidade</th></tr></thead><tbody><tr><td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">GENERIC-FILTER-99</td><td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">Elemento Filtrante — Combustível</td><td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">L-2026-0120</td><td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">1</td><td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">un</td></tr></tbody></table></div></SectionCard>}
        {activeSection === 'mao-obra' && <SectionCard title="Mão de Obra" footer="* Registro completo de mão de obra disponível na versão final."><div className="space-y-3"><div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">CM</div><div><p className="text-sm font-medium text-slate-700 dark:text-slate-300">Carlos A. Menezes</p><p className="text-xs text-slate-500 dark:text-slate-400">CMA 123456 • Inspetor</p></div></div><span className="text-xs text-slate-500 dark:text-slate-400">3.5 h</span></div></div></SectionCard>}
        {activeSection === 'anexos' && <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900"><Paperclip className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">Anexos</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Upload de fotos, documentos e relatórios disponível na versão completa.</p><button type="button" disabled className="mt-4 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 opacity-50 cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"><Paperclip className="h-3 w-3" />Anexar arquivo</button></div>}
        {activeSection === 'signoff' && <SectionCard title="Sign-off"><div className="space-y-3"><SignoffRow label="Executante" done={os.status === 'concluida'} /><SignoffRow label="Inspetor" /><SignoffRow label="Supervisor" /></div><button type="button" disabled onClick={() => toast.info('Protótipo: sign-off não disponível nesta prévia.')} className="mt-4 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 opacity-50 cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"><CheckCircle className="h-3 w-3" />Assinar</button></SectionCard>}
        {activeSection === 'registro' && <SectionCard title="Registro Técnico (Logbook)" footer="* Integração com logbook eletrônico disponível na versão final.">{os.assinatura ? <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20"><p className="text-sm text-emerald-800 dark:text-emerald-300">Serviço executado conforme {os.referenciaTecnica || os.ata}. Liberado por {os.assinatura} em {os.dataConclusao}.</p></div> : <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20"><p className="text-sm text-amber-800 dark:text-amber-300">Registro técnico pendente. A OS ainda não foi concluída.</p></div>}</SectionCard>}
      </MroPageShell>
      </div>
    </AppLayout>
  );
}

function SectionCard({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"><h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>{children}{footer && <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{footer}</p>}</div>;
}
function TaskItem({ done, title, detail }: { done?: boolean; title: string; detail?: string }) {
  return <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"><CheckCircle className={`mt-0.5 h-4 w-4 ${done ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} /><div><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>{detail && <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>}</div></div>;
}
function SignoffRow({ label, done }: { label: string; done?: boolean }) {
  return <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"><CheckCircle className={`h-4 w-4 ${done ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} /><span className="text-sm text-slate-700 dark:text-slate-300">{label}</span><span className="ml-auto text-xs text-slate-400">{done ? '✓ Assinado' : 'Pendente'}</span></div>;
}
