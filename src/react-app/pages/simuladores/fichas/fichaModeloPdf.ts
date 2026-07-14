/**
 * Construtor de dados da ficha-modelo V6.2 (18 técnicas + 15 NOTECHS).
 * Não gera PDF diretamente — monta o FichaPDFData consumido pelo
 * renderer oficial gerarPDFFichaCliente() em
 * src/react-app/services/pdf-ficha-client.ts. Único caminho de código
 * que produz uma ficha-modelo em branco; chamado por
 * src/react-app/pages/simuladores/fichas/index.tsx.
 */
import type { FichaPDFData } from '@/react-app/services/pdf-ficha-client';
import { getSpecialEventSessionDefinition } from '@/shared/simuladores/special-event-sessions';
import { resolveModeloSessaoObservacoesOverride } from '@/shared/simuladores/modelos-sessao-observacoes';
import { NOTECHS_ITENS } from './notechs';

export interface ModeloSessaoResumo {
  id: number;
  codigo: string;
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
  const base = sanitizeFilePart(`${modelo.codigo}-${modelo.nome}`) || `MODELO-${modelo.id}`;
  return `FICHA-MODELO-${base}.pdf`;
}

export function buildFichaModeloPdfData(
  modelo: ModeloSessaoResumo,
  manobras: ModeloSessaoManobra[],
  logoUrl?: string,
): FichaPDFData {
  const specialDefinition = getSpecialEventSessionDefinition(modelo.codigo);
  const sessaoTitulo =
    specialDefinition?.fullTitle || [modelo.codigo, modelo.nome].filter(Boolean).join(' - ');
  const tecnicasPreview = [...manobras]
    .sort((a, b) => a.ordem - b.ordem)
    .slice(0, FICHA_MODELO_TECNICAS_PREVIEW_LIMIT);
  const notechsPreview = NOTECHS_ITENS.map((item) => ({
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
    sessao_codigo: modelo.codigo,
    sessao_titulo: sessaoTitulo,
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
    simulador: modelo.modelo_aeronave || '',
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
        // Override de texto por vínculo modelo↔manobra (modelos_sessao_manobras.observacoes),
        // não confundir com o campo `observacoes` da ficha impressa abaixo (nota do avaliador).
        const override = resolveModeloSessaoObservacoesOverride(manobra.observacoes);
        const nome = override || manobra.manobra_nome || manobra.manobra_descricao || manobra.manobra_codigo || '';
        const descricao = override || manobra.manobra_descricao || manobra.manobra_nome || '';
        return {
          ordem: manobra.ordem,
          nome,
          descricao,
          codigo: manobra.manobra_codigo || '',
          resultado: null,
          // Ficha modelo (impressão em branco): não exibe metadados internos
          // (tipo_item, fase_voo, carater, fap_refs, matriz_v6_modelo) nas observações.
          observacoes: '',
          tripulante: manobra.tripulante || 'AB',
        };
      })
      .concat(notechsPreview),
  };
}
