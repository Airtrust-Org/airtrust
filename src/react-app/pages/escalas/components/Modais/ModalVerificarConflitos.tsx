// src/react-app/pages/escalas/components/Modais/ModalVerificarConflitos.tsx

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { useEscalaConflitosQuery } from '../../hooks/queries/useEscalasQuery';
import { EVENTO_CONFIG } from '../EscalaCalendario/GradeGantt';
import type { TipoEvento } from '../../hooks/queries/useEscalasQuery';
import { fmtDateRange, fmtDateShort } from '../../quinzena-tokens';

interface Props {
  escalaId: string;
  onClose: () => void;
}

export default function ModalVerificarConflitos({ escalaId, onClose }: Props) {
  const { data, loading } = useEscalaConflitosQuery(escalaId);
  const totalProblemas = data
    ? data.conflitos_eventos.length +
      (data.conflitos_tripulacoes?.length ?? 0) +
      data.restricoes_violadas.length +
      data.violacoes_compliance.length
    : 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Verificação de Conflitos"
      size="4xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-slate-500 text-sm">Analisando conflitos...</p>
          </div>
        </div>
      ) : !data ? (
        <p className="text-center text-slate-400 py-8">Sem dados disponíveis.</p>
      ) : (
        <div className="space-y-5">
          {/* Status geral */}
          <div
            className={[
              'flex items-center gap-3 p-4 rounded-md border',
              data.tem_conflitos ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200',
            ].join(' ')}
          >
            <div className="text-3xl">{data.tem_conflitos ? '⚠️' : '✅'}</div>
            <div>
              <div
                className={`font-semibold ${data.tem_conflitos ? 'text-red-800' : 'text-green-800'}`}
              >
                {data.tem_conflitos
                  ? `${totalProblemas} ${totalProblemas === 1 ? 'problema encontrado' : 'problemas encontrados'}`
                  : 'Nenhum conflito encontrado'}
              </div>
              <div className={`text-sm ${data.tem_conflitos ? 'text-red-600' : 'text-green-600'}`}>
                {data.tem_conflitos
                  ? 'Corrija os conflitos antes de publicar a escala'
                  : 'A escala está pronta para publicação'}
              </div>
            </div>
          </div>

          {/* Conflitos de datas */}
          {data.conflitos_eventos.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">
                ⏰ Conflitos de Evento ({data.conflitos_eventos.length})
              </h4>
              <div className="space-y-2">
                {data.conflitos_eventos.map((c, i) => {
                  const conf1 = EVENTO_CONFIG[c.tipo1 as TipoEvento];
                  const conf2 = EVENTO_CONFIG[c.tipo2 as TipoEvento];
                  return (
                    <div
                      key={`ce-${c.evento1_id ?? i}-${c.evento2_id ?? i}`}
                      className="bg-red-50 border border-red-200 rounded-md p-3"
                    >
                      <div className="font-medium text-red-800 text-sm mb-2">
                        👤 {c.funcionario_nome}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-red-600 flex-wrap">
                        <span className="px-2 py-1 bg-red-100 rounded-lg">
                          {conf1?.label || c.tipo1}
                          <span className="text-red-400 ml-1">
                            {fmtDateRange(c.inicio1, c.fim1)}
                          </span>
                        </span>
                        <span className="font-bold text-red-800">↔</span>
                        <span className="px-2 py-1 bg-red-100 rounded-lg">
                          {conf2?.label || c.tipo2}
                          <span className="text-red-400 ml-1">
                            {fmtDateRange(c.inicio2, c.fim2)}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conflitos de tripulações (mesmo piloto em 2 slots sobrepostos) */}
          {(data.conflitos_tripulacoes?.length ?? 0) > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">
                👥 Conflito de Tripulação ({data.conflitos_tripulacoes.length})
              </h4>
              <div className="space-y-2">
                {data.conflitos_tripulacoes.map((c, i) => (
                  <div
                    key={`ct-${c.funcionario_nome ?? i}-${c.aeronave1 ?? ''}-${c.aeronave2 ?? ''}`}
                    className="bg-red-50 border border-red-200 rounded-md p-3"
                  >
                    <div className="font-medium text-red-800 text-sm mb-2">
                      👤 {c.funcionario_nome} — escalado em duas tripulações simultâneas
                    </div>
                    <div className="flex items-center gap-2 text-xs text-red-600 flex-wrap">
                      <span className="px-2 py-1 bg-red-100 rounded-lg">
                        {c.papel1}
                        {c.aeronave1 ? ` · ${c.aeronave1}` : ''}
                        <span className="text-red-400 ml-1">{fmtDateRange(c.inicio1, c.fim1)}</span>
                      </span>
                      <span className="font-bold text-red-800">↔</span>
                      <span className="px-2 py-1 bg-red-100 rounded-lg">
                        {c.papel2}
                        {c.aeronave2 ? ` · ${c.aeronave2}` : ''}
                        <span className="text-red-400 ml-1">{fmtDateRange(c.inicio2, c.fim2)}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Restrições violadas */}
          {data.restricoes_violadas.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">
                🚫 Restrições Contratuais Violadas ({data.restricoes_violadas.length})
              </h4>
              <div className="space-y-2">
                {data.restricoes_violadas.map((r, i) => (
                  <div
                    key={`rv-${r.funcionario_a ?? i}-${r.funcionario_b ?? i}`}
                    className="bg-orange-50 border border-orange-200 rounded-md p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-orange-800 text-sm">
                        {r.funcionario_a} ↔ {r.funcionario_b}
                      </span>
                    </div>
                    {r.motivo && <div className="text-xs text-orange-600 mt-1">{r.motivo}</div>}
                    {r.contrato_referencia && (
                      <div className="text-[10px] text-orange-500 mt-0.5">
                        📋 Ref: {r.contrato_referencia}
                      </div>
                    )}
                    <div className="text-xs text-orange-600 mt-1">
                      {fmtDateRange(r.data_inicio, r.data_fim)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.violacoes_compliance.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">
                🛡️ Violações de Compliance ({data.violacoes_compliance.length})
              </h4>
              <div className="space-y-2">
                {data.violacoes_compliance.map((violacao, i) => (
                  <div
                    key={`vc-${violacao.tipo}-${violacao.pic_nome ?? i}-${violacao.sic_nome ?? i}`}
                    className="bg-amber-50 border border-amber-200 rounded-md p-3"
                  >
                    <div className="font-medium text-amber-900 text-sm">{violacao.mensagem}</div>
                    {(violacao.pic_nome || violacao.sic_nome) && (
                      <div className="mt-1 text-xs text-amber-700">
                        {violacao.pic_nome || 'PIC'}
                        {violacao.sic_nome ? ` ↔ ${violacao.sic_nome}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações */}
        </div>
      )}
    </Modal>
  );
}
