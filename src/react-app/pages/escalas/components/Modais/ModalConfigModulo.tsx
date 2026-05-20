// src/react-app/pages/escalas/components/Modais/ModalConfigModulo.tsx
// Configurações do módulo de escalas: visibilidade e cor dos tipos de evento

import { useState } from 'react';
import { Info, SlidersHorizontal } from 'lucide-react';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import {
  normalizeTipoEventoCodigo,
  useTiposEventoResolvidos,
} from '../../hooks/useTiposEventoResolvidos';
import { useTiposEventoConfigMutations } from '../../hooks/queries/useEscalasQuery';
import type { TipoEventoConfig } from '../../hooks/queries/escalas-types';
import CompactColorPicker from '../CompactColorPicker';

interface Props {
  onClose: () => void;
}

export default function ModalConfigModulo({ onClose }: Props) {
  const { tiposEventoVisiveis, toggleTipoEvento, mostrarTodosOsTipos } = useEscalaStore();
  const { data: rows = [], tiposAtivos, refetch } = useTiposEventoResolvidos();
  const { atualizar } = useTiposEventoConfigMutations();
  const [pickerAberto, setPickerAberto] = useState<string | null>(null);
  const [draftCor, setDraftCor] = useState<Record<string, string>>({});

  const visiveisCount = tiposEventoVisiveis.length;
  const totalCount = tiposAtivos.length;

  const salvarCampo = async (row: TipoEventoConfig, patch: Partial<{ label: string; cor: string }>) => {
    await atualizar(row.id, {
      label: patch.label ?? row.label,
      cor: patch.cor ?? row.cor,
    });
    await refetch();
  };

  const abrirPicker = (codigo: string, corAtual: string) => {
    setPickerAberto((atual) => (atual === codigo ? null : codigo));
    setDraftCor((anterior) => ({
      ...anterior,
      [codigo]: anterior[codigo] ?? corAtual,
    }));
  };

  const cancelarPicker = (codigo: string) => {
    setPickerAberto((atual) => (atual === codigo ? null : atual));
    setDraftCor((anterior) => {
      const next = { ...anterior };
      delete next[codigo];
      return next;
    });
  };

  const aplicarCor = async (row: TipoEventoConfig, cor: string) => {
    await salvarCampo(row, { cor });
    setPickerAberto((atual) => (atual === row.codigo ? null : atual));
    setDraftCor((anterior) => {
      const next = { ...anterior };
      delete next[row.codigo];
      return next;
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Configurações do Módulo de Escalas"
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => mostrarTodosOsTipos(tiposAtivos)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Mostrar todos
          </button>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Header info */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <SlidersHorizontal className="w-6 h-6 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-700">Tipos de Evento</p>
            <p className="text-xs text-slate-400">
              {visiveisCount} de {totalCount} visíveis na grade
            </p>
          </div>
          <button
            type="button"
            onClick={() => mostrarTodosOsTipos(tiposAtivos)}
            className="ml-auto text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-white transition-colors"
          >
            Mostrar todos
          </button>
        </div>

        {/* Lista de tipos */}
        <div className="space-y-1.5">
          {rows.map((row) => {
            const codigo = normalizeTipoEventoCodigo(row.codigo);
            const corAtual = row.cor;
            const corDraftAtual = draftCor[codigo] ?? corAtual;
            const visivel = tiposEventoVisiveis.includes(codigo);
            const pickerVisivel = pickerAberto === codigo;

            return (
              <div
                key={row.id}
                className={[
                  'rounded-xl border px-3 py-2.5 transition-all',
                  visivel
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50/60 border-slate-100 opacity-60',
                ].join(' ')}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => abrirPicker(codigo, corAtual)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-tight shadow-sm transition-transform hover:scale-105"
                    style={{
                      backgroundColor: corDraftAtual,
                      color: '#FFFFFF',
                    }}
                    title="Abrir palheta compacta"
                  >
                    {row.sigla}
                  </button>

                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      defaultValue={row.label}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val && val !== row.label) void salvarCampo(row, { label: val });
                      }}
                      className="w-full border-b border-transparent bg-transparent py-0.5 text-sm font-medium leading-tight text-slate-800 focus:border-slate-300 focus:outline-none"
                      title="Clique para editar o nome"
                    />
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {codigo} · sigla {row.sigla} · ordem {row.ordem}
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleTipoEvento(codigo)}
                      title={visivel ? 'Ocultar na grade' : 'Mostrar na grade'}
                      className={[
                        'relative h-5 w-10 flex-shrink-0 rounded-full transition-colors',
                        visivel ? 'bg-emerald-500' : 'bg-slate-200',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all',
                          visivel ? 'left-5' : 'left-0.5',
                        ].join(' ')}
                      />
                    </button>
                  </div>
                </div>

                {pickerVisivel && (
                  <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <CompactColorPicker
                      value={corDraftAtual}
                      onChange={(cor) =>
                        setDraftCor((anterior) => ({
                          ...anterior,
                          [codigo]: cor,
                        }))
                      }
                    />

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-400">
                        Arraste na palheta e aplique quando chegar no tom certo.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => cancelarPicker(codigo)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-white"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void aplicarCor(row, corDraftAtual)}
                          disabled={corDraftAtual === corAtual}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Aplicar cor
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Nota */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-600 leading-relaxed">
            As configurações de <strong>visibilidade</strong> ocultam eventos na grade (mas não os
            excluem). Os <strong>nomes e cores</strong> seguem a configuração persistida no banco.
          </p>
        </div>
      </div>
    </Modal>
  );
}

