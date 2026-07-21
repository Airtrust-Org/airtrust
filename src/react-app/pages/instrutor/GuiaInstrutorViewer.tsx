/**
 * Visualizador de um Guia do Instrutor — /instrutor/guias/:id
 *
 * O HTML é buscado via fetchWithAuth (respeita o token Bearer da sessão) e
 * renderizado dentro de um iframe sandboxed via `srcDoc` — nunca via `src`
 * direto (que exigiria expor o endpoint sem o header Authorization). O
 * sandbox não inclui allow-scripts/allow-forms/allow-popups: o documento é
 * estático e não deve executar nada.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, AlertTriangle } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { Button, EmptyState } from '@/react-app/components/UI';
import { Skeleton } from '@/react-app/components/UI/Skeleton';
import { fetchWithAuth } from '@/react-app/config/api';
import {
  baixarGuiaPdf,
  guiaHtmlUrl,
  guiaPdfUrl,
  useGuiaInstrutor,
} from '@/react-app/lib/guias-instrutor/api';

/**
 * O visualizador de PDF precisa de um blob: URL — um <iframe src> direto para
 * a rota autenticada não enviaria o header Authorization (é uma navegação de
 * browser, não um fetch controlado).
 */
function usePdfBlobUrl(guiaId: number | null, ativo: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!guiaId || !ativo) return;
    let cancelado = false;
    let objectUrl: string | null = null;

    fetchWithAuth(guiaPdfUrl(guiaId))
      .then(async (res) => {
        if (!res.ok) throw new Error('PDF indisponível');
        return res.blob();
      })
      .then((blob) => {
        if (cancelado) return;
        objectUrl = window.URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelado) setErro('Não foi possível carregar o PDF agora.');
      });

    return () => {
      cancelado = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [guiaId, ativo]);

  return { url, erro };
}

const PROGRAMA_LABEL: Record<string, string> = {
  INICIAL: 'Inicial',
  PERIODICO: 'Periódico',
  SEMESTRAL: 'Semestral',
  CHECK: 'Check / Avaliação',
};

export default function GuiaInstrutorViewer() {
  const { id } = useParams<{ id: string }>();
  const guiaId = id ? Number(id) : null;
  const navigate = useNavigate();
  const { data: guia, isLoading, isError } = useGuiaInstrutor(guiaId);

  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [htmlError, setHtmlError] = useState<string | null>(null);
  const [carregandoHtml, setCarregandoHtml] = useState(false);
  const [modoPdf, setModoPdf] = useState(false);
  const mostrarPdf = modoPdf || !guia?.html_disponivel;
  const { url: pdfBlobUrl, erro: pdfErro } = usePdfBlobUrl(guiaId, Boolean(mostrarPdf && guia?.pdf_disponivel));

  useEffect(() => {
    if (!guiaId || !guia) return;

    if (!guia.html_disponivel) {
      setModoPdf(true);
      return;
    }

    let ativo = true;
    setCarregandoHtml(true);
    setHtmlError(null);

    fetchWithAuth(guiaHtmlUrl(guiaId))
      .then(async (res) => {
        if (!res.ok) throw new Error('Não foi possível carregar o HTML do guia');
        return res.text();
      })
      .then((text) => {
        if (ativo) setHtmlContent(text);
      })
      .catch(() => {
        if (ativo) setHtmlError('Não foi possível carregar o conteúdo do guia agora.');
      })
      .finally(() => {
        if (ativo) setCarregandoHtml(false);
      });

    return () => {
      ativo = false;
    };
  }, [guiaId, guia]);

  async function handleDownload() {
    if (!guiaId || !guia) return;
    await baixarGuiaPdf(guiaId, `${guia.codigo}.pdf`).catch(() => undefined);
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[70vh] w-full rounded-lg" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !guia) {
    return (
      <AppLayout>
        <EmptyState
          icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
          title="Guia não encontrado"
          description="Este guia não existe, foi desativado ou você não tem acesso a ele."
          action={{ label: 'Voltar à biblioteca', onClick: () => navigate('/instrutor/guias') }}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" onClick={() => navigate('/instrutor/guias')} aria-label="Voltar">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">{guia.titulo}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {guia.codigo} · v{guia.versao} · {guia.aeronave_nome} ·{' '}
                {PROGRAMA_LABEL[guia.programa] || guia.programa}
                {guia.ciclo ? ` · Ciclo ${guia.ciclo}` : ''}
                {guia.sessao_numero ? ` · Sessão ${guia.sessao_numero}` : ''}
                {' · '}
                atualizado em {new Date(guia.updated_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {guia.html_disponivel && (
              <Button variant="secondary" onClick={() => setModoPdf((v) => !v)}>
                {modoPdf ? 'Ver HTML' : 'Ver PDF'}
              </Button>
            )}
            <Button variant="primary" disabled={!guia.pdf_disponivel} onClick={handleDownload}>
              <Download className="w-4 h-4 mr-1.5" /> Baixar PDF
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-[70vh] bg-slate-100 dark:bg-slate-950">
          {mostrarPdf ? (
            !guia.pdf_disponivel ? (
              <div className="p-8">
                <EmptyState
                  icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
                  title="Nenhum documento disponível"
                  description="Este guia ainda não tem PDF nem HTML publicados."
                />
              </div>
            ) : pdfErro ? (
              <div className="p-8">
                <EmptyState
                  icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
                  title="Erro ao carregar o PDF"
                  description={pdfErro}
                  action={{ label: 'Tentar novamente', onClick: () => window.location.reload() }}
                />
              </div>
            ) : pdfBlobUrl ? (
              <iframe
                title={`PDF — ${guia.titulo}`}
                src={pdfBlobUrl}
                className="w-full h-[80vh] border-0"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="p-6">
                <Skeleton className="h-[70vh] w-full rounded-lg" />
              </div>
            )
          ) : carregandoHtml ? (
            <div className="p-6">
              <Skeleton className="h-[70vh] w-full rounded-lg" />
            </div>
          ) : htmlError ? (
            <div className="p-8">
              <EmptyState
                icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
                title="Erro ao carregar o guia"
                description={htmlError}
                action={{ label: 'Tentar novamente', onClick: () => window.location.reload() }}
              />
            </div>
          ) : htmlContent ? (
            <iframe
              title={`Guia — ${guia.titulo}`}
              srcDoc={htmlContent}
              className="w-full h-[80vh] border-0 bg-white"
              sandbox="allow-same-origin"
            />
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
