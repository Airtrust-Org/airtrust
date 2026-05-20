// src/react-app/pages/escalas/components/Modais/ModalDetalhesEvento.tsx

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { useEscalaMutations } from '../../hooks/queries/useEscalasQuery';
import { useTiposEventoResolvidos } from '../../hooks/useTiposEventoResolvidos';
import type { EscalaEvento } from '../../hooks/queries/useEscalasQuery';
import { TIPO_TO_CODIGO_MAP } from '../../constants/tiposEvento';
import {
  CheckCircle2,
  CalendarDays,
  Pencil,
  Trash2,
  ShieldCheck,
  User,
  MapPin,
  Plane,
  Clock3,
  CircleX,
  GitBranch,
} from 'lucide-react';
import { formatDate } from '@/react-app/utils/formatDate';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

import { useNavigate } from 'react-router-dom';

interface Props {
  eventoId: string;
  escalaId?: string;
  evento?: EscalaEvento;
  escalaStatus?: string;
  onClose: () => void;
  onRemover?: (eventoId: string) => void;
  onAtualizado?: () => void | Promise<void>;
  /** Chamado quando usuário quer iniciar nova revisão a partir de uma escala publicada */
  onIniciarRevisao?: () => void;
}

const STATUS_EVENTO: Record<
  string,
  { label: string; className: string; icon: 'ok' | 'pending' | 'cancel' }
> = {
  confirmado: {
    label: 'Confirmado',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    icon: 'ok',
  },
  pendente: {
    label: 'Pendente',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    icon: 'pending',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'bg-red-50 text-red-700 border border-red-200',
    icon: 'cancel',
  },
};

const TURNOS = [
  { value: 'dia_todo', label: 'Dia todo' },
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
];

const INP =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

export default function ModalDetalhesEvento({
  eventoId,
  escalaId,
  evento,
  escalaStatus,
  onClose,
  onRemover,
  onAtualizado,
  onIniciarRevisao,
}: Props) {
  const navigate = useNavigate();
  const { configMap, tiposAtivos } = useTiposEventoResolvidos();
  const [editMode, setEditMode] = useState(false);
  // Store tipo as uppercase DB code
  const [tipo, setTipo] = useState<string>('VOO');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [turno, setTurno] = useState('dia_todo');
  const [local, setLocal] = useState('');
  const [obs, setObs] = useState('');
  const [status, setStatus] = useState('confirmado');

  const { atualizarEvento, removerEvento, loading: saving } = useEscalaMutations();

  useEffect(() => {
    if (evento) {
      // Normalize stored tipo_evento to uppercase code
      const raw = evento.tipo_evento ?? '';
      const upper = raw.trim().toUpperCase();
      const code =
        TIPO_TO_CODIGO_MAP[raw.trim().toLowerCase() as keyof typeof TIPO_TO_CODIGO_MAP] ?? upper;
      setTipo(code || 'VOO');
      setDataInicio(evento.data_inicio);
      setDataFim(evento.data_fim);
      setTurno(evento.turno ?? 'dia_todo');
      setLocal(evento.local ?? '');
      setObs(evento.observacoes ?? '');
      setStatus(evento.status ?? 'confirmado');
    }
  }, [evento]);

  const podeEditar = escalaStatus !== 'publicada' && !!escalaId;
  const origemGerenciadaExternamente =
    evento?.origem === 'simuladores' || evento?.origem === 'funcionario_ferias'
      ? evento.origem
      : null;
  const podeEditarNoModal = podeEditar && !origemGerenciadaExternamente;

  // Entrar em modo de edição automaticamente quando possível e evento carregado
  useEffect(() => {
    if (evento && podeEditarNoModal) {
      setEditMode(true);
    }
  }, [evento, podeEditarNoModal]);
  const origemLabel =
    origemGerenciadaExternamente === 'simuladores'
      ? 'Simuladores'
      : origemGerenciadaExternamente === 'funcionario_ferias'
        ? 'Funcionários'
        : null;

  async function handleSave() {
    if (!escalaId || origemGerenciadaExternamente) return;
    try {
      await atualizarEvento(escalaId, eventoId, {
        tipo_evento: tipo,
        data_inicio: dataInicio,
        data_fim: dataFim,
        turno,
        local: local || undefined,
        observacoes: obs || undefined,
        status,
      });
      toast.success('Evento atualizado!');
      setEditMode(false);
      onClose();
      void onAtualizado?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar evento');
    }
  }

  async function handleRemover() {
    if (!escalaId || origemGerenciadaExternamente) return;
    try {
      await removerEvento(escalaId, eventoId);
      toast.success('Evento removido');
      onRemover?.(eventoId);
      await onAtualizado?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover evento');
    }
  }

  if (!evento) {
    return (
      <Modal isOpen onClose={onClose} title="Detalhes do Evento" size="sm">
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-slate-500 text-sm">Carregando evento...</p>
        </div>
      </Modal>
    );
  }

  const rawCode = (evento?.tipo_evento ?? '').trim().toUpperCase();
  const normalizedCode =
    TIPO_TO_CODIGO_MAP[
      (evento?.tipo_evento ?? '').trim().toLowerCase() as keyof typeof TIPO_TO_CODIGO_MAP
    ] ?? rawCode;
  const conf = configMap[normalizedCode] ?? configMap['VOO'];
  const confAtual = editMode ? (configMap[tipo] ?? conf) : conf;
  const statusConf = STATUS_EVENTO[evento.status] ?? STATUS_EVENTO.pendente;

  return (
    <Modal
      isOpen
      onClose={() => {
        setEditMode(false);
        onClose();
      }}
      title={editMode ? 'Editar Evento' : confAtual.label}
      size="sm"
      footer={
        editMode ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditMode(false);
                onClose();
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              isLoading={saving}
              style={{ backgroundColor: confAtual.cor }}
              onClick={handleSave}
            >
              Salvar alterações
            </Button>
          </>
        ) : (
          <>
            {podeEditarNoModal && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 className="w-4 h-4" />}
                onClick={handleRemover}
                isLoading={saving}
              >
                Remover
              </Button>
            )}
            {podeEditarNoModal && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Pencil className="w-4 h-4" />}
                onClick={() => setEditMode(true)}
              >
                Editar
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </>
        )
      }
    >
      {editMode ? (
        <div className="space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Tipo de Evento
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {tiposAtivos.map((t) => {
                const c = configMap[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={[
                      'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium text-left transition-all',
                      tipo === t
                        ? 'text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                    style={tipo === t ? { backgroundColor: c.cor, borderColor: c.cor } : {}}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tipo === t ? '#fff' : c.cor }}
                    />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Período */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                min={dataInicio}
                onChange={(e) => setDataFim(e.target.value)}
                className={INP}
              />
            </div>
          </div>
          {/* Turno + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Turno</label>
              <select value={turno} onChange={(e) => setTurno(e.target.value)} className={INP}>
                {TURNOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={INP}>
                {Object.entries(STATUS_EVENTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Local</label>
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="ex: Rio de Janeiro"
              className={INP}
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Observações</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              className={INP + ' resize-none'}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="flex items-center gap-3 -mx-6 -mt-4 px-6 py-4 mb-2"
            style={{ backgroundColor: conf.corBg }}
          >
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm font-medium"
              style={{
                backgroundColor: conf.cor + '20',
                color: conf.cor,
                border: `1px solid ${conf.cor}40`,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: conf.cor }} />
              {conf.label}
            </span>
            <div>
              <FuncionarioLink
                funcionarioId={evento.funcionario_id}
                nome={evento.funcionario_nome}
                className="font-semibold text-slate-900 hover:text-primary hover:underline"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${statusConf.className}`}
            >
              {statusConf.icon === 'ok' && <CheckCircle2 className="w-4 h-4" />}
              {statusConf.icon === 'pending' && <Clock3 className="w-4 h-4" />}
              {statusConf.icon === 'cancel' && <CircleX className="w-4 h-4" />}
              {statusConf.label}
            </span>
            {origemLabel && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                <ShieldCheck className="w-4 h-4" />
                Gerenciado por {origemLabel}
              </span>
            )}
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <CalendarDays className="w-4 h-4" />
              Período
            </div>
            <div className="font-semibold text-slate-900 text-sm">
              {evento.data_inicio === evento.data_fim
                ? formatDate(evento.data_inicio)
                : `${formatDate(evento.data_inicio)} → ${formatDate(evento.data_fim)}`}
            </div>
            {evento.turno && evento.turno !== 'dia_todo' && (
              <div className="text-xs text-slate-500 mt-0.5 capitalize">Turno: {evento.turno}</div>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2 items-center">
              <User className="w-4 h-4 text-slate-400" />
              <FuncionarioLink
                funcionarioId={evento.funcionario_id}
                nome={evento.funcionario_nome}
                className="text-slate-600 hover:text-primary hover:underline"
              />
              {/* INT-04: Deep link to qualificações */}
              <button
                onClick={() => {
                  if (!evento?.funcionario_id) return;
                  onClose();
                  navigate('/qualificacoes?funcionario=' + evento.funcionario_id);
                }}
                className="ml-auto text-blue-500 hover:text-blue-700 text-[10px] flex items-center gap-0.5"
                title="Ver qualificações deste tripulante"
              >
                <ShieldCheck className="w-3 h-3" />
                Qualif.
              </button>
            </div>
            {evento.local && (
              <div className="flex gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{evento.local}</span>
              </div>
            )}
            {evento.aeronave && (
              <div className="flex gap-2">
                <Plane className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{evento.aeronave}</span>
              </div>
            )}
            {evento.observacoes && (
              <div className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">
                {evento.observacoes}
              </div>
            )}
          </dl>
          {!podeEditar && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
              <GitBranch className="h-4 w-4 text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-indigo-800">Escala publicada</p>
                <p className="text-[11px] text-indigo-600 mt-0.5">
                  Para editar, inicie uma nova revisão. A versão atual fica preservada no histórico.
                </p>
              </div>
              {onIniciarRevisao && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onIniciarRevisao();
                  }}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  Iniciar Revisão
                </button>
              )}
            </div>
          )}
          {podeEditar && origemGerenciadaExternamente && (
            <p className="text-[11px] text-slate-400 italic text-center">
              Edição bloqueada em Escalas. Faça a alteração no módulo {origemLabel}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
