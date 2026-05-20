import { useEffect, useMemo, useState } from 'react';
import { FileStack, Files, Plane } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';

type ExportMode = 'current-view' | 'equipment';

export interface ExportEquipmentOption {
  modelo: string;
}

interface Props {
  isOpen: boolean;
  visaoGrade: 'tripulante' | 'aeronave';
  equipamentos: ExportEquipmentOption[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: { mode: ExportMode; selectedModelos: string[] }) => Promise<void> | void;
}

export default function ModalExportarEscalaPdf({
  isOpen,
  visaoGrade,
  equipamentos,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<ExportMode>('current-view');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const defaultMode: ExportMode = visaoGrade === 'tripulante' ? 'current-view' : 'equipment';
    setMode(defaultMode);
    setBusca('');
    setSelecionados(equipamentos.map((item) => item.modelo));
  }, [equipamentos, isOpen, visaoGrade]);

  const equipamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return equipamentos;

    return equipamentos.filter((item) => item.modelo.toLowerCase().includes(termo));
  }, [busca, equipamentos]);

  const podeExportar = mode === 'current-view' || selecionados.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => undefined : onClose}
      title="Exportar PDF"
      subtitle="Use a visualização atual ou gere um arquivo separado para cada equipamento selecionado."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => void onConfirm({ mode, selectedModelos: selecionados })}
            disabled={!podeExportar || loading}
          >
            {loading
              ? 'Preparando...'
              : mode === 'current-view'
                ? 'Abrir PDF da visualização'
                : `Gerar ${selecionados.length} PDF${selecionados.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('current-view')}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              mode === 'current-view'
                ? 'border-sky-300 bg-sky-50 text-sky-950'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/80 p-2 shadow-sm">
                <FileStack className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Visualização atual</p>
                <p className="mt-1 text-xs text-slate-500">
                  Exporta exatamente a grade que está aberta na tela.
                </p>
              </div>
            </div>
          </button>

          {visaoGrade !== 'tripulante' && (
            <button
              type="button"
              onClick={() => setMode('equipment')}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                mode === 'equipment'
                  ? 'border-sky-300 bg-sky-50 text-sky-950'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white/80 p-2 shadow-sm">
                  <Files className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Um PDF por equipamento</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Cada equipamento selecionado abre um arquivo separado com cabeçalho próprio.
                  </p>
                </div>
              </div>
            </button>
          )}
        </div>

        {mode === 'equipment' && visaoGrade !== 'tripulante' && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Equipamentos</p>
                <p className="mt-1 text-xs text-slate-500">
                  Selecione quais equipamentos devem gerar PDFs independentes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelecionados(equipamentos.map((item) => item.modelo))}
                  disabled={loading || equipamentos.length === 0}
                >
                  Selecionar todos
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelecionados([])}
                  disabled={loading || selecionados.length === 0}
                >
                  Limpar
                </Button>
              </div>
            </div>

            <input
              type="text"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar equipamento por modelo ou prefixo"
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />

            <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {equipamentosFiltrados.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
                  Nenhum equipamento encontrado para o filtro atual.
                </div>
              )}

              {equipamentosFiltrados.map((item) => {
                const checked = selecionados.includes(item.modelo);

                return (
                  <label
                    key={item.modelo}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                      checked
                        ? 'border-sky-200 bg-white shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelecionados((current) =>
                          checked
                            ? current.filter((m) => m !== item.modelo)
                            : [...current, item.modelo],
                        );
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="rounded-xl bg-slate-100 p-2 text-slate-500">
                        <Plane className="h-4 w-4" />
                      </div>
                      <p className="truncate text-sm font-semibold text-slate-900">{item.modelo}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
