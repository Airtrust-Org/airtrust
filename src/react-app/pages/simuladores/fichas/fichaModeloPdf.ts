/**
 * Construtor de dados da ficha-modelo PTO Rev10 (18 técnicas + 15 NOTECHS).
 * Não gera PDF diretamente — monta o FichaPDFData consumido pelo
 * renderer oficial gerarPDFFichaCliente() em
 * src/react-app/services/pdf-ficha-client.ts. Único caminho de código
 * que produz uma ficha-modelo em branco; chamado por
 * src/react-app/pages/simuladores/fichas/index.tsx.
 */
import type { FichaPDFData } from '@/react-app/services/pdf-ficha-client';
import { getSpecialEventSessionDefinition } from '@/shared/simuladores/special-event-sessions';
import { resolveModeloSessaoObservacoesOverride } from '@/shared/simuladores/modelos-sessao-observacoes';
import { NOTECHS_CANONICAL_ITEMS } from '@/shared/simuladores/notechs-canonical';
import { NOTECHS_ITENS as LEGACY_NOTECHS_ITEMS } from './notechs';

export interface ModeloSessaoResumo {
  id: number;
  codigo: string;
  codigo_canonico?: string | null;
  nome: string;
  tipo_sessao_nome?: string;
  modelo_aeronave?: string;
  total_manobras?: number;
}

export interface ModeloSessaoManobra {
  ordem: number;
  manobra_codigo?: string;
  manobra_nome?: string;
  manobra_descricao?: string;
  observacoes?: string | null;
  tripulante?: 'A' | 'B' | 'AB';
}

export const FICHA_MODELO_TECNICAS_PREVIEW_LIMIT = 18;

function canonicalModelCode(modelo: ModeloSessaoResumo): string {
  return String(modelo.codigo_canonico || modelo.codigo || '').trim();
}

function sanitizeFilePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .toUpperCase();
}

export function buildFichaModeloPdfFileName(modelo: ModeloSessaoResumo): string {
  const base =
    sanitizeFilePart(`${canonicalModelCode(modelo)}-${modelo.nome}`) || `MODELO-${modelo.id}`;
  return `FICHA-MODELO-${base}.pdf`;
}

export function buildFichaModeloPdfData(
  modelo: ModeloSessaoResumo,
  manobras: ModeloSessaoManobra[],
  logoUrl?: string,
): FichaPDFData {
  const codigoCanonico = canonicalModelCode(modelo);
  const specialDefinition = getSpecialEventSessionDefinition(codigoCanonico);
  const sessaoTitulo =
    specialDefinition?.fullTitle || [codigoCanonico, modelo.nome].filter(Boolean).join(' - ');
  const tecnicasPreview = [...manobras]
    .sort((a, b) => a.ordem - b.ordem)
    .slice(0, FICHA_MODELO_TECNICAS_PREVIEW_LIMIT);
  const notechsPreview = modelo.codigo_canonico
    ? NOTECHS_CANONICAL_ITEMS.map((item) => ({
        ordem: item.ordem,
        nome: item.nome,
        descricao: item.evidenciaObservavel,
        codigo: item.codigo,
        resultado: null,
        observacoes: '',
        tripulante: 'AB' as const,
      }))
    : LEGACY_NOTECHS_ITEMS.map((item) => ({
        ordem: item.ordem,
        nome: item.tituloPt,
        descricao: item.tituloEn,
        codigo: item.codigo,
        resultado: null,
        observacoes: '',
        tripulante: 'AB' as const,
      }));

  return {
    fichaId: `modelo-${modelo.id}`,
    sessao_codigo: codigoCanonico,
    sessao_titulo: sessaoTitulo,
    sessao_nome: modelo.nome,
    sessao_titulo_linha1: specialDefinition?.headerTitle,
    sessao_titulo_linha2: specialDefinition?.headerSubtitle,
    tripulante_nome: '',
    tripulante_codigo_anac: '',
    tripulante_funcao: '',
    instrutor_nome: '',
    instrutor_codigo_anac: '',
    data: '',
    horario_inicio: '',
    horario_fim: '',
    simulador: '',
    simulador_modelo: modelo.modelo_aeronave || undefined,
    carga_horaria_total: specialDefinition ? '120 minutos' : '',
    carga_horaria_pf: '',
    carga_horaria_pm: '',
    status: 'MODELO',
    observacoes_gerais: '',
    assinatura_aluno_timestamp: null,
    assinatura_instrutor_timestamp: null,
    logoUrl,
    modoModelo: true,
    templateVersion: 'v6',
    fileName: buildFichaModeloPdfFileName(modelo),
    manobras: tecnicasPreview
      .map((manobra) => {
        const override = resolveModeloSessaoObservacoesOverride(manobra.observacoes);
        const nome =
          override ||
          manobra.manobra_nome ||
          manobra.manobra_descricao ||
          manobra.manobra_codigo ||
          '';
        const descricao =
          override || manobra.manobra_descricao || manobra.manobra_nome || '';
        return {
          ordem: manobra.ordem,
          nome,
          descricao,
          codigo: manobra.manobra_codigo || '',
          resultado: null,
          observacoes: '',
          tripulante: manobra.tripulante || 'AB',
        };
      })
      .concat(notechsPreview),
  };
}
