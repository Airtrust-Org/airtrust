import { Clock3, Layers3 } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosDateControls from './components/ControleVoosDateControls';
import { useControleVoosDate } from './hooks/useControleVoosDate';
import { formatDate } from './data/controleVoosUtils';

export default function ControleVoosJornadas() {
  const { selectedDate, setSelectedDate, setToday } = useControleVoosDate();

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Jornadas — Preview"
            description="Jornadas reais serão alimentadas pelo Controle de Voos a partir do SIGVOOS importado e normalizado, não pelo FRMS."
          >
            <ControleVoosDateControls
              value={selectedDate}
              onChange={setSelectedDate}
              onToday={setToday}
            />
          </ControleVoosPageHeader>

          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            Tela em preview. Ainda não existe contrato canônico de Jornadas em Controle de Voos baseado em `cv_voos`, `cv_voo_tripulantes`, `cv_voo_etapas` e RDV com rastreabilidade de origem.
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-3 flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <Clock3 className="h-4 w-4 text-teal-500" />
                  <h2 className="text-base font-semibold">Data selecionada</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  O contrato futuro deverá responder para <span className="font-medium">{formatDate(selectedDate)}</span> com apresentação, término, função a bordo, aeronave, fonte e última sincronização do dado importado.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-3 flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <Layers3 className="h-4 w-4 text-blue-500" />
                  <h2 className="text-base font-semibold">Policy canônica</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Caminho alvo: SIGVOOS → Controle de Voos → FRMS. Enquanto o endpoint canônico de Jornadas não existir em Controle de Voos, esta página permanece em preview e não exibe dado operacional fictício.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contrato mínimo esperado para sair do preview</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                `voo_id`, `etapa_id`, `tripulante_id`, `funcao`, `data_operacional`, `hora_apresentacao`, `hora_termino`, `horas_voo`, `aeronave`, `origem`, `qualidade_dado`, `estado_conflito`, `last_sync_at`, `external_id_sigvoos`.
              </p>
            </div>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
