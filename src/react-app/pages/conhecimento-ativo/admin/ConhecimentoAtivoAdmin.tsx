import { useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Layers3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import {
  baixarModeloConhecimentoAtivo,
  useAplicarImportacaoConhecimento,
  useAprovarItemConhecimento,
  useAprovarQuestaoConhecimento,
  useConhecimentoFontesAdmin,
  useConhecimentoItensAdmin,
  useConhecimentoQuestoesAdmin,
  useConhecimentoTopicosAdmin,
  useHistoricoImportacaoConhecimento,
  useSuperarFonteConhecimento,
  useTornarFonteConhecimentoVigente,
  useValidarImportacaoConhecimento,
} from '@/react-app/hooks/useConhecimentoAtivoAdmin';

type Tab = 'importacao' | 'fontes' | 'topicos' | 'itens' | 'questoes';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'importacao', label: 'Importar planilha' },
  { id: 'fontes', label: 'Fontes técnicas' },
  { id: 'topicos', label: 'Mapa de assuntos' },
  { id: 'itens', label: 'Itens' },
  { id: 'questoes', label: 'Questões' },
];

export default function ConhecimentoAtivoAdmin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('importacao');

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  <ShieldCheck className="h-4 w-4" />
                  Gestão técnica
                </div>
                <h1 className="mt-3 text-2xl font-bold text-slate-900">Conhecimento Ativo</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                  Banco técnico separado do LMS. O conteúdo importado entra em revisão e só pode chegar ao piloto
                  depois da validação da fonte, do item de conhecimento e da questão.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                <strong>Fail-closed:</strong> importar não publica nem gera certificado, qualificação ou conclusão de curso.
              </div>
            </div>
          </header>

          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setTab(item.id)}
                className={[
                  'min-h-10 shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold transition',
                  tab === item.id
                    ? 'border-sky-300 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-5">
            {tab === 'importacao' && <ImportacaoTab />}
            {tab === 'fontes' && <FontesTab />}
            {tab === 'topicos' && <TopicosTab />}
            {tab === 'itens' && <ItensTab />}
            {tab === 'questoes' && <QuestoesTab />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ImportacaoTab() {
  const [file, setFile] = useState<File | null>(null);
  const validar = useValidarImportacaoConhecimento();
  const aplicar = useAplicarImportacaoConhecimento();
  const historico = useHistoricoImportacaoConhecimento();

  const escolher = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    validar.reset();
    aplicar.reset();
  };

  const validarArquivo = async () => {
    if (!file) return;
    try {
      await validar.mutateAsync(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível validar a planilha.');
    }
  };

  const importarArquivo = async () => {
    if (!file || !validar.data?.canImport) return;
    try {
      const result = await aplicar.mutateAsync(file);
      toast.success(`Importação concluída: ${result.totalRows} linhas processadas.`);
      await historico.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível importar a planilha.');
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Planilha padrão AirTrust</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Uma linha representa uma variante de questão. Fonte, tópico e item podem se repetir entre linhas.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            try {
              await baixarModeloConhecimentoAtivo();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Erro ao baixar o modelo.');
            }
          }}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 hover:bg-sky-100"
        >
          <Download className="h-4 w-4" />
          Baixar modelo .xlsx
        </button>

        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Arquivo preenchido</span>
            <input type="file" accept=".xlsx" onChange={escolher} className="mt-3 block w-full text-sm text-slate-600" />
          </label>
          {file && <p className="mt-2 text-xs text-slate-500">{file.name}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!file || validar.isPending}
              onClick={validarArquivo}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {validar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Validar sem gravar
            </button>
            <button
              type="button"
              disabled={!file || !validar.data?.canImport || aplicar.isPending}
              onClick={importarArquivo}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {aplicar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar para revisão
            </button>
          </div>
        </div>

        {validar.data && (
          <div className="mt-5">
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Linhas" value={validar.data.totalRows} />
              <Metric label="Válidas" value={validar.data.validRows} />
              <Metric label="Erros" value={validar.data.errors.length} />
            </div>
            {validar.data.errors.length > 0 ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                  <AlertTriangle className="h-4 w-4" />
                  Corrija a planilha antes de importar
                </div>
                <div className="mt-3 max-h-60 space-y-2 overflow-auto">
                  {validar.data.errors.map((issue, index) => (
                    <p key={index} className="text-xs leading-relaxed text-rose-800">
                      Linha {issue.linha}{issue.campo ? ` · ${issue.campo}` : ''}: {issue.erro}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                Planilha válida. A importação criará o conteúdo em estado de revisão.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Fluxo de publicação</h2>
        <div className="mt-4 space-y-3">
          {[
            ['1', 'Baixar e preencher', 'Use somente o modelo vigente do AirTrust.'],
            ['2', 'Validar', 'O sistema checa colunas, tipos, chaves duplicadas e conflitos com o banco.'],
            ['3', 'Importar', 'Fontes entram como RASCUNHO; itens e questões entram EM REVISAO.'],
            ['4', 'Homologar', 'Gestão técnica torna a fonte vigente e aprova item e questão.'],
            ['5', 'Liberar tenant', 'O piloto só vê o módulo quando o tenant estiver explicitamente habilitado.'],
          ].map(([step, title, description]) => (
            <div key={step} className="flex gap-3 rounded-xl border border-slate-200 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                {step}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <h3 className="mt-6 text-sm font-semibold text-slate-900">Últimas importações</h3>
        <div className="mt-3 space-y-2">
          {historico.data?.slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-700">{item.arquivo_nome}</p>
                <Status value={item.status} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {item.total_linhas} linha(s) · {item.total_inseridos} inserções · {item.total_ignorados} existentes
              </p>
            </div>
          ))}
          {!historico.isLoading && !historico.data?.length && <Empty text="Nenhuma importação realizada." />}
        </div>
      </section>
    </div>
  );
}

function FontesTab() {
  const fontes = useConhecimentoFontesAdmin();
  const vigente = useTornarFonteConhecimentoVigente();
  const superar = useSuperarFonteConhecimento();

  return (
    <ListShell title="Fontes técnicas" icon={<BookOpenCheck className="h-5 w-5" />}>
      {fontes.data?.map((fonte) => (
        <div key={fonte.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{fonte.tipo_documento}</span>
              <Status value={fonte.status} />
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900">{fonte.titulo}</p>
            <p className="mt-1 text-xs text-slate-500">{fonte.aeronave_modelo || 'Geral'} · Rev. {fonte.revisao}</p>
          </div>
          <div className="flex gap-2">
            {fonte.status !== 'VIGENTE' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await vigente.mutateAsync(fonte.id);
                    toast.success('Fonte marcada como vigente.');
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Erro ao validar fonte.');
                  }
                }}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Tornar vigente
              </button>
            )}
            {fonte.status === 'VIGENTE' && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Marcar esta revisão como superada? Itens vinculados voltarão para revisão.')) return;
                  try {
                    await superar.mutateAsync(fonte.id);
                    toast.success('Fonte superada; conteúdo vinculado retornou para revisão.');
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Erro ao atualizar fonte.');
                  }
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
              >
                Marcar superada
              </button>
            )}
          </div>
        </div>
      ))}
      {!fontes.isLoading && !fontes.data?.length && <Empty text="Nenhuma fonte cadastrada." />}
    </ListShell>
  );
}

function TopicosTab() {
  const topicos = useConhecimentoTopicosAdmin();
  return (
    <ListShell title="Mapa de assuntos" icon={<Layers3 className="h-5 w-5" />}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {topicos.data?.map((topico) => (
          <div key={topico.id} className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">{topico.codigo}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{topico.nome}</p>
            <p className="mt-1 text-xs text-slate-500">{topico.aeronave_modelo || 'Conhecimento geral'}</p>
          </div>
        ))}
      </div>
      {!topicos.isLoading && !topicos.data?.length && <Empty text="Nenhum tópico cadastrado." />}
    </ListShell>
  );
}

function ItensTab() {
  const itens = useConhecimentoItensAdmin();
  const aprovar = useAprovarItemConhecimento();

  return (
    <ListShell title="Itens de conhecimento" icon={<BadgeCheck className="h-5 w-5" />}>
      {itens.data?.map((item) => (
        <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-sky-700">{item.codigo}</span>
              <Status value={item.status} />
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.titulo}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.topico} · {item.criticidade} · {item.total_fontes} fonte(s) · {item.total_questoes} questão(ões)
            </p>
          </div>
          {item.status !== 'APROVADO' && item.status !== 'ARQUIVADO' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await aprovar.mutateAsync(item.id);
                  toast.success('Item aprovado.');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Não foi possível aprovar.');
                }
              }}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
            >
              Aprovar item
            </button>
          )}
        </div>
      ))}
      {!itens.isLoading && !itens.data?.length && <Empty text="Nenhum item cadastrado." />}
    </ListShell>
  );
}

function QuestoesTab() {
  const questoes = useConhecimentoQuestoesAdmin();
  const aprovar = useAprovarQuestaoConhecimento();

  return (
    <ListShell title="Banco de questões" icon={<CheckCircle2 className="h-5 w-5" />}>
      {questoes.data?.map((questao) => (
        <div key={questao.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
                {questao.item_codigo} · {questao.variante_chave}
              </span>
              <Status value={questao.status} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-800">{questao.enunciado}</p>
          </div>
          {questao.status !== 'APROVADA' && questao.status !== 'ARQUIVADA' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await aprovar.mutateAsync(questao.id);
                  toast.success('Questão aprovada.');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Não foi possível aprovar.');
                }
              }}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
            >
              Aprovar questão
            </button>
          )}
        </div>
      ))}
      {!questoes.isLoading && !questoes.data?.length && <Empty text="Nenhuma questão cadastrada." />}
    </ListShell>
  );
}

function ListShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-900">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const good = ['VIGENTE', 'APROVADO', 'APROVADA', 'APLICADO'].includes(value);
  const warn = ['EM_REVISAO', 'REVISAO_NECESSARIA', 'RASCUNHO', 'APLICANDO'].includes(value);
  return (
    <span
      className={[
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        good
          ? 'bg-emerald-50 text-emerald-700'
          : warn
            ? 'bg-amber-50 text-amber-700'
            : 'bg-slate-100 text-slate-500',
      ].join(' ')}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
