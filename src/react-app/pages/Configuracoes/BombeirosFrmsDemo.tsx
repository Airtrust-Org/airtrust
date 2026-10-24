import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import {
  BOMBEIROS_DEMO_COMPANY, BOMBEIROS_FRMS_SCENARIOS,
  bombeirosDemoCrewCanBeReleased, bombeirosDemoSummary,
} from './bombeirosFrmsDemoData';

/** Preview independent from any operational snapshot or backend write. */
export function BombeirosFrmsDemo({ onClose }: { onClose: () => void }) {
  const [selectedMission, setSelectedMission] = useState('TODAS');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const missions = useMemo(() => [...new Set(BOMBEIROS_FRMS_SCENARIOS.map(s => s.missao))], []);
  const visible = BOMBEIROS_FRMS_SCENARIOS.filter(s => selectedMission === 'TODAS' || s.missao === selectedMission);
  const selected = BOMBEIROS_FRMS_SCENARIOS.find(s => s.id === selectedId);
  const summary = bombeirosDemoSummary(visible);
  const sampleRelease = bombeirosDemoCrewCanBeReleased(visible);
  return (
    <section aria-label="Simulação FRMS Bombeiros" className="space-y-4 rounded-2xl border-2 border-indigo-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Ambiente de demonstração · Dados 100% fictícios</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">FRMS — Aviação dos Bombeiros</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-700">
            Prévia de telas, casos e decisões. Empresa prevista: {BOMBEIROS_DEMO_COMPANY.nome} ({BOMBEIROS_DEMO_COMPANY.codigo}),
            capacidade de {BOMBEIROS_DEMO_COMPANY.maxFuncionarios} pessoas. Nenhum tripulante, check-in ou voo real foi cadastrado.
          </p>
        </div>
        <button type="button" aria-label="Fechar demonstração Bombeiros" onClick={onClose} className="rounded-lg border border-slate-300 p-2">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>Simulação sem persistência.</strong> Dados, índices e riscos são exemplos para avaliar clareza da interface;
        não representam cálculo científico validado, aptidão aeronáutica nem liberação operacional.
        A Costa do Sol e o banco D1 não são consultados nem modificados por esta prévia.
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
        Tipo de missão
        <select aria-label="Filtrar missão fictícia" value={selectedMission} onChange={e => { setSelectedMission(e.target.value); setSelectedId(null); }} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="TODAS">Todas as missões</option>
          {missions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-100 p-3"><p className="text-xs text-slate-600">Pessoas no exemplo</p><p className="text-2xl font-bold">{summary.total}</p></div>
        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-900">Check-in recebido</p><p className="text-2xl font-bold">{summary.recebidos}</p></div>
        <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-900">Check-in pendente/ausente</p><p className="text-2xl font-bold">{summary.semCheckin}</p></div>
        <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-red-900">Acúmulo crítico</p><p className="text-2xl font-bold">{summary.criticos}</p></div>
      </div>
      <div aria-label="Condição simulada da missão" className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-semibold">
        {sampleRelease ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <ShieldAlert className="h-5 w-5 text-red-700" />}
        {sampleRelease ? 'Exemplo sem impedimento FRMS identificado — não é liberação real.' :
          'Exemplo com impedimentos FRMS — nenhuma liberação operacional simulada.'}
      </div>
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
        {visible.map(s => <button key={s.id} type="button" onClick={() => setSelectedId(s.id)} className="grid w-full gap-2 p-3 text-left hover:bg-slate-50 md:grid-cols-[minmax(120px,1fr)_minmax(130px,1fr)_95px_minmax(170px,1.6fr)]">
          <div><p className="font-semibold text-slate-900">{s.nome}</p><p className="text-xs text-slate-500">{s.funcao} · {s.base}</p></div>
          <div><p className="text-xs text-slate-500">{s.missao}</p><p className="text-sm">Apresentação {s.apresentacao}</p></div>
          <span className={`self-start rounded-md px-2 py-1 text-center text-xs font-bold ${s.checkin === 'RECEBIDO' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>{s.checkin === 'RECEBIDO' ? 'Recebido' : 'Pendente'}</span>
          <div><p className="text-sm text-slate-800">{s.motivo}</p><p className="mt-1 text-xs font-semibold text-indigo-800">{s.providencia}</p></div>
        </button>)}
      </div>
      {selected && <div role="dialog" aria-label="Detalhe de caso fictício" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-slate-900">
        <div className="flex items-start justify-between gap-2"><h3 className="font-bold">{selected.nome} — detalhe fictício</h3><button type="button" onClick={() => setSelectedId(null)} aria-label="Fechar detalhe"><X className="h-4 w-4" /></button></div>
        <p className="mt-2">Sono informado: {selected.sonoHoras == null ? 'Não informado' : `${selected.sonoHoras} h`} · KSS: {selected.kss ?? 'Não avaliado'} · Acúmulo: {selected.accumulated}</p>
        <p className="mt-2"><strong>Por quê?</strong> {selected.motivo}</p>
        <p className="mt-2"><strong>O que fazer?</strong> {selected.providencia}</p>
        <p className="mt-2"><strong>Responsável proposto:</strong> {selected.responsavel}</p>
        <p className="mt-2 flex items-center gap-2 text-amber-800"><AlertTriangle className="h-4 w-4" /> O botão real de despacho não está presente nesta simulação.</p>
      </div>}
      <p className="text-xs text-slate-500">Exemplos didáticos: recebimento, ausência, sonolência, fadiga acumulada, mitigação, tipo de missão e responsável pela decisão. Não substitui relatório auditável ou prova de conceito real.</p>
    </section>
  );
}
