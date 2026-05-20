/**
 * COLOR UTILS - Gerador de cores automáticas
 *
 * Gera cores em hex baseadas em hash do nome
 * Paleta de cores vibrante e acessível
 */

const COLOR_PALETTE = [
  '#3B82F6', // Azul
  '#10B981', // Verde
  '#F59E0B', // Âmbar
  '#EF4444', // Vermelho
  '#8B5CF6', // Roxo
  '#EC4899', // Rosa
  '#06B6D4', // Ciano
  '#6366F1', // Índigo
  '#D946EF', // Magenta
  '#0EA5E9', // Azul céu
  '#14B8A6', // Teal
  '#EABA0C', // Amarelo
];

/**
 * Gera uma cor em hex baseada no nome (hash)
 * Garante que o mesmo nome sempre gera a mesma cor
 */
export function generateColorFromName(name: string): string {
  // Simples hash baseado na string
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

/**
 * Retorna cores predefinidas
 */
export function getColorForCategory(categoryName: string): string {
  const colors: Record<string, string> = {
    CHECK: '#3B82F6',
    EXAME: '#10B981',
    TREINAMENTO: '#F59E0B',
    CERTIFICAÇÃO: '#8B5CF6',
    SIMULAÇÃO: '#EC4899',
    DOCUMENTAÇÃO: '#6366F1',
  };

  return colors[categoryName.toUpperCase()] || generateColorFromName(categoryName);
}

/**
 * Converte nome para slug
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
