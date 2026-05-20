import type { FichaPDFData } from '@/react-app/services/pdf-ficha-client';

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
  const sessaoTitulo = [modelo.codigo, modelo.nome].filter(Boolean).join(' - ');

  return {
    fichaId: `modelo-${modelo.id}`,
    sessao_titulo: sessaoTitulo,
    tripulante_nome: '',
    tripulante_codigo_anac: '',
    tripulante_funcao: '',
    instrutor_nome: '',
    instrutor_codigo_anac: '',
    data: '',
    horario_inicio: '',
    horario_fim: '',
    simulador: modelo.modelo_aeronave || '',
    carga_horaria_total: '',
    carga_horaria_pf: '',
    carga_horaria_pm: '',
    status: 'MODELO',
    observacoes_gerais: '',
    assinatura_aluno_timestamp: null,
    assinatura_instrutor_timestamp: null,
    logoUrl,
    modoModelo: true,
    fileName: buildFichaModeloPdfFileName(modelo),
    manobras: [...manobras]
      .sort((a, b) => a.ordem - b.ordem)
      .map((manobra) => ({
        ordem: manobra.ordem,
        nome: manobra.manobra_nome || manobra.manobra_descricao || manobra.manobra_codigo || '',
        descricao: manobra.manobra_descricao || manobra.manobra_nome || '',
        codigo: manobra.manobra_codigo || '',
        resultado: null,
        observacoes: manobra.observacoes || '',
        tripulante: manobra.tripulante || 'AB',
      })),
  };
}
