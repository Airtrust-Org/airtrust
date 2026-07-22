import { GuiaInstrutor } from './api';

export function formatarNomeSessaoVisivel(nomeSessao: string): string {
  if (!nomeSessao) return '';
  // Match prefix: "AW139 - INICIAL - 02/12 - " or similar
  // It handles 1 to 3 parts before the final dash
  const regex = /^(?:[^-]+-\s*)+(\d{2}\/\d{2})\s*-\s*/i;
  let limpo = nomeSessao.replace(regex, '');
  if (limpo === nomeSessao) {
    // If it didn't match the specific XX/YY pattern, try a simpler one
    // just in case there are variations like "S-76 - INICIAL - EMERGÊNCIAS"
    const fallbackRegex = /^(?:[^-]+-\s*)+(INICIAL|PERI[OÓ]DICO|SEMESTRAL|CHECK)\s*-\s*/i;
    limpo = limpo.replace(fallbackRegex, '');
  }

  // Capitalize first letter, lower rest (as requested in example)
  // "EMERGÊNCIAS DE MOTOR, OEI E AUTORROTAÇÃO" -> "Emergências de motor, OEI e autorrotação"
  if (limpo) {
    // We only want to lowercase the rest if it's all uppercase, otherwise we might break acronyms
    if (limpo === limpo.toUpperCase()) {
      limpo = limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
    }
  }
  return limpo || nomeSessao;
}

export function getNomeExibicaoGuia(guia: Pick<GuiaInstrutor, 'nome_sessao' | 'titulo' | 'codigo' | 'sessao_numero' | 'sessao_total'>): { visivel: string; tooltip: string } {
  if (guia.nome_sessao) {
    const visivel = formatarNomeSessaoVisivel(guia.nome_sessao);
    return { visivel, tooltip: guia.nome_sessao };
  }
  
  if (guia.titulo && guia.titulo !== guia.codigo) {
    return { visivel: guia.titulo, tooltip: guia.titulo };
  }

  if (guia.sessao_numero && guia.sessao_total) {
    const str = `Sessão ${guia.sessao_numero} de ${guia.sessao_total}`;
    return { visivel: str, tooltip: str };
  }

  return { visivel: guia.codigo, tooltip: guia.codigo };
}
