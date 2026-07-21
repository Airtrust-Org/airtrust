/**
 * Biblioteca de Guias do Instrutor de Simulador.
 *
 * Consulta apenas — não é módulo LMS (sem matrícula/progresso/conclusão).
 * Autorização real (leitura) é validada no backend
 * (simuladores.guias.visualizar) — o frontend nunca infere acesso a partir
 * de texto de role/perfil; consulta `useGuiasInstrutorPermissions()`, que
 * reflete a mesma decisão real do backend (inclui bypass de Platform
 * Admin/Administrador Master). Enquanto a permissão carrega, mostra
 * skeleton — nunca "Acesso restrito" prematuro.
 *
 * Exporta o conteúdo (`GuiasInstrutorContent`) separado da página
 * (`GuiasInstrutor`, default) para ser reaproveitado como aba dentro de
 * `/simuladores`, sem duplicar a implementação.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Search,
  Download,
  ExternalLink,
  CalendarClock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { Breadcrumbs } from '@/react-app/components/shared/Breadcrumbs';
import { PageHeader } from '@/react-app/components/UI/PageHeader';
import { Button, Card, EmptyState, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/react-app/components/UI';
import { Skeleton } from '@/react-app/components/UI/Skeleton';
import { useGuiasInstrutorPermissions } from '@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions';
import {
  baixarGuiaPdf,
  useGuiasInstrutor,
  useProximasSessoesComGuia,
  type GuiaInstrutor,
} from '@/react-app/lib/guias-instrutor/api';

const AERONAVES = ['AW139', 'SK76'] as const;
const PROGRAMAS: Array<{ key: GuiaInstrutor['programa']; label: string }> = [
  { key: 'INICIAL', label: 'Inicial' },
  { key: 'PERIODICO', label: 'Periódico' },
  { key: 'SEMESTRAL', label: 'Semestral' },
];

function ordemSessao(g: GuiaInstrutor): number {
  return (g.ciclo ?? 0) * 100 + (g.sessao_numero ?? 0);
}

function GuiaCard({ guia }: { guia: GuiaInstrutor }) {
  const navigate = useNavigate();
  const [baixando, setBaixando] = useState(false);

  async function handleDownload() {
    setBaixando(true);
    try {
      await baixarGuiaPdf(guia.id, `${guia.codigo}.pdf`);
    } catch {
      // feedback mínimo — não interrompe a navegação
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Card className="p-4 flex flex-col gap-3 focus-within:ring-2 focus-within:ring-primary">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{guia.titulo}</p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{guia.codigo}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          v{guia.versao}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {guia.ciclo ? <span>Ciclo {guia.ciclo}</span> : null}
        {guia.sessao_numero ? (
          <span>
            Sessão {guia.sessao_numero}
            {guia.sessao_total ? ` de ${guia.sessao_total}` : ''}
          </span>
        ) : null}
        {guia.pdf_tamanho_bytes ? (
          <span>{(guia.pdf_tamanho_bytes / 1024 / 1024).toFixed(1)} MB</span>
        ) : null}
        <span>Atualizado em {new Date(guia.updated_at).toLocaleDateString('pt-BR')}</span>
      </div>

      <div className="flex gap-2 mt-1">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={!guia.html_disponivel}
          onClick={() => navigate(`/instrutor/guias/${guia.id}`)}
          aria-label={`Abrir guia ${guia.titulo}`}
        >
          <ExternalLink className="w-4 h-4 mr-1.5" />
          Abrir guia
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!guia.pdf_disponivel || baixando}
          onClick={handleDownload}
          aria-label={`Baixar PDF do guia ${guia.titulo}`}
        >
          <Download className="w-4 h-4 mr-1.5" />
          {baixando ? 'Baixando…' : 'Baixar PDF'}
        </Button>
      </div>
      {!guia.html_disponivel && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          HTML em validação interna — apenas PDF disponível no momento.
        </p>
      )}
    </Card>
  );
}

function ProximasSessoes() {
  const navigate = useNavigate();
  const { data, isLoading } = useProximasSessoesComGuia(6);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
        <CalendarClock className="w-4 h-4" /> Próximas sessões
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((sessao) => (
          <Card key={sessao.sessao_id} className="p-3 flex flex-col gap-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {new Date(`${sessao.data}T00:00:00`).toLocaleDateString('pt-BR')} · {sessao.hora_inicio}
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {sessao.tema_sessao || sessao.tipo_sessao || 'Sessão de simulador'}
            </p>
            {sessao.simulador_nome && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{sessao.simulador_nome}</p>
            )}
            <div className="mt-1">
              {sessao.guia_id ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => navigate(`/instrutor/guias/${sessao.guia_id}`)}
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Guia desta sessão
                </Button>
              ) : (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">Sem guia vinculado</p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BibliotecaAeronave({ aeronave, busca }: { aeronave: string; busca: string }) {
  const [programaAtivo, setProgramaAtivo] = useState<GuiaInstrutor['programa']>('INICIAL');
  const { data, isLoading, isError, refetch } = useGuiasInstrutor({ aeronave, q: busca || undefined });

  const porPrograma = useMemo(() => {
    const grupos: Record<string, GuiaInstrutor[]> = { INICIAL: [], PERIODICO: [], SEMESTRAL: [], CHECK: [] };
    for (const g of data || []) {
      (grupos[g.programa] ||= []).push(g);
    }
    for (const key of Object.keys(grupos)) {
      grupos[key].sort((a, b) => ordemSessao(a) - ordemSessao(b));
    }
    return grupos;
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
        title="Não foi possível carregar os guias"
        description="Verifique sua conexão e tente novamente."
        action={{ label: 'Tentar novamente', onClick: () => refetch(), icon: <RefreshCw className="w-4 h-4" /> }}
      />
    );
  }

  const temAlgo = (data || []).length > 0;
  if (!temAlgo) {
    return (
      <EmptyState
        icon={<BookOpen className="w-10 h-10 text-slate-400" />}
        title="Nenhum guia disponível"
        description={`Ainda não há guias publicados para ${aeronave} com os filtros atuais.`}
      />
    );
  }

  const checkGuias = porPrograma.CHECK || [];

  return (
    <Tabs defaultValue="INICIAL" value={programaAtivo} onValueChange={(v) => setProgramaAtivo(v as GuiaInstrutor['programa'])}>
      <TabsList>
        {PROGRAMAS.map((p) => (
          <TabsTrigger key={p.key} value={p.key}>
            {p.label} ({(porPrograma[p.key] || []).length})
          </TabsTrigger>
        ))}
      </TabsList>

      {PROGRAMAS.map((p) => {
        const guias = porPrograma[p.key] || [];
        const porCiclo = new Map<number | null, GuiaInstrutor[]>();
        for (const g of guias) {
          const lista = porCiclo.get(g.ciclo) || [];
          lista.push(g);
          porCiclo.set(g.ciclo, lista);
        }

        return (
          <TabsContent key={p.key} value={p.key}>
            {guias.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-10 h-10 text-slate-400" />}
                title={`Sem guias no programa ${p.label}`}
                description="Nenhum material publicado para este programa ainda."
              />
            ) : (
              <div className="space-y-6">
                {[...porCiclo.entries()]
                  .sort(([a], [b]) => (a ?? 0) - (b ?? 0))
                  .map(([ciclo, lista]) => (
                    <div key={String(ciclo)}>
                      {ciclo != null && (
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                          Ciclo {ciclo}
                        </h3>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {lista.map((g) => (
                          <GuiaCard key={g.id} guia={g} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {p.key === 'PERIODICO' && checkGuias.length > 0 && (
              <div className="mt-8">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  Check / Avaliação
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {checkGuias.map((g) => (
                    <GuiaCard key={g.id} guia={g} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function AcessoRestrito() {
  return (
    <EmptyState
      icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
      title="Acesso restrito"
      description="Esta área é exclusiva para instrutores autorizados."
    />
  );
}

function GuiasInstrutorSkeleton() {
  return (
    <div className="px-4 sm:px-6 pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Conteúdo da biblioteca, sem AppLayout/Breadcrumbs/PageHeader — reaproveitado
 * como aba dentro de `/simuladores` (que já fornece seu próprio layout) e
 * pela página completa `GuiasInstrutor` (default export) abaixo.
 */
export function GuiasInstrutorContent() {
  const { podeVisualizar, isLoading } = useGuiasInstrutorPermissions();
  const [aeronaveAtiva, setAeronaveAtiva] = useState<string>(AERONAVES[0]);
  const [busca, setBusca] = useState('');

  if (isLoading) return <GuiasInstrutorSkeleton />;
  if (!podeVisualizar) return <AcessoRestrito />;

  return (
    <div className="px-4 sm:px-6 pb-10">
      <ProximasSessoes />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título ou código…"
            className="pl-9"
            aria-label="Buscar guias por título ou código"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-800">
        {AERONAVES.map((a) => (
          <button
            key={a}
            onClick={() => setAeronaveAtiva(a)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              aeronaveAtiva === a
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            {a === 'AW139' ? 'AW139' : 'S-76'}
          </button>
        ))}
      </div>

      <BibliotecaAeronave aeronave={aeronaveAtiva} busca={busca} />
    </div>
  );
}

export default function GuiasInstrutor() {
  return (
    <AppLayout>
      <div className="px-4 sm:px-6 pt-4">
        <Breadcrumbs />
      </div>
      <PageHeader
        title="Guias do Instrutor"
        description="Materiais de preparação e condução das sessões de simulador."
      />
      <GuiasInstrutorContent />
    </AppLayout>
  );
}
