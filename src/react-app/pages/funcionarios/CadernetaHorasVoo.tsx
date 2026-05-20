import { useMemo, useState } from 'react';
import { ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { Plus, Download, Plane, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import Button from '@/react-app/components/Button';
import Card, { CardContent, CardHeader } from '@/react-app/components/Card';
import { colorTokens } from '@/react-app/styles/design-tokens';
import {
  useCreateLancamentoHorasVoo,
  useDeleteLancamentoHorasVoo,
  useHorasVooLancamentos,
  useHorasVooSaldo,
  useHorasVooTotais,
  useUpsertSaldoInicial,
  type HorasVooFilters,
} from '@/react-app/hooks/useHorasVoo';
import ModalSaldoInicial from './modals/ModalSaldoInicial';
import ModalLancamentoHorasVoo from './modals/ModalLancamentoHorasVoo';

interface Props {
  funcionarioId: number;
  funcionarioNome: string;
  canEdit: boolean;
}

interface LancamentoRow {
  id: number;
  data_voo: string;
  modelo_aeronave?: string | null;
  origem?: string | null;
  destino?: string | null;
  duracao_total_min: number;
  funcao: string;
  origem_registro: string;
}

function minutesToHoursDisplay(minutos: number): string {
  const total = Number(minutos || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function getBadgeStyle(origem: string) {
  if (origem === 'FIRA')
    return { background: colorTokens.primary[50], color: colorTokens.primary[600] };
  if (origem === 'FRMS') return { background: '#ecfdf3', color: colorTokens.success };
  if (origem === 'SIMULADOR') return { background: '#f3e8ff', color: '#7e22ce' };
  return { background: '#f3f4f6', color: colorTokens.neutral[600] };
}

export default function CadernetaHorasVoo({ funcionarioId, funcionarioNome, canEdit }: Props) {
  const [filters, setFilters] = useState<HorasVooFilters>({ page: 1, limit: 20 });
  const [openSaldo, setOpenSaldo] = useState(false);
  const [openLanc, setOpenLanc] = useState(false);

  const totaisQuery = useHorasVooTotais(funcionarioId);
  const saldoQuery = useHorasVooSaldo(funcionarioId);
  const lancamentosQuery = useHorasVooLancamentos(funcionarioId, filters);
  const upsertSaldo = useUpsertSaldoInicial(funcionarioId);
  const createLancamento = useCreateLancamentoHorasVoo(funcionarioId);
  const deleteLancamento = useDeleteLancamentoHorasVoo(funcionarioId);

  const totais = totaisQuery.data;
  const lancamentos = lancamentosQuery.data?.data || [];
  const meta = lancamentosQuery.data?.meta;

  const cards = useMemo(() => {
    if (!totais) return [];
    const g = totais.total_geral;
    return [
      {
        label: 'TOTAL',
        value: minutesToHoursDisplay(g.total_min),
        tip: 'Horas em aeronave real (saldo + sistema).',
      },
      { label: 'PIC', value: minutesToHoursDisplay(g.pic_min), tip: 'Comandante em exercicio.' },
      { label: 'SIC', value: minutesToHoursDisplay(g.sic_min), tip: 'Segundo em comando.' },
      {
        label: 'NOTURNA',
        value: minutesToHoursDisplay(g.noturna_min),
        tip: 'Tempo de voo noturno.',
      },
      {
        label: 'INSTRUMENTO',
        value: minutesToHoursDisplay(g.instrumento_min),
        tip: 'Tempo IFR/instrumentos.',
      },
      {
        label: 'SIMULADOR',
        value: minutesToHoursDisplay(g.simulador_min),
        tip: 'Horas em simulador (nao soma no total real).',
      },
      {
        label: 'INSTRUCAO',
        value: minutesToHoursDisplay(g.instrucao_min),
        tip: 'Horas em instrucao.',
      },
      {
        label: 'POUSOS',
        value: String(totais.total_pousos || 0),
        tip: 'Total de pousos registrados.',
      },
    ];
  }, [totais]);

  return (
    <div className="space-y-6">
      <Card className="border-blue-100">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <Plane className="w-5 h-5 text-blue-600" />
              Caderneta de Horas de Voo - {funcionarioNome}
            </h3>
            <div className="flex items-center gap-2">
              {canEdit ? (
                <Button variant="secondary" onClick={() => setOpenSaldo(true)}>
                  Saldo inicial
                </Button>
              ) : null}
              {canEdit ? (
                <Button variant="primary" onClick={() => setOpenLanc(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Novo
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => {
                  window.open(`/api/horas-voo/${funcionarioId}/exportar-xlsx`, '_blank');
                }}
              >
                <Download className="w-4 h-4 mr-1" /> Exportar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {totaisQuery.isLoading ? (
            <div className="text-sm text-gray-500">Carregando totais...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {cards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                    title={card.tip}
                  >
                    <div className="text-xs text-gray-500">{card.label}</div>
                    <div className="text-lg font-semibold text-gray-900">{card.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                {Object.entries(totais?.por_modelo || {}).map(([modelo, v]) => (
                  <div key={modelo} className="rounded-lg border border-gray-200 p-3 bg-white">
                    <div className="text-sm font-semibold text-gray-900">{modelo}</div>
                    <div className="text-sm text-gray-600">
                      {minutesToHoursDisplay((v as { total_min: number }).total_min)}
                    </div>
                    <div className="text-xs text-gray-500">
                      PIC {minutesToHoursDisplay((v as { pic_min: number }).pic_min)} | SIC{' '}
                      {minutesToHoursDisplay((v as { sic_min: number }).sic_min)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="h-64 rounded-lg border border-gray-200 p-3 mb-6 bg-white">
                <p className="text-sm font-medium text-gray-700 mb-2">Historico por ano</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={totais?.por_ano || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ano" />
                    <YAxis />
                    <Tooltip formatter={(v: number) => minutesToHoursDisplay(Number(v))} />
                    <Bar
                      dataKey="total_min"
                      fill={colorTokens.primary[500]}
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <Card className="border-gray-200">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <Clock3 className="w-4 h-4" /> Lancamentos
                </h4>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="border rounded px-2 py-1 text-sm"
                    value={String(filters.data_inicio || '')}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        page: 1,
                        data_inicio: e.target.value || undefined,
                      }))
                    }
                  />
                  <input
                    type="date"
                    className="border rounded px-2 py-1 text-sm"
                    value={String(filters.data_fim || '')}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        page: 1,
                        data_fim: e.target.value || undefined,
                      }))
                    }
                  />
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={String(filters.origem_registro || '')}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        page: 1,
                        origem_registro: e.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">Origem</option>
                    <option value="MANUAL">MANUAL</option>
                    <option value="FIRA">FIRA</option>
                    <option value="FRMS">FRMS</option>
                    <option value="SIMULADOR">SIMULADOR</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-600">
                      <th className="py-2">Data</th>
                      <th>Equipamento</th>
                      <th>Rota</th>
                      <th>Duração</th>
                      <th>Função</th>
                      <th>Origem</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentos.map((item: Record<string, unknown>) => {
                      const row = item as unknown as LancamentoRow;
                      const badge = getBadgeStyle(String(row.origem_registro || 'MANUAL'));
                      return (
                        <tr key={row.id} className="border-b hover:bg-gray-50">
                          <td className="py-2">{row.data_voo}</td>
                          <td>{row.modelo_aeronave || '-'}</td>
                          <td>
                            {row.origem || '-'} {'->'} {row.destino || '-'}
                          </td>
                          <td>{minutesToHoursDisplay(Number(row.duracao_total_min || 0))}</td>
                          <td>{row.funcao}</td>
                          <td>
                            <span className="px-2 py-1 rounded-full text-xs" style={badge}>
                              {row.origem_registro}
                            </span>
                          </td>
                          <td>
                            {canEdit && row.origem_registro === 'MANUAL' ? (
                              <button
                                className="text-red-600 hover:underline"
                                onClick={async () => {
                                  try {
                                    await deleteLancamento.mutateAsync(Number(row.id));
                                  } catch (error) {
                                    toast.error(
                                      error instanceof Error ? error.message : 'Erro ao excluir.',
                                    );
                                  }
                                }}
                              >
                                Excluir
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-3 text-sm">
                <span className="text-gray-600">Total: {meta?.total || 0}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={(filters.page || 1) <= 1}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, page: Math.max((prev.page || 1) - 1, 1) }))
                    }
                  >
                    Anterior
                  </Button>
                  <span>Página {filters.page || 1}</span>
                  <Button
                    variant="secondary"
                    disabled={(filters.page || 1) >= (meta?.total_pages || 1)}
                    onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <ModalSaldoInicial
        isOpen={openSaldo}
        onClose={() => setOpenSaldo(false)}
        initialData={saldoQuery.data}
        submitting={upsertSaldo.isPending}
        onSubmit={async (data) => {
          try {
            await upsertSaldo.mutateAsync(data);
            toast.success('Saldo inicial salvo com sucesso.');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Erro ao salvar saldo.');
          }
        }}
      />

      <ModalLancamentoHorasVoo
        isOpen={openLanc}
        onClose={() => setOpenLanc(false)}
        submitting={createLancamento.isPending}
        onSubmit={async (data) => {
          try {
            await createLancamento.mutateAsync(data);
            toast.success('Lançamento criado com sucesso.');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Erro ao criar lançamento.');
          }
        }}
      />
    </div>
  );
}
