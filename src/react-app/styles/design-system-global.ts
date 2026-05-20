/**
 * 🎨 DESIGN SYSTEM GLOBAL - AirTrust
 *
 * Inspiração: Novo design da página Habilitações (Apple-like, clean, moderno)
 * Aplicação: Todas as páginas do sistema
 *
 * Características:
 * - Gradientes suaves (slate-50 → blue-50)
 * - Cards com efeito glass-morphism
 * - Typography clara e hierárquica
 * - Cores consistentes com significado semântico
 * - Transições suaves
 * - Espaçamento generoso
 */

export const DesignSystemGlobal = {
  // ========== CORES ==========
  colors: {
    primary: '#3B82F6', // blue-500
    primaryDark: '#1E40AF', // blue-800
    primaryLight: '#EFF6FF', // blue-50

    success: '#10B981', // emerald-500
    successLight: '#ECFDF5', // emerald-50

    warning: '#F59E0B', // amber-500
    warningLight: '#FFFBEB', // amber-50

    error: '#EF4444', // red-500
    errorLight: '#FEE2E2', // red-50

    neutral: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
      900: '#111827',
    },
  },

  // ========== TIPOGRAFIA ==========
  typography: {
    // Títulos página
    h1: 'text-4xl font-bold text-gray-900 tracking-tight',
    h2: 'text-3xl font-bold text-gray-900 tracking-tight',
    h3: 'text-2xl font-bold text-gray-900',
    h4: 'text-xl font-semibold text-gray-900',
    h5: 'text-lg font-semibold text-gray-900',
    h6: 'text-base font-semibold text-gray-900',

    // Subtítulos
    subtitle1: 'text-lg text-gray-600',
    subtitle2: 'text-base text-gray-600',

    // Body
    body1: 'text-base text-gray-700',
    body2: 'text-sm text-gray-600',

    // Labels
    label: 'text-xs font-semibold text-gray-700 uppercase tracking-wider',
    labelLg: 'text-sm font-semibold text-gray-700',

    // Caption
    caption: 'text-xs text-gray-500',
  },

  // ========== ESPACIAMENTO ==========
  spacing: {
    pageContainer: 'p-8 md:p-12 lg:p-16',
    sectionMargin: 'mb-8 md:mb-12',
    componentGap: 'gap-4 md:gap-6',
  },

  // ========== GRADIENTES FUNDO ==========
  gradients: {
    pageDefault: 'bg-gradient-to-br from-slate-50 to-blue-50',
    pageDark: 'bg-gradient-to-br from-slate-100 to-blue-100',
    accent: 'bg-gradient-to-r from-blue-500 to-blue-600',
  },

  // ========== CARDS ==========
  cards: {
    base: 'bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200',
    elevated: 'bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200',
    subtle: 'bg-white/50 backdrop-blur-sm rounded-xl border border-white/20 shadow-sm',
    transparent: 'bg-transparent rounded-xl',
  },

  // ========== BORDAS ==========
  borders: {
    subtle: 'border border-gray-200',
    medium: 'border border-gray-300',
    strong: 'border-2 border-gray-400',
    focus: 'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
  },

  // ========== SOMBRAS ==========
  shadows: {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    none: 'shadow-none',
  },

  // ========== TRANSIÇÕES ==========
  transitions: {
    fast: 'transition-all duration-150',
    normal: 'transition-all duration-200',
    slow: 'transition-all duration-300',
  },

  // ========== INPUTS ==========
  inputs: {
    base: 'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200',
    small: 'px-3 py-1.5 text-sm',
    large: 'px-5 py-3.5 text-lg',
  },

  // ========== BOTÕES ==========
  buttons: {
    // Primário
    primary:
      'bg-primary text-white font-semibold rounded-lg px-6 py-2.5 hover:bg-primary/90 active:bg-blue-800 transition-colors duration-200 shadow-sm hover:shadow-md',
    primarySm:
      'bg-primary text-white font-semibold rounded-lg px-4 py-1.5 text-sm hover:bg-primary/90 active:bg-blue-800 transition-colors duration-200',
    primaryLg:
      'bg-primary text-white font-semibold rounded-lg px-8 py-3 text-lg hover:bg-primary/90 active:bg-blue-800 transition-colors duration-200 shadow-md hover:shadow-lg',

    // Secundário
    secondary:
      'bg-gray-100 text-gray-900 font-semibold rounded-lg px-6 py-2.5 hover:bg-gray-200 active:bg-gray-300 transition-colors duration-200',
    secondarySm:
      'bg-gray-100 text-gray-900 font-semibold rounded-lg px-4 py-1.5 text-sm hover:bg-gray-200 active:bg-gray-300 transition-colors duration-200',

    // Ghost (sem fundo)
    ghost:
      'text-gray-700 font-medium rounded-lg px-6 py-2.5 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200',
    ghostSm:
      'text-gray-700 font-medium rounded-lg px-4 py-1.5 text-sm hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200',

    // Danger
    danger:
      'bg-red-600 text-white font-semibold rounded-lg px-6 py-2.5 hover:bg-red-700 active:bg-red-800 transition-colors duration-200',
    dangerSm:
      'bg-red-600 text-white font-semibold rounded-lg px-4 py-1.5 text-sm hover:bg-red-700 active:bg-red-800 transition-colors duration-200',

    // Success
    success:
      'bg-green-600 text-white font-semibold rounded-lg px-6 py-2.5 hover:bg-green-700 active:bg-green-800 transition-colors duration-200',
  },

  // ========== STATUS BADGES ==========
  badges: {
    valid:
      'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200',
    expiring:
      'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200',
    expired:
      'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-50 text-red-700 border border-red-200',
    pending:
      'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-50 text-slate-700 border border-slate-200',
    info: 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-blue-700 border border-blue-200',
  },

  // ========== TABELAS ==========
  tables: {
    header:
      'px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-b border-gray-200',
    cell: 'px-6 py-4 whitespace-nowrap text-sm text-gray-900',
    cellAlt: 'px-6 py-4 text-sm text-gray-900',
    row: 'border-b border-gray-200 hover:bg-primary/10 transition-colors duration-150',
  },

  // ========== MODAIS ==========
  modals: {
    overlay: 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center',
    content: 'bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto',
    header: 'px-8 py-6 border-b border-gray-200 flex items-center justify-between',
    body: 'px-8 py-6',
    footer: 'px-8 py-4 border-t border-gray-200 flex justify-end gap-3',
  },

  // ========== TABS ==========
  tabs: {
    container: 'flex border-b border-gray-200 bg-gray-50/50',
    tab: 'flex-1 px-6 py-4 font-medium text-sm transition-all border-b-2 rounded-none',
    tabActive: 'border-primary text-primary bg-white',
    tabInactive: 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100',
  },

  // ========== SIDEBAR ==========
  sidebar: {
    container: 'w-64 bg-white border-r border-gray-200 h-screen flex flex-col',
    item: 'px-4 py-3 text-sm text-gray-700 hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors duration-200 rounded-lg',
    itemActive: 'px-4 py-3 text-sm text-primary bg-primary/10 rounded-lg font-medium',
  },

  // ========== TOOLTIP ==========
  tooltip:
    'absolute bg-gray-900 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap',

  // ========== LOADING ==========
  loading: 'flex items-center justify-center h-96',
  loadingSpinner: 'animate-spin rounded-full h-12 w-12 border-b-2 border-primary',

  // ========== ESTADO VAZIO ==========
  emptyState: 'text-center py-12',
  emptyStateIcon: 'w-16 h-16 text-gray-400 mx-auto mb-4',
  emptyStateText: 'text-gray-600 font-medium',

  // ========== GRID LAYOUT ==========
  grid: {
    cols1: 'grid-cols-1',
    cols2: 'md:grid-cols-2',
    cols3: 'lg:grid-cols-3',
    cols4: 'lg:grid-cols-4',
    cols5: 'lg:grid-cols-5',
    gap: 'gap-4 md:gap-6',
    auto: 'grid-auto-rows-fr',
  },

  // ========== UTILS ==========
  utils: {
    visuallyHidden: 'sr-only',
    truncate: 'truncate',
    truncateLine2: 'line-clamp-2',
    truncateLine3: 'line-clamp-3',
  },
};

export type DesignSystemTheme = typeof DesignSystemGlobal;
