/**
 * FRMS — Importação de FIRA (/frms/importacao/fira)
 *
 * Wizard 3 passos:
 *   1. Upload do PDF
 *   2. Revisão e confirmação das jornadas
 *   3. Resumo dos resultados
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  ChevronLeft,
  Loader2,
  User,
  X,
  History,
  RefreshCw,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import { useFrmsMutation } from '@/react-app/hooks/useFrms';
import { useApi, clearApiCacheByPattern } from '@/react-app/hooks/useApi';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { processFiraFileWithFallback } from './firaUploadFallback';
import type {
  FiraImportacaoPreview,
  FiraImportacaoResultado,
  FiraLinhPreview,
  FiraLoteUploadItem,
  FiraLoteUploadResponse,
  FrmsFonteComparativoResponse,
} from './frmsFiraTypes';

// ──────────────────────────────────────────────────────────────
// Types (espelha worker-airtrust/src/lib/frms/fira-service.ts)
// ──────────────────────────────────────────────────────────────

interface FiraLoteItemResultado {
  arquivo_nome: string;
  status: 'IMPORTADO' | 'IGNORADO' | 'ERRO';
  detalhe: string;
  resultado?: FiraImportacaoResultado;
  importacao_id?: string;
}

interface FiraLoteResultado {
  total_arquivos: number;
  processados: number;
  erros_upload: number;
  importados_total: number;
  substituidos_total: number;
  ignorados_total: number;
  erros_total: number;
  alertas_gerados_total: number;
  itens: FiraLoteItemResultado[];
}

interface FuncRow {
  id: number;
  nome: string;
  codigo_anac?: string;
  canac?: string;
  funcao?: string;
}

interface FiraImportacaoDetalheRow {
  id: string;
  status: string;
  preview_json?: string | FiraImportacaoPreview | null;
}

function recalcularResumoLote(
  lote: FiraLoteResultado,
  itens: FiraLoteItemResultado[],
): Pick<
  FiraLoteResultado,
  | 'importados_total'
  | 'substituidos_total'
  | 'ignorados_total'
  | 'erros_total'
  | 'alertas_gerados_total'
> {
  let importados_total = 0;
  let substituidos_total = 0;
  let ignorados_total = 0;
  let erros_total = 0;
  let alertas_gerados_total = 0;

  for (const item of itens) {
    if (item.status === 'ERRO') {
      erros_total += 1;
      continue;
    }

    if (item.status === 'IGNORADO') {
      ignorados_total += 1;
      continue;
    }

    if (item.resultado) {
      importados_total += item.resultado.importados;
      substituidos_total += item.resultado.substituidos;
      ignorados_total += item.resultado.ignorados;
      erros_total += item.resultado.erros;
      alertas_gerados_total += item.resultado.alertas_gerados;
    }
  }

  return {
    importados_total,
    substituidos_total,
    ignorados_total,
    erros_total,
    alertas_gerados_total,
  };
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function formatMin(min: number): string {
  if (!min) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function situacaoBadge(s: FiraLinhPreview['situacao']) {
  switch (s) {
    case 'NOVO':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-3 w-3" /> Novo
        </span>
      );
    case 'DUPLICATA':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          <RefreshCw className="h-3 w-3" /> Duplicata
        </span>
      );
    case 'DIA_VAZIO':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          <X className="h-3 w-3" /> Vazio
        </span>
      );
  }
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    ES: 'bg-sky-100 text-sky-800',
    TS: 'bg-blue-100 text-blue-800',
    TV: 'bg-purple-100 text-purple-800',
    EX: 'bg-indigo-100 text-indigo-800',
    RE: 'bg-teal-100 text-teal-800',
    SA: 'bg-emerald-100 text-emerald-800',
    FE: 'bg-gray-100 text-gray-600',
    FR: 'bg-gray-100 text-gray-600',
    FS: 'bg-gray-100 text-gray-600',
    AM: 'bg-rose-100 text-rose-700',
    DM: 'bg-orange-100 text-orange-700',
    OT: 'bg-gray-100 text-gray-600',
  };
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Subcomponente: seletor de tripulante
// ──────────────────────────────────────────────────────────────

function TripulanteSelector({ onSelect }: { onSelect: (id: number, nome: string) => void }) {
  const [busca, setBusca] = useState('');
  const { data: raw, loading } = useApi<{ data: FuncRow[] }>(
    '/api/funcionarios?limit=200&page=1&status=ativos&orderBy=nome&order=ASC',
  );

  const resposta = raw as { data?: FuncRow[] } | null;
  const lista: FuncRow[] = (resposta?.data ?? []).filter((f: FuncRow) => {
    if (!busca.trim()) return true;
    const b = busca.toLowerCase();
    return (
      f.nome.toLowerCase().includes(b) ||
      (f.codigo_anac ?? '').toLowerCase().includes(b) ||
      (f.canac ?? '').toLowerCase().includes(b)
    );
  });

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-900">
        <User className="h-4 w-4" />
        Tripulante não encontrado pelo CANAC — selecione manualmente:
      </p>
      <input
        type="text"
        placeholder="Buscar por nome ou CANAC…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="mb-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      />
      {loading ? (
        <p className="text-xs text-gray-400">Carregando…</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto space-y-1">
          {lista.slice(0, 30).map((f) => (
            <li key={f.id}>
              <button
                onClick={() => onSelect(f.id, f.nome)}
                className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-amber-100 transition-colors"
              >
                <span className="font-medium">{f.nome}</span>
                {(f.codigo_anac || f.canac) && (
                  <span className="ml-2 text-xs text-gray-500">
                    CANAC {f.codigo_anac ?? f.canac}
                  </span>
                )}
              </button>
            </li>
          ))}
          {lista.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

const FRMS_IMPORT_FALLBACK_API_BASE = API_BASE_URL;

function isNetworkFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message?.toLowerCase?.() ?? '';
  return (
    msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')
  );
}

export default function FrmsImportacaoFira() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mutate } = useFrmsMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step control
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(null);

  // Step 2
  const [preview, setPreview] = useState<FiraImportacaoPreview | null>(null);
  const [selecionados, setSelecionados] = useState<Record<number, boolean>>({});
  const [forcarSubstituicao, setForcarSubstituicao] = useState<Record<number, boolean>>({});
  const [tripulanteId, setTripulanteId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [comparativoFontes, setComparativoFontes] = useState<FrmsFonteComparativoResponse | null>(
    null,
  );
  const [comparativoCarregando, setComparativoCarregando] = useState(false);
  const [fontePosImportacao, setFontePosImportacao] = useState<'' | 'SIGVOOS' | 'FIRA'>('');

  // Step 3
  const [resultado, setResultado] = useState<FiraImportacaoResultado | null>(null);
  const [resultadoLote, setResultadoLote] = useState<FiraLoteResultado | null>(null);
  const [corrigindoImportacaoId, setCorrigindoImportacaoId] = useState<string | null>(null);
  const [origemCorrecao, setOrigemCorrecao] = useState<'LOTE' | 'HISTORICO' | null>(null);

  const arquivo = arquivos[0] ?? null;

  const getAuthToken = useCallback((): string | null => {
    return getAccessToken();
  }, []);

  const fetchFrmsImport = useCallback(async (path: string, init: RequestInit) => {
    try {
      const primary = await fetch(`${API_BASE_URL}${path}`, init);
      if (primary.status !== 404 || API_BASE_URL === FRMS_IMPORT_FALLBACK_API_BASE) {
        return primary;
      }
      // Alguns fluxos de importação podem cair no fallback (workers.dev).
      // Se a API primária responder 404 para recursos recém-criados,
      // tentamos o fallback para manter consistência do fluxo.
      return fetch(`${FRMS_IMPORT_FALLBACK_API_BASE}${path}`, init);
    } catch (err) {
      if (!isNetworkFetchError(err) || API_BASE_URL === FRMS_IMPORT_FALLBACK_API_BASE) {
        throw err;
      }
      return fetch(`${FRMS_IMPORT_FALLBACK_API_BASE}${path}`, init);
    }
  }, []);

  const aplicarPreview = useCallback((prev: FiraImportacaoPreview) => {
    setPreview(prev);
    setResultadoLote(null);
    setTripulanteId(prev.tripulante_id);
    setComparativoFontes(null);
    setFontePosImportacao('');

    const sel: Record<number, boolean> = {};
    const sub: Record<number, boolean> = {};
    for (const l of prev.linhas) {
      sel[l.dia] = l.situacao === 'NOVO';
      sub[l.dia] = false;
    }
    setSelecionados(sel);
    setForcarSubstituicao(sub);
    setStep(2);
  }, []);

  useEffect(() => {
    if (step !== 2 || !preview?.importacao_id) {
      setComparativoFontes(null);
      return;
    }

    let cancelled = false;
    const carregarComparativo = async () => {
      setComparativoCarregando(true);
      try {
        const token = getAuthToken();
        const res = await fetchFrmsImport(
          `/frms/importacao/fira/${preview.importacao_id}/comparativo-fontes`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        );

        const payload = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: FrmsFonteComparativoResponse;
          error?: string;
        } | null;

        if (!res.ok || !payload?.success || !payload?.data) {
          throw new Error(payload?.error || 'Não foi possível carregar comparativo de fontes');
        }

        if (cancelled) return;
        setComparativoFontes(payload.data);
        if (payload.data.fonte_preferida) {
          setFontePosImportacao(payload.data.fonte_preferida);
        }
      } catch {
        if (!cancelled) {
          setComparativoFontes(null);
        }
      } finally {
        if (!cancelled) setComparativoCarregando(false);
      }
    };

    void carregarComparativo();

    return () => {
      cancelled = true;
    };
  }, [fetchFrmsImport, getAuthToken, preview?.importacao_id, step]);

  const processarArquivoComFallback = useCallback(
    async (file: File): Promise<FiraLoteUploadItem[]> => {
      const token = getAuthToken();
      return processFiraFileWithFallback(file, {
        fetchFrmsImport,
        token,
        onStatusChange: setUploadStatusMessage,
      });
    },
    [fetchFrmsImport, getAuthToken],
  );

  // ── Handlers Step 1 ──────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    const pdfs = dropped.filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length > 0) {
      setArquivos(pdfs);
    } else {
      toast.error('Selecione um arquivo PDF válido');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length > 0) setArquivos(pdfs);
  };

  // ── Confirmar resultado de lote (compartilhado entre multi-arquivo e multi-página) ──

  const processarResultadoLote = useCallback(
    async (uploadData: FiraLoteUploadResponse, label = 'Lote de FIRA processado') => {
      const itensResultado: FiraLoteItemResultado[] = [];
      let importadosTotal = 0;
      let substituidosTotal = 0;
      let ignoradosTotal = 0;
      let errosTotal = 0;
      let alertasTotal = 0;

      for (const item of uploadData.itens) {
        if (!item.success || !item.data) {
          itensResultado.push({
            arquivo_nome: item.arquivo_nome,
            status: 'ERRO',
            detalhe: item.error ?? 'Falha ao processar PDF',
          });
          errosTotal += 1;
          continue;
        }

        const prev = item.data;
        if (!prev.tripulante_id) {
          itensResultado.push({
            arquivo_nome: item.arquivo_nome,
            status: 'ERRO',
            detalhe: 'Tripulante não identificado automaticamente (requer revisão manual)',
            importacao_id: prev.importacao_id,
          });
          errosTotal += 1;
          continue;
        }

        const diasSelecionados = (prev.linhas ?? [])
          .filter((l) => l.situacao === 'NOVO')
          .map((l) => ({ dia: l.dia, forcar_substituicao: false }));

        if (diasSelecionados.length === 0) {
          itensResultado.push({
            arquivo_nome: item.arquivo_nome,
            status: 'IGNORADO',
            detalhe: 'Sem jornadas NOVAS para importar (apenas duplicatas/vazios)',
          });
          ignoradosTotal += 1;
          continue;
        }

        try {
          const confirmPath = `/frms/importacao/fira/${prev.importacao_id}/confirmar`;
          const confirmBody = JSON.stringify({
            dias_selecionados: diasSelecionados,
            observacao: 'Importação em lote de FIRA',
          });

          const token = getAuthToken();

          const executarConfirm = async () => {
            const res = await fetchFrmsImport(confirmPath, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: confirmBody,
            });

            const json = (await res.json().catch(() => null)) as {
              success?: boolean;
              data?: FiraImportacaoResultado;
              error?: string;
            } | null;

            if (!res.ok || !json?.success || !json?.data) {
              throw new Error(json?.error || `Falha ao confirmar (${res.status})`);
            }

            return json.data;
          };

          let confirm: FiraImportacaoResultado;
          try {
            confirm = await executarConfirm();
          } catch (err) {
            if (!isNetworkFetchError(err)) throw err;
            confirm = await executarConfirm();
          }

          itensResultado.push({
            arquivo_nome: item.arquivo_nome,
            status: 'IMPORTADO',
            detalhe: `${confirm.importados} importadas, ${confirm.substituidos} substituídas, ${confirm.erros} erros`,
            resultado: confirm,
          });

          importadosTotal += confirm.importados;
          substituidosTotal += confirm.substituidos;
          ignoradosTotal += confirm.ignorados;
          errosTotal += confirm.erros;
          alertasTotal += confirm.alertas_gerados;
        } catch (error) {
          itensResultado.push({
            arquivo_nome: item.arquivo_nome,
            status: 'ERRO',
            detalhe: (error as Error).message || 'Erro ao confirmar importação',
            importacao_id: prev.importacao_id,
          });
          errosTotal += 1;
        }
      }

      setResultadoLote({
        total_arquivos: uploadData.total_arquivos,
        processados: uploadData.processados,
        erros_upload: uploadData.erros,
        importados_total: importadosTotal,
        substituidos_total: substituidosTotal,
        ignorados_total: ignoradosTotal,
        erros_total: errosTotal,
        alertas_gerados_total: alertasTotal,
        itens: itensResultado,
      });

      setResultado(null);
      setPreview(null);
      setStep(3);
      clearApiCacheByPattern('/frms/heatmap');
      clearApiCacheByPattern('/frms/acumulo-frota');
      clearApiCacheByPattern('/frms/alertas');
      clearApiCacheByPattern('/frms/tripulante/');
      toast.success(label);
    },
    [fetchFrmsImport, getAuthToken],
  );

  // ── Handlers Step 1 (continuação) ────────────────────────────

  const handleProcessarLote = async () => {
    if (arquivos.length <= 1) return;

    setUploading(true);
    setUploadStatusMessage(null);
    try {
      const itens: FiraLoteUploadItem[] = [];
      for (const file of arquivos) {
        const processados = await processarArquivoComFallback(file);
        itens.push(...processados);
      }

      const processados = itens.filter((item) => item.success).length;
      const uploadData: FiraLoteUploadResponse = {
        total_arquivos: itens.length,
        processados,
        erros: itens.length - processados,
        itens,
      };

      await processarResultadoLote(uploadData, 'Lote de FIRA processado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao processar lote');
    } finally {
      setUploadStatusMessage(null);
      setUploading(false);
    }
  };

  const handleProcessar = async () => {
    if (!arquivo) return;
    if (arquivos.length > 1) {
      await handleProcessarLote();
      return;
    }

    setUploading(true);
    setUploadStatusMessage(null);
    try {
      const itens = await processarArquivoComFallback(arquivo);

      if (itens.length > 1) {
        const processados = itens.filter((item) => item.success).length;
        await processarResultadoLote(
          {
            total_arquivos: itens.length,
            processados,
            erros: itens.length - processados,
            itens,
          },
          `${processados} FIRAs processadas a partir do PDF`,
        );
        return;
      }

      const unico = itens[0];
      if (!unico?.success || !unico.data) {
        throw new Error(unico?.error ?? 'Erro ao processar FIRA');
      }

      aplicarPreview(unico.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao processar PDF');
    } finally {
      setUploadStatusMessage(null);
      setUploading(false);
    }
  };

  // ── Handlers Step 2 ──────────────────────────────────────────

  const toggleSelecao = (dia: number, situacao: FiraLinhPreview['situacao']) => {
    if (situacao === 'DIA_VAZIO') return;
    setSelecionados((prev) => ({ ...prev, [dia]: !prev[dia] }));
  };

  const toggleForcarSubstituicao = (dia: number) => {
    setForcarSubstituicao((prev) => {
      const novo = { ...prev, [dia]: !prev[dia] };
      // Se forçar substituição, marcar automaticamente
      if (novo[dia]) {
        setSelecionados((s) => ({ ...s, [dia]: true }));
      }
      return novo;
    });
  };

  const handleVincularTripulante = async (id: number, nome: string) => {
    if (!preview) return;
    setVinculando(true);
    try {
      await mutate(`/api/frms/importacao/fira/${preview.importacao_id}/vincular-tripulante`, {
        method: 'PATCH',
        body: JSON.stringify({ tripulante_id: String(id) }),
      });
      setTripulanteId(String(id));
      setPreview((p) =>
        p ? { ...p, tripulante_id: String(id), tripulante_nome_sistema: nome } : p,
      );
      toast.success(`Tripulante ${nome} vinculado`);
    } catch {
      toast.error('Erro ao vincular tripulante');
    } finally {
      setVinculando(false);
    }
  };

  const totalMarcados = Object.values(selecionados).filter(Boolean).length;

  const handleCorrigirItem = async (
    importacaoId: string,
    origem: 'LOTE' | 'HISTORICO' = 'LOTE',
  ) => {
    setCorrigindoImportacaoId(importacaoId);
    setOrigemCorrecao(origem);
    try {
      const response = await fetchFrmsImport(`/frms/importacao/fira/${importacaoId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const payload = (await response.json()) as {
        success?: boolean;
        data?: FiraImportacaoDetalheRow;
        error?: string;
      };

      if (!response.ok || !payload?.success || !payload?.data) {
        throw new Error(payload?.error || 'Não foi possível abrir a correção do arquivo');
      }

      const detalhe = payload.data;

      const previewRaw = detalhe?.preview_json;
      const parsedPreview: FiraImportacaoPreview | null =
        typeof previewRaw === 'string'
          ? (JSON.parse(previewRaw) as FiraImportacaoPreview)
          : (previewRaw as FiraImportacaoPreview | null);

      if (!parsedPreview || !parsedPreview.linhas) {
        throw new Error('Preview da importação não encontrado para revisão');
      }

      setPreview(parsedPreview);
      setTripulanteId(parsedPreview.tripulante_id ?? null);

      const sel: Record<number, boolean> = {};
      const sub: Record<number, boolean> = {};
      for (const l of parsedPreview.linhas) {
        sel[l.dia] = l.situacao === 'NOVO';
        sub[l.dia] = false;
      }
      setSelecionados(sel);
      setForcarSubstituicao(sub);
      setObservacao('Correção individual após importação em lote');
      setResultado(null);
      setStep(2);
      toast.success('Caso aberto para correção individual');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao abrir correção do arquivo');
    } finally {
      setCorrigindoImportacaoId(null);
    }
  };

  useEffect(() => {
    const corrigirId = searchParams.get('corrigir');
    if (!corrigirId) return;
    const from = (searchParams.get('from') || '').toLowerCase();
    const origem = from === 'historico' ? 'HISTORICO' : 'LOTE';

    handleCorrigirItem(corrigirId, origem).finally(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('corrigir');
      next.delete('from');
      setSearchParams(next, { replace: true });
    });
  }, [searchParams, setSearchParams]);

  const handleConfirmar = async () => {
    if (!preview) return;
    if (!tripulanteId) {
      toast.error('Vincule um tripulante antes de confirmar');
      return;
    }
    if (totalMarcados === 0) {
      toast.error('Selecione pelo menos uma jornada para importar');
      return;
    }

    setConfirmando(true);
    try {
      const dias_selecionados = (preview.linhas ?? [])
        .filter((l) => selecionados[l.dia])
        .map((l) => ({ dia: l.dia, forcar_substituicao: forcarSubstituicao[l.dia] ?? false }));

      const resultadoImportacao = await mutate(
        `/api/frms/importacao/fira/${preview.importacao_id}/confirmar`,
        {
          method: 'POST',
          body: JSON.stringify({ dias_selecionados, observacao: observacao || undefined }),
        },
      );

      const resultadoTyped = resultadoImportacao as FiraImportacaoResultado;

      if (fontePosImportacao && tripulanteId) {
        try {
          await mutate('/api/frms/importacao/fira/fonte-calculo', {
            method: 'POST',
            body: JSON.stringify({
              tripulante_id: tripulanteId,
              ano: preview.ano,
              mes: preview.mes,
              fonte: fontePosImportacao,
            }),
          });
          toast.success(
            `Fonte ${fontePosImportacao} aplicada para os cálculos de ${preview.mes_nome}/${preview.ano}`,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Falha ao aplicar fonte de cálculo';
          toast.error(message);
        }
      }

      if (resultadoLote) {
        setResultadoLote((prevLote) => {
          if (!prevLote) return prevLote;
          const itensAtualizados = prevLote.itens.map((item) => {
            if (item.importacao_id !== preview.importacao_id) return item;
            return {
              ...item,
              status: 'IMPORTADO' as const,
              detalhe: `${resultadoTyped.importados} importadas, ${resultadoTyped.substituidos} substituídas, ${resultadoTyped.erros} erros`,
              resultado: resultadoTyped,
            };
          });

          const resumo = recalcularResumoLote(prevLote, itensAtualizados);

          return {
            ...prevLote,
            ...resumo,
            itens: itensAtualizados,
          };
        });

        setPreview(null);
        setSelecionados({});
        setForcarSubstituicao({});
        setTripulanteId(null);
        setObservacao('');
        setStep(3);
        clearApiCacheByPattern('/frms/heatmap');
        clearApiCacheByPattern('/frms/acumulo-frota');
        clearApiCacheByPattern('/frms/alertas');
        clearApiCacheByPattern('/frms/tripulante/');
        toast.success('Correção aplicada e lote atualizado!');
      } else {
        setResultado(resultadoTyped);
        setStep(3);
        clearApiCacheByPattern('/frms/heatmap');
        clearApiCacheByPattern('/frms/acumulo-frota');
        clearApiCacheByPattern('/frms/alertas');
        clearApiCacheByPattern('/frms/tripulante/');
        toast.success('Importação concluída!');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao confirmar');
    } finally {
      setConfirmando(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────

  const stepLabels = ['Upload', 'Revisão', 'Concluído'];

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header — padrão subpáginas FRMS */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/frms')}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> FRMS
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Importar FIRA</h1>
            <p className="text-sm text-gray-500">
              Importe jornadas diretamente do PDF da Ficha Individual do Aeronauta (ANAC)
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/frms/importacao/fira/historico')}>
            <History className="mr-2 h-4 w-4" />
            Histórico
          </Button>
        </div>

        <div className="max-w-5xl mx-auto px-4 pb-8">
          {/* Stepper */}
          <div className="mb-8 flex items-center gap-0">
            {stepLabels.map((label, idx) => {
              const s = (idx + 1) as Step;
              const active = s === step;
              const done = s < step;
              return (
                <div key={s} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                        done
                          ? 'bg-emerald-500 text-white'
                          : active
                            ? 'bg-primary text-white ring-4 ring-blue-100'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-5 w-5" /> : s}
                    </div>
                    <span
                      className={`mt-1.5 text-xs font-medium ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-gray-400'}`}
                    >
                      {label}
                    </span>
                  </div>
                  {idx < stepLabels.length - 1 && (
                    <div
                      className={`mx-3 mb-4 h-0.5 w-16 flex-1 rounded-full transition-colors ${done ? 'bg-emerald-400' : 'bg-gray-200'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── STEP 1: Upload ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 transition-all ${
                  dragging
                    ? 'border-blue-500 bg-blue-50'
                    : arquivo
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {arquivo ? (
                  <>
                    <FileText className="h-14 w-14 text-emerald-500" />
                    <p className="mt-3 text-base font-semibold text-emerald-700">
                      {arquivos.length === 1
                        ? arquivo.name
                        : `${arquivos.length} arquivos PDF selecionados`}
                    </p>
                    <p className="mt-1 text-sm text-emerald-600">
                      {arquivos.length === 1
                        ? `${(arquivo.size / 1024).toFixed(0)} KB — clique para trocar`
                        : 'clique para trocar os arquivos'}
                    </p>
                    {arquivos.length > 1 && (
                      <div className="mt-3 max-h-28 w-full overflow-y-auto rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-left text-xs text-emerald-700">
                        {arquivos.map((f) => (
                          <p key={f.name + String(f.size)} className="truncate">
                            • {f.name}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Upload className="h-14 w-14 text-gray-400" />
                    <p className="mt-4 text-base font-semibold text-gray-600">
                      Arraste o(s) PDF(s) da FIRA aqui
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      ou clique para selecionar (máx. 10 MB por arquivo)
                    </p>
                    <p className="mt-2 text-xs text-blue-500 font-medium">
                      📄 PDFs com várias FIRAs (uma por página) são detectados automaticamente
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="flex items-start gap-2 text-sm text-blue-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    O sistema extrai automaticamente CANAC, nome, período e jornadas do PDF. Você
                    poderá revisar antes de confirmar.{' '}
                    <strong>
                      PDFs com múltiplas FIRAs (uma por página) são importados automaticamente em
                      lote.
                    </strong>
                  </span>
                </p>
              </div>

              {uploading && uploadStatusMessage && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  {uploadStatusMessage}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => navigate('/frms')}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  disabled={!arquivo || uploading}
                  onClick={handleProcessar}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando…
                    </>
                  ) : (
                    <>
                      {arquivos.length > 1
                        ? `Processar ${arquivos.length} FIRAs`
                        : 'Processar FIRA'}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Revisão ── */}
          {step === 2 && preview && (
            <div className="space-y-4">
              {/* Cabeçalho FIRA */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Aeronauta
                    </p>
                    {preview.tripulante_nome_sistema ? (
                      <p className="mt-1 font-semibold text-gray-900">
                        {preview.tripulante_nome_sistema}
                      </p>
                    ) : (
                      <p className="mt-1 font-semibold text-amber-600">Não identificado</p>
                    )}
                    <p className="text-xs text-gray-400">FIRA: {preview.tripulante_nome_fira}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      CANAC
                    </p>
                    <p className="mt-1 font-mono font-semibold text-gray-900">{preview.canac}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Período
                    </p>
                    <p className="mt-1 font-semibold text-gray-900 capitalize">
                      {preview.mes_nome} / {preview.ano}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Totais FIRA
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      <span className="font-semibold">VL:</span> {preview.totais_fira.voo}{' '}
                      <span className="ml-2 font-semibold">JN:</span> {preview.totais_fira.jornada}
                    </p>
                  </div>
                </div>

                {/* Divergência */}
                {preview.divergencia_totais && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    Divergência detectada entre os totais da FIRA e os valores calculados linha a
                    linha. Verifique antes de confirmar.
                  </div>
                )}

                {/* Avisos do parser */}
                {preview.avisos.length > 0 && (
                  <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                    <p className="mb-1 font-semibold">Avisos do parser:</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {preview.avisos.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Vincular tripulante */}
              {!preview.tripulante_encontrado && !tripulanteId && (
                <TripulanteSelector
                  onSelect={(id, nome) => {
                    if (!vinculando) handleVincularTripulante(id, nome);
                  }}
                />
              )}

              {!preview.tripulante_encontrado && tripulanteId && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Tripulante vinculado: <strong>{preview.tripulante_nome_sistema}</strong>
                </div>
              )}

              {/* Legenda */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Novo — será importado
                </span>
                <span className="flex items-center gap-1">
                  <RefreshCw className="h-3.5 w-3.5 text-amber-500" /> Duplicata — já existe no
                  sistema
                </span>
                <span className="flex items-center gap-1">
                  <X className="h-3.5 w-3.5 text-gray-400" /> Vazio — sem dados (ignorado)
                </span>
              </div>

              {/* Ações em massa para duplicatas */}
              {preview.linhas.some((l) => l.situacao === 'DUPLICATA') && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  {preview.linhas.filter((l) => l.situacao === 'DUPLICATA').length} dia(s) já
                  possuem jornada cadastrada. Marque &quot;Substituir&quot; linha a linha para
                  sobrescrever.
                </div>
              )}

              {/* Tabela de dias */}
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                      <th className="w-8 py-3 pl-4 text-left">
                        <input
                          type="checkbox"
                          checked={preview.linhas
                            .filter((l) => l.situacao !== 'DIA_VAZIO')
                            .every((l) => selecionados[l.dia])}
                          onChange={(e) => {
                            const novo: Record<number, boolean> = {};
                            for (const l of preview.linhas) {
                              novo[l.dia] = l.situacao !== 'DIA_VAZIO' && e.target.checked;
                            }
                            setSelecionados(novo);
                          }}
                          className="h-4 w-4 scale-[0.65] rounded accent-blue-600 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 pl-2 text-left">Dia</th>
                      <th className="py-3 text-left">Status</th>
                      <th className="py-3 text-left">Apresentação</th>
                      <th className="py-3 text-left">Término</th>
                      <th className="py-3 text-right">Jornada</th>
                      <th className="py-3 text-right">H. Voo</th>
                      <th className="py-3 text-left">Local</th>
                      <th className="py-3 text-left">Situação</th>
                      <th className="py-3 pr-4 text-left">Subst.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.linhas.map((l) => {
                      const disabled = l.situacao === 'DIA_VAZIO';
                      const checked = selecionados[l.dia] ?? false;
                      const subst = forcarSubstituicao[l.dia] ?? false;

                      return (
                        <tr
                          key={l.dia}
                          className={`transition-colors ${disabled ? 'opacity-40' : checked ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}
                        >
                          <td className="py-2.5 pl-4">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={checked}
                              onChange={() => toggleSelecao(l.dia, l.situacao)}
                              className="h-4 w-4 scale-[0.65] rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-2.5 pl-2 font-mono text-xs text-gray-600">
                            {l.data ? l.data.split('-').reverse().join('/') : '—'}
                          </td>
                          <td className="py-2.5">{statusBadge(l.status_frms)}</td>
                          <td className="py-2.5 text-xs text-gray-600">
                            {l.hora_apresentacao ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2.5 text-xs text-gray-600">
                            {l.hora_termino ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2.5 text-right text-xs text-gray-600">
                            {l.duracao_jornada_min ? (
                              formatMin(l.duracao_jornada_min)
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right text-xs text-gray-600">
                            {l.horas_voo_min ? (
                              formatMin(l.horas_voo_min)
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 max-w-[80px] truncate text-xs text-gray-500">
                            {l.local_base ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2.5">{situacaoBadge(l.situacao)}</td>
                          <td className="py-2.5 pr-4">
                            {l.situacao === 'DUPLICATA' && (
                              <input
                                type="checkbox"
                                title="Substituir jornada existente"
                                checked={subst}
                                onChange={() => toggleForcarSubstituicao(l.dia)}
                                className="h-4 w-4 scale-[0.65] rounded accent-amber-500 cursor-pointer"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Observação */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Observação (opcional)
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Notas sobre esta importação…"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Ações */}
              <div className="flex items-center justify-between">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPreview(null);
                    setSelecionados({});
                    setForcarSubstituicao({});
                    setTripulanteId(null);
                    setObservacao('');

                    if (origemCorrecao === 'LOTE' && resultadoLote) {
                      setStep(3);
                      return;
                    }

                    if (origemCorrecao === 'HISTORICO') {
                      navigate('/frms/importacao/fira/historico');
                      return;
                    }

                    setStep(1);
                  }}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  {origemCorrecao === 'LOTE' && resultadoLote
                    ? 'Voltar ao resumo do lote'
                    : origemCorrecao === 'HISTORICO'
                      ? 'Voltar ao histórico'
                      : 'Voltar'}
                </Button>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {totalMarcados} jornada{totalMarcados !== 1 ? 's' : ''} selecionada
                    {totalMarcados !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="primary"
                    disabled={totalMarcados === 0 || confirmando || !tripulanteId}
                    onClick={handleConfirmar}
                  >
                    {confirmando ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importando…
                      </>
                    ) : (
                      <>
                        Importar {totalMarcados > 0 ? `${totalMarcados} jornadas` : ''}
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {comparativoCarregando && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Carregando comparativo SIGVOOS x FIRA...
            </div>
          )}

          {comparativoFontes && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm font-semibold text-sky-900">
                Double-check operacional (SIGVOOS x FIRA)
              </p>
              <p className="mt-1 text-xs text-sky-700">
                Compare o que a FIRA trouxe neste upload com o que já está vindo do SIGVOOS para a
                mesma competência.
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">FIRA (preview)</p>
                  <p>Dias: {comparativoFontes.totais.fira_preview.dias}</p>
                  <p>Jornada: {formatMin(comparativoFontes.totais.fira_preview.jornada_min)}</p>
                  <p>Voo: {formatMin(comparativoFontes.totais.fira_preview.voo_min)}</p>
                </div>
                <div className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">SIGVOOS (já importado)</p>
                  <p>Dias: {comparativoFontes.totais.sigvoos.dias}</p>
                  <p>Jornada: {formatMin(comparativoFontes.totais.sigvoos.jornada_min)}</p>
                  <p>Voo: {formatMin(comparativoFontes.totais.sigvoos.voo_min)}</p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-700">
                Só na FIRA: {comparativoFontes.dias.somente_fira_preview.length} dia(s) | Só no
                SIGVOOS: {comparativoFontes.dias.somente_sigvoos.length} dia(s) | Divergentes:{' '}
                {comparativoFontes.dias.divergentes.length} dia(s)
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-800">
                <span className="font-medium">Após importar, usar para os cálculos:</span>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="fonte-calculo"
                    value="SIGVOOS"
                    checked={fontePosImportacao === 'SIGVOOS'}
                    onChange={() => setFontePosImportacao('SIGVOOS')}
                    className="h-4 w-4"
                  />
                  SIGVOOS
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="fonte-calculo"
                    value="FIRA"
                    checked={fontePosImportacao === 'FIRA'}
                    onChange={() => setFontePosImportacao('FIRA')}
                    className="h-4 w-4"
                  />
                  FIRA
                </label>
              </div>
            </div>
          )}

          {/* ── STEP 3: Sucesso ── */}
          {step === 3 && resultadoLote && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
                <h2 className="mt-4 text-2xl font-bold text-emerald-900">
                  Lote processado com sucesso
                </h2>
                <p className="mt-2 text-sm text-emerald-700">
                  {resultadoLote.total_arquivos} arquivo(s) processado(s), com resumo por arquivo
                  abaixo.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  {
                    label: 'Arquivos',
                    value: resultadoLote.total_arquivos,
                    color: 'text-blue-700 bg-blue-50 border-blue-200',
                    icon: FileText,
                  },
                  {
                    label: 'Importadas',
                    value: resultadoLote.importados_total,
                    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                    icon: CheckCircle2,
                  },
                  {
                    label: 'Ignoradas',
                    value: resultadoLote.ignorados_total,
                    color: 'text-gray-700 bg-gray-50 border-gray-200',
                    icon: X,
                  },
                  {
                    label: 'Erros',
                    value: resultadoLote.erros_total,
                    color: 'text-red-700 bg-red-50 border-red-200',
                    icon: XCircle,
                  },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div key={label} className={`rounded-xl border p-4 ${color}`}>
                    <p className="text-xs font-medium uppercase tracking-wider opacity-70">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold">{value}</p>
                    <Icon className="mt-1 h-5 w-5 opacity-40" />
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                      <th className="py-3 pl-4 text-left">Arquivo</th>
                      <th className="py-3 text-left">Status</th>
                      <th className="py-3 pr-4 text-left">Detalhe</th>
                      <th className="py-3 pr-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {resultadoLote.itens.map((item, idx) => (
                      <tr key={`${item.arquivo_nome}-${item.status}-${idx}`}>
                        <td className="py-2.5 pl-4 text-gray-700">{item.arquivo_nome}</td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              item.status === 'IMPORTADO'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'IGNORADO'
                                  ? 'bg-gray-100 text-gray-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-600">{item.detalhe}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {item.status === 'ERRO' && item.importacao_id ? (
                            <Button
                              variant="secondary"
                              className="h-8 px-3"
                              disabled={corrigindoImportacaoId === item.importacao_id}
                              onClick={() => handleCorrigirItem(item.importacao_id!)}
                            >
                              {corrigindoImportacaoId === item.importacao_id ? (
                                <>
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  Abrindo…
                                </>
                              ) : (
                                'Corrigir'
                              )}
                            </Button>
                          ) : item.status === 'ERRO' ? (
                            <span className="text-xs text-gray-400">Reenviar arquivo</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-3 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep(1);
                    setArquivos([]);
                    setPreview(null);
                    setResultado(null);
                    setResultadoLote(null);
                    setSelecionados({});
                    setForcarSubstituicao({});
                    setObservacao('');
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Nova Importação
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/importacao/fira/historico')}
                >
                  <History className="mr-2 h-4 w-4" />
                  Ver Histórico
                </Button>
                <Button variant="primary" onClick={() => navigate('/frms')}>
                  Ir para Dashboard
                </Button>
              </div>
            </div>
          )}

          {step === 3 && resultado && !resultadoLote && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
                <h2 className="mt-4 text-2xl font-bold text-emerald-900">Importação concluída!</h2>
                <p className="mt-2 text-sm text-emerald-700">
                  As jornadas foram importadas com sucesso no módulo FRMS.
                </p>
              </div>

              {/* Cards de resumo */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  {
                    label: 'Importadas',
                    value: resultado.importados,
                    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                    icon: CheckCircle2,
                  },
                  {
                    label: 'Substituídas',
                    value: resultado.substituidos,
                    color: 'text-amber-700 bg-amber-50 border-amber-200',
                    icon: RefreshCw,
                  },
                  {
                    label: 'Ignoradas',
                    value: resultado.ignorados,
                    color: 'text-gray-700 bg-gray-50 border-gray-200',
                    icon: X,
                  },
                  {
                    label: 'Erros',
                    value: resultado.erros,
                    color: 'text-red-700 bg-red-50 border-red-200',
                    icon: XCircle,
                  },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div key={label} className={`rounded-xl border p-4 ${color}`}>
                    <p className="text-xs font-medium uppercase tracking-wider opacity-70">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold">{value}</p>
                    <Icon className="mt-1 h-5 w-5 opacity-40" />
                  </div>
                ))}
              </div>

              {/* Alertas gerados */}
              {resultado.alertas_gerados > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  {resultado.alertas_gerados} alerta(s) de compliance gerado(s). Verifique o painel
                  de alertas.
                </div>
              )}

              {/* Erros detalhados */}
              {resultado.erros_detalhes.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-red-800">Detalhes dos erros:</p>
                  <ul className="space-y-1 text-xs text-red-700">
                    {resultado.erros_detalhes.map((e, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ações */}
              <div className="flex flex-wrap gap-3 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep(1);
                    setArquivos([]);
                    setPreview(null);
                    setResultado(null);
                    setResultadoLote(null);
                    setSelecionados({});
                    setForcarSubstituicao({});
                    setObservacao('');
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Nova Importação
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/importacao/fira/historico')}
                >
                  <History className="mr-2 h-4 w-4" />
                  Ver Histórico
                </Button>
                <Button variant="primary" onClick={() => navigate('/frms')}>
                  Ir para Dashboard
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
