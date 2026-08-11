import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useAeronavesConfig } from '@/react-app/hooks/useAeronavesConfig';
import { useFuncionariosAtivos } from '@/react-app/hooks/qualificacoes/useFuncionariosAtivos';
import { useQualificacaoTipos } from '@/react-app/hooks/useQualificacoesExt';
import { apiJson } from '@/react-app/lib/api-contract';
import { showToast } from '@/react-app/utils/toast';
import {
  QUALIFICATION_REPORT_STATUS_OPTIONS,
  exportQualificationHistoryExcel,
  exportQualificationHistoryPdf,
  fetchQualificationHistoryReport,
  type QualificationHistoryReportFilters,
  type QualificationReportStatus,
} from './qualificationHistoryReport';

type Setor = { id: number; nome: string; ativo?: number | boolean };

type ExportKind = 'pdf' | 'excel';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function QualificationHistoryReportPanel() {
  const { user, empresas, empresaAtualId } = useAuth();
  const { aeronaves } = useAeronavesConfig();
  const funcionariosQuery = useFuncionariosAtivos();
  const { tipos } = useQualificacaoTipos(true, 1000);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<QualificationReportStatus[]>([
    'VENCIDA',
    'VENCENDO_30',
    'VALIDA',
  ]);
  const [setorId, setSetorId] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [aeronaveId, setAeronaveId] = useState('');
  const [funcao, setFuncao] = useState('');
  const [vencimentoInicio, setVencimentoInicio] = useState('');
  const [vencimentoFim, setVencimentoFim] = useState('');
  const [conclusaoInicio, setConclusaoInicio] = useState('');
  const [conclusaoFim, setConclusaoFim] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingSetores(true);
    apiJson<{ success?: boolean; data?: Setor[] }>('/api/setores')
      .then((payload) => {
        if (!active) return;
        setSetores(
          Array.isArray(payload?.data) ? payload.data.filter((setor) => setor.ativo !== 0) : [],
        );
      })
      .catch(() => {
        if (active) setSetores([]);
      })
      .finally(() => {
        if (active) setLoadingSetores(false);
      });
    return () => {
      active = false;
    };
  }, [empresaAtualId]);

  const funcionarios = useMemo(() => {
    const data = funcionariosQuery.data;
    return Array.isArray(data) ? data : [];
  }, [funcionariosQuery.data]);

  const categorias = useMemo(
    () =>
      Array.from(
        new Set(tipos.map((tipo) => String(tipo.categoria || '').trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [tipos],
  );

  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId);

  const filters = useMemo<QualificationHistoryReportFilters>(
    () => ({
      search: search.trim() || undefined,
      statuses,
      setorIds: setorId ? [Number(setorId)] : undefined,
      funcionarioId: funcionarioId ? Number(funcionarioId) : undefined,
      tipoId: tipoId ? Number(tipoId) : undefined,
      aeronaveId: aeronaveId ? Number(aeronaveId) : undefined,
      categoria: categoria || undefined,
      funcao: funcao.trim() || undefined,
      vencimentoInicio: vencimentoInicio || undefined,
      vencimentoFim: vencimentoFim || undefined,
      conclusaoInicio: conclusaoInicio || undefined,
      conclusaoFim: conclusaoFim || undefined,
    }),
    [
      aeronaveId,
      categoria,
      conclusaoFim,
      conclusaoInicio,
      funcionarioId,
      funcao,
      search,
      setorId,
      statuses,
      tipoId,
      vencimentoFim,
      vencimentoInicio,
    ],
  );

  const filterLabels = useMemo(() => {
    const labels: string[] = [];
    if (statuses.length) {
      labels.push(
        `Status: ${QUALIFICATION_REPORT_STATUS_OPTIONS.filter((option) =>
          statuses.includes(option.value),
        )
          .map((option) => option.label)
          .join(', ')}`,
      );
    }
    if (setorId)
      labels.push(`Setor: ${setores.find((item) => String(item.id) === setorId)?.nome || setorId}`);
    if (funcionarioId) {
      const funcionario = funcionarios.find(
        (item: { id?: number }) => String(item.id) === funcionarioId,
      );
      labels.push(
        `Funcionário: ${(funcionario as { nome?: string } | undefined)?.nome || funcionarioId}`,
      );
    }
    if (categoria) labels.push(`Categoria: ${categoria}`);
    if (tipoId)
      labels.push(
        `Qualificação: ${tipos.find((item) => String(item.id) === tipoId)?.nome || tipoId}`,
      );
    if (aeronaveId) {
      const aeronave = aeronaves.find((item) => String(item.id) === aeronaveId);
      labels.push(
        `Aeronave: ${aeronave?.modelo || aeronave?.nome || aeronave?.codigo || aeronaveId}`,
      );
    }
    if (funcao.trim()) labels.push(`Função: ${funcao.trim()}`);
    if (search.trim()) labels.push(`Busca: ${search.trim()}`);
    if (vencimentoInicio || vencimentoFim) {
      labels.push(`Vencimento: ${vencimentoInicio || 'início'} a ${vencimentoFim || 'fim'}`);
    }
    if (conclusaoInicio || conclusaoFim) {
      labels.push(`Conclusão: ${conclusaoInicio || 'início'} a ${conclusaoFim || 'fim'}`);
    }
    return labels;
  }, [
    aeronaveId,
    aeronaves,
    categoria,
    conclusaoFim,
    conclusaoInicio,
    funcionarioId,
    funcionarios,
    funcao,
    search,
    setorId,
    setores,
    statuses,
    tipoId,
    tipos,
    vencimentoFim,
    vencimentoInicio,
  ]);

  const toggleStatus = (status: QualificationReportStatus) => {
    setLastCount(null);
    setStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    );
  };

  const exportReport = async (kind: ExportKind) => {
    if (statuses.length === 0) {
      showToast.error('Selecione pelo menos um status para o relatório.');
      return;
    }
    if (vencimentoInicio && vencimentoFim && vencimentoInicio > vencimentoFim) {
      showToast.error('O início do vencimento não pode ser posterior ao fim.');
      return;
    }
    if (conclusaoInicio && conclusaoFim && conclusaoInicio > conclusaoFim) {
      showToast.error('O início da conclusão não pode ser posterior ao fim.');
      return;
    }

    try {
      setExporting(kind);
      const rows = await fetchQualificationHistoryReport(filters);
      setLastCount(rows.length);
      if (rows.length === 0) {
        showToast.warning('Nenhum registro corresponde aos filtros selecionados.');
        return;
      }
      const context = {
        empresaNome: empresaAtual?.nome,
        usuarioNome: user?.nome,
        filterLabels,
        generatedAt: new Date(),
      };
      if (kind === 'pdf') await exportQualificationHistoryPdf(rows, context);
      else await exportQualificationHistoryExcel(rows, context);
      showToast.success(
        `${kind === 'pdf' ? 'PDF' : 'Excel'} gerado com ${rows.length} registro${rows.length === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Falha ao gerar relatório.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-900">Histórico de Qualificações</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Gere PDF ou Excel usando o mesmo histórico autorizado por empresa, setor e perfil.
          </p>
        </div>
        {lastCount !== null && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Última geração: {lastCount} registro{lastCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="space-y-5 p-6">
        <div>
          <span className={labelClass}>Status</span>
          <div className="flex flex-wrap gap-2">
            {QUALIFICATION_REPORT_STATUS_OPTIONS.map((option) => {
              const selected = statuses.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleStatus(option.value)}
                  aria-pressed={selected}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    selected
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            “Em vencimento” usa a classificação canônica VENCENDO_30 do Histórico do AirTrust.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label>
            <span className={labelClass}>Busca</span>
            <input
              className={inputClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, matrícula ou qualificação"
            />
          </label>
          <label>
            <span className={labelClass}>Setor</span>
            <select
              className={inputClass}
              value={setorId}
              onChange={(event) => setSetorId(event.target.value)}
              disabled={loadingSetores}
            >
              <option value="">Todos os setores autorizados</option>
              {setores.map((setor) => (
                <option key={setor.id} value={setor.id}>
                  {setor.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Funcionário</span>
            <select
              className={inputClass}
              value={funcionarioId}
              onChange={(event) => setFuncionarioId(event.target.value)}
            >
              <option value="">Todos os funcionários autorizados</option>
              {funcionarios.map((funcionario: { id: number; nome?: string }) => (
                <option key={funcionario.id} value={funcionario.id}>
                  {funcionario.nome || `#${funcionario.id}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Função</span>
            <input
              className={inputClass}
              value={funcao}
              onChange={(event) => setFuncao(event.target.value)}
              placeholder="Ex.: Comandante"
            />
          </label>
          <label>
            <span className={labelClass}>Categoria</span>
            <select
              className={inputClass}
              value={categoria}
              onChange={(event) => {
                setCategoria(event.target.value);
                setTipoId('');
              }}
            >
              <option value="">Todas as categorias</option>
              {categorias.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Qualificação / modelo</span>
            <select
              className={inputClass}
              value={tipoId}
              onChange={(event) => setTipoId(event.target.value)}
            >
              <option value="">Todas</option>
              {tipos
                .filter((tipo) => !categoria || tipo.categoria === categoria)
                .map((tipo) => (
                  <option key={String(tipo.id)} value={String(tipo.id)}>
                    {tipo.codigo ? `${tipo.codigo} — ` : ''}
                    {tipo.nome}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Aeronave</span>
            <select
              className={inputClass}
              value={aeronaveId}
              onChange={(event) => setAeronaveId(event.target.value)}
            >
              <option value="">Todas</option>
              {aeronaves.map((aeronave) => (
                <option key={aeronave.id} value={aeronave.id}>
                  {aeronave.modelo || aeronave.nome || aeronave.codigo || `#${aeronave.id}`}
                </option>
              ))}
            </select>
          </label>
          <div className="hidden xl:block" />
          <label>
            <span className={labelClass}>Vencimento — início</span>
            <input
              type="date"
              className={inputClass}
              value={vencimentoInicio}
              onChange={(event) => setVencimentoInicio(event.target.value)}
            />
          </label>
          <label>
            <span className={labelClass}>Vencimento — fim</span>
            <input
              type="date"
              className={inputClass}
              value={vencimentoFim}
              onChange={(event) => setVencimentoFim(event.target.value)}
            />
          </label>
          <label>
            <span className={labelClass}>Conclusão — início</span>
            <input
              type="date"
              className={inputClass}
              value={conclusaoInicio}
              onChange={(event) => setConclusaoInicio(event.target.value)}
            />
          </label>
          <label>
            <span className={labelClass}>Conclusão — fim</span>
            <input
              type="date"
              className={inputClass}
              value={conclusaoFim}
              onChange={(event) => setConclusaoFim(event.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => void exportReport('excel')}
            disabled={exporting !== null}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === 'excel' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Exportar Excel
          </button>
          <button
            type="button"
            onClick={() => void exportReport('pdf')}
            disabled={exporting !== null}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Gerar PDF
          </button>
        </div>
      </div>
    </section>
  );
}
