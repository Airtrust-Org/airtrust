export function resolveGuiaLinks(input: {
  sessions: Array<{ codigo_canonico: string; html_relpath: string; ciclo?: string | null; programa: string; aeronave: string }>;
  guias: Array<{ id: number; codigo: string; programa: string; ciclo: number | null; sessao_numero: number | null; sessao_total: number | null; aeronave: string | null }>;
}): Array<{ codigo_canonico: string; guia_id: number; match_type: 'EXACT_CODE' | 'STRUCTURED' }>;
