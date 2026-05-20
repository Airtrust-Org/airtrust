/**
 * Design System Color Tokens
 * Provides consistent color palette across application
 */
export const colorTokens = {
  // Primary colors (AirTrust Green)
  primary: {
    50: '#e6f9f1',
    500: '#10b77f',
    600: '#0d9e6e',
    700: '#0a7d57'
  },

  // Neutral colors
  neutral: {
    0: '#ffffff',
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    900: '#111827'
  },

  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#0ea5e9'
};

/**
 * Spacing Scale
 * Used for padding, margins, gaps
 */
export const spacingScale = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px'
};

/**
 * Shadow Definitions
 * Provides consistent elevation levels
 */
export const shadows = {
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
};

/**
 * Typography Scale
 * Font sizes and weights
 */
export const typography = {
  h1: {
    size: '28px',
    weight: 600,
    lineHeight: '36px',
    letterSpacing: '-0.3px'
  },
  h2: {
    size: '24px',
    weight: 600,
    lineHeight: '32px'
  },
  h3: {
    size: '20px',
    weight: 600,
    lineHeight: '28px'
  },
  body: {
    size: '16px',
    weight: 400,
    lineHeight: '24px'
  },
  small: {
    size: '14px',
    weight: 400,
    lineHeight: '20px'
  },
  xs: {
    size: '12px',
    weight: 400,
    lineHeight: '16px'
  }
};

/**
 * Transitions
 * Timing and easing for animations
 */
export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)'
};

/**
 * Tailwind Class Helpers
 * Common utility classes combinations
 */
export const classHelpers = {
  // Layout
  container: 'max-w-7xl mx-auto px-6',
  centerContent: 'flex items-center justify-center',
  spaceBetween: 'flex items-center justify-between',

  // Spacing
  pageGap: 'gap-6',
  sectionGap: 'gap-4',

  // Cards
  card: 'bg-white rounded-lg border border-neutral-200 shadow-sm',
  cardHover: 'hover:shadow-md hover:border-neutral-300 cursor-pointer transition-all duration-200',

  // Text
  heading: 'font-semibold text-neutral-900',
  subheading: 'font-medium text-neutral-600',
  body: 'text-neutral-700',
  muted: 'text-neutral-500',
  label: 'text-sm font-medium text-neutral-600',

  // Borders
  border: 'border border-neutral-200',
  borderTop: 'border-t border-neutral-200',
  borderBottom: 'border-b border-neutral-200',

  // Backgrounds
  bgNeutral: 'bg-neutral-50',
  bgWhite: 'bg-white',
  bgSuccess: 'bg-green-50',
  bgWarning: 'bg-yellow-50',
  bgError: 'bg-red-50',
  bgInfo: 'bg-primary/10',

  // Status badges
  badgeSuccess: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800',
  badgeWarning: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800',
  badgeError: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800',
  badgeInfo: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary'
};

/**
 * Icon wrapper styles
 * Consistent sizing and styling for icons
 */
export const iconWrappers = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
  xxl: 'w-12 h-12'
};

/**
 * Status color mapping
 * Maps status strings to design system colors
 * Global patterns for all status-based components
 */
export const statusColors = {
  // Common statuses
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-neutral-100 text-neutral-800',
  pending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  archived: 'bg-neutral-100 text-neutral-800',
  
  // Certification & Qualification statuses
  valid: 'bg-green-100 text-green-800',      // VÁLIDO
  válido: 'bg-green-100 text-green-800',     // Portuguese
  expiring: 'bg-yellow-100 text-yellow-800', // VENCENDO
  vencendo: 'bg-yellow-100 text-yellow-800', // Portuguese
  expired: 'bg-red-100 text-red-800',        // VENCIDA
  vencida: 'bg-red-100 text-red-800',        // Portuguese
  vencido: 'bg-red-100 text-red-800',        // Portuguese masculine
  revoked: 'bg-neutral-100 text-neutral-800', // REVOGADO
  revogado: 'bg-neutral-100 text-neutral-800', // Portuguese
  renovated: 'bg-neutral-100 text-neutral-800', // RENOVADA
  renovada: 'bg-neutral-100 text-neutral-800',  // Portuguese
  
  // Training statuses
  total: 'bg-primary/20 text-primary',
};

/**
 * Status Badge Styles
 * Pre-built badge classes for different statuses
 */
export const statusBadges = {
  valid: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800',
  expiring: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800',
  expired: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800',
  revoked: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800',
  total: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary',
};

/**
 * Row Status Colors for Tables
 * Maps to DataTable component row backgrounds
 */
export const rowStatusColors = {
  valid: 'bg-green-50',      // Green background for valid items
  expiring: 'bg-yellow-50',  // Yellow background for expiring items
  expired: 'bg-red-50',      // Red background for expired items
  revoked: 'bg-neutral-100', // Gray background for revoked items
  total: 'bg-primary/10',       // Blue background for totals
};

/**
 * Row Status Border Colors for Tables
 * Left border indicator for DataTable component
 */
export const rowStatusBorders = {
  valid: 'border-l-4 border-green-600',      // Green border for valid items
  expiring: 'border-l-4 border-yellow-600',  // Yellow border for expiring items
  expired: 'border-l-4 border-red-600',      // Red border for expired items
  revoked: 'border-l-4 border-neutral-400',  // Gray border for revoked items
  total: 'border-l-4 border-primary',       // Blue border for totals
};
