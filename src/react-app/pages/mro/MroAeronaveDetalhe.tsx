import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plane, Wrench, Clock, Package, FileText, ClipboardList } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroBreadcrumb from './components/MroBreadcrumb';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_AERONAVES, getComponentesByAeronaveId, getVencimentosByAeronaveId, getOsByAeronaveId, getRegistrosTecnicosByAeronaveId } from './data/mroMockData';
import { formatTipoControle, formatFH, formatCiclos } from './data/mroUtils';

type Tab = 'resumo' | 'config' | 'componentes' | 'vencimentos' | 'os' | 'registros' | 'documentos';
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'resumo', label: 'Resumo', icon: <Plane className="h-4 w-4" /> },
  { key: 'config', label: 'Config. Técnica', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'componentes', label: 'Componentes', icon: <Package className="h-4 w-4" /> },
  { key: 'vencimentos', label: 'Vencimentos', icon: <Clock className="h-4 w-4" /> },
  { key: 'os', label: 'Ordens de Serviço', icon: <Wrench className="h-4 w-4" /> },
  { key: 'registros', label: 'Reg. Técnicos', icon: <FileText className="h-4 w-4" /> },
  { key: 'documentos', label: 'Documentos', icon: <FileText className="h-4 w-4" /> },
];

const colorMap: Record<string, { bg: string; darkBg: string; text: string; darkText: string; labelText: string; darkLabelText: string }> = {
  amber: { bg: 'bg-amber-50', darkBg: 'dark:bg-amber-950/20', text: 'text-amber-700', darkText: 'dark:text-amber-300', labelText: 'text-amber-600', darkLabelText: 'dark:text-amber-400' },
  red: { bg: 'bg-red-50', darkBg: 'dark:bg-red-950/20', text: 'text-red-700', darkText: 'dark:text-red-300', labelText: 'text-red-600', darkLabelText: 'dark:text-red-400' },
  blue: { bg: 'bg-blue-50', darkBg: 'dark:bg-blue-950/20', text: 'text-blue-700', darkText: 'dark:text-blue-300', labelText: 'text-blue-600', darkLabelText: 'dark:text-blue-400' },
  purple: { bg: 'bg-purple-50', darkBg: 'dark:bg-purple-950/20', text: 'text-purple-700', darkText: 'dark:text-purple-300', labelText: 'text-purple-600', darkLabelText: 'dark:text-purple-400' },
};

export default function MroAeronaveDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('resumo');
  const aeronave = MOCK_AERONAVES.find((a) => a.id === id);

  if (!aeronave) {
    return <AppLayout><div className="w-full text-center py-12"><h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Aeronave não encontrada</h1><Link to="/mro/aeronaves" className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">← Voltar para lista</Link></div></AppLayout>;
  }

  const componentes = getComponentesByAeronaveId(aeronave.id);
  const vencimentos = getVencimentosByAeronaveId(aeronave.id);
  const ordensServico = getOsByAeronaveId(aeronave.id);
  const registros = getRegistrosTecnicosByAeronaveId(aeronave.id);

  const miniCards = [
    { v: ordensServico.filter((o) => o.status !== 'concluida' && o.status !== 'cancelada').length, l: 'OS ativas', c: 'amber' as const },
    { v: vencimentos.filter((v) => v.criticidade === 'critica' || v.criticidade === 'alta').length, l: 'Venc. Críticos', c: 'red' as const },
    { v: componentes.length, l: 'Componentes', c: 'blue' as const },
    { v: registros.filter((r) => r.status === 'pendente').length, l: 'Reg. Pendentes', c: 'purple' as const },
  ];

  return (
    <AppLayout>
      <div className="w-full">
      <MroPageShell>
        <MroBreadcrumb items={[{ label: 'Manutenção', to: '/mro' }, { label: 'Aeronaves', to: '/mro/aeronaves' }, { label: aeronave.matricula }]} />
        <div className="mb-6">
          <button type="button" onClick={() => navigate('/mro/aeronaves')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" />Voltar para aeronaves</button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3"><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{aeronave.matricula}</h1><MroStatusBadge status={aeronave.status} /></div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{aeronave.fabricante} — {aeronave.modelo} — SN: {aeronave.serialNumber}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.key ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200'}`}>{tab.icon}{tab.label}</button>
            ))}
          </nav>
        </div>

        {/* Resumo */}
        {activeTab === 'resumo' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Dados Gerais</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500 dark:text-slate-400">Matrícula</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.matricula}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Modelo</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.modelo}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Fabricante</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.fabricante}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Ano</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.anoFabricacao}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Serial Number</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.serialNumber}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Categoria</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.categoria}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Config. Assentos</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.configAssentos}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">MTOW</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.mtow}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Base</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.base}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Status</dt><dd><MroStatusBadge status={aeronave.status} /></dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Dados Operacionais</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500 dark:text-slate-400">Total Horas (TSN)</dt><dd className="font-mono font-medium text-slate-800 dark:text-slate-200">{formatFH(aeronave.totalHoras)} FH</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Total Ciclos (CSN)</dt><dd className="font-mono font-medium text-slate-800 dark:text-slate-200">{formatCiclos(aeronave.totalCiclos)}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Última Manutenção</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.ultimaManutencao}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Próxima Manutenção</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.proximaManutencao}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">Observações</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.observacoes || '—'}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Visão Geral da Manutenção</h3>
              <div className="grid grid-cols-2 gap-4">
                {miniCards.map((k) => (
                  <div key={k.l} className={`rounded-lg border border-slate-100 p-4 dark:border-slate-700 ${colorMap[k.c].bg} ${colorMap[k.c].darkBg}`}>
                    <p className={`text-2xl font-bold ${colorMap[k.c].text} ${colorMap[k.c].darkText}`}>{k.v}</p>
                    <p className={`text-xs ${colorMap[k.c].labelText} ${colorMap[k.c].darkLabelText}`}>{k.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Config Técnica */}
        {activeTab === 'config' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Configuração Técnica</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">Motor</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.motorModelo}</dd></div>
              <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">APU</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.apuModelo}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">MTOW</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.mtow}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">Assentos</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{aeronave.configAssentos}</dd></div>
            </dl>
          </div>
        )}

        {/* Componentes */}
        {activeTab === 'componentes' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">PN</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">SN</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ATA</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">TSO (FH)</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Criticidade</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {componentes.map((c) => <tr key={c.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{c.partNumber}</td><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{c.serialNumber}</td><td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.descricao}</td><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{c.ata}</td><td className="px-4 py-3"><MroStatusBadge status={c.status} /></td><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{formatFH(c.tso)}</td><td className="px-4 py-3"><MroStatusBadge status={c.criticidade} /></td></tr>)}
              </tbody>
            </table></div>
            {componentes.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum componente associado.</div>}
          </div>
        )}

        {/* Vencimentos */}
        {activeTab === 'vencimentos' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ATA</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tarefa</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo Controle</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Limite</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Saldo</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Próx. Venc.</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Criticidade</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {vencimentos.map((v) => {
                  const sc = v.saldo <= 10 ? 'text-red-600 dark:text-red-400 font-bold' : v.saldo <= 30 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-400';
                  return <tr key={v.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{v.ata}</td><td className="px-4 py-3 max-w-[250px] truncate text-slate-700 dark:text-slate-300">{v.tarefa}</td><td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatTipoControle(v.tipoControle)}</td><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{v.limite} {v.unidade}</td><td className={`px-4 py-3 font-mono text-xs ${sc}`}>{v.saldo} {v.unidade}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.proximoVencimento}</td><td className="px-4 py-3"><MroStatusBadge status={v.criticidade} /></td></tr>;
                })}
              </tbody>
            </table></div>
          </div>
        )}

        {/* OS */}
        {activeTab === 'os' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nº</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Título</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ATA</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Emissão</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prevista</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ordensServico.map((os) => <tr key={os.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3"><Link to={`/mro/os/${os.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{os.numero}</Link></td><td className="px-4 py-3 max-w-[200px] truncate text-slate-700 dark:text-slate-300">{os.titulo}</td><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{os.ata}</td><td className="px-4 py-3"><MroStatusBadge status={os.tipo} /></td><td className="px-4 py-3"><MroStatusBadge status={os.status} /></td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{os.dataEmissao}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{os.dataPrevista}</td></tr>)}
              </tbody>
            </table></div>
          </div>
        )}

        {/* Registros Técnicos */}
        {activeTab === 'registros' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">OS</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Serviço</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Liberador</th><th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {registros.map((r) => <tr key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.osNumero}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.data}</td><td className="px-4 py-3 max-w-[300px] truncate text-slate-700 dark:text-slate-300">{r.servico}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.liberador}</td><td className="px-4 py-3"><MroStatusBadge status={r.status} /></td></tr>)}
              </tbody>
            </table></div>
          </div>
        )}

        {/* Documentos */}
        {activeTab === 'documentos' && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <FileText className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">Seção de Documentos</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Upload e visualização de documentos técnicos (MPD, MM, SB, AD, peso e balanceamento) disponível na versão completa.</p>
          </div>
        )}
      </MroPageShell>
      </div>
    </AppLayout>
  );
}
