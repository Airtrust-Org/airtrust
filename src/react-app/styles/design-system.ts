// 🎨 DESIGN SYSTEM - AirTrust
// Inspirado em: Apple, Vercel, Linear, Stripe
// Moderno, clean e profissional

export const designSystem = {
  // ========================================
  // 1. GRID & SPACING (Base: 8px)
  // ========================================
  spacing: {
    xs: '4px',    // 0.5 × 8
    sm: '8px',    // 1 × 8
    md: '16px',   // 2 × 8
    lg: '24px',   // 3 × 8
    xl: '32px',   // 4 × 8
    xxl: '48px',  // 6 × 8
  },

  // ========================================
  // 2. TIPOGRAFIA (Roboto / Inter)
  // ========================================
  typography: {
    display: {
      fontSize: '32px',
      fontWeight: 700,
      lineHeight: '40px',
      letterSpacing: '-0.5px',
    },
    h1: {
      fontSize: '28px',
      fontWeight: 600,
      lineHeight: '36px',
      letterSpacing: '-0.3px',
    },
    h2: {
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: '32px',
      letterSpacing: '0px',
    },
    h3: {
      fontSize: '20px',
      fontWeight: 600,
      lineHeight: '28px',
    },
    subtitle: {
      fontSize: '16px',
      fontWeight: 500,
      lineHeight: '24px',
      color: '#6B7280',
    },
    body: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: '24px',
    },
    bodySmall: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: '20px',
    },
    caption: {
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: '16px',
      color: '#9CA3AF',
    },
  },

  // ========================================
  // 3. PALETA DE CORES
  // ========================================
  colors: {
    // Primary
    primary: {
      50: '#EFF6FF',
      100: '#DBEAFE',
      200: '#BFDBFE',
      500: '#0066CC', // PRIMARY ACTION
      600: '#0052A3',
      700: '#003D7A',
      900: '#001F3F',
    },

    // Neutrals
    neutral: {
      0: '#FFFFFF',
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280', // SECONDARY TEXT
      600: '#4B5563',
      700: '#374151',
      900: '#111827',
    },

    // Success
    success: {
      50: '#F0FDF4',
      400: '#4ADE80',
      500: '#22C55E',
      600: '#16A34A',
    },

    // Warning
    warning: {
      50: '#FFFBEB',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706',
    },

    // Error
    error: {
      50: '#FEF2F2',
      400: '#F87171',
      500: '#EF4444',
      600: '#DC2626',
    },

    // Info
    info: {
      50: '#F0F9FF',
      400: '#38BDF8',
      500: '#0EA5E9',
      600: '#0284C7',
    },
  },

  // ========================================
  // 4. SHADOWS (Profundo + Delicado)
  // ========================================
  shadows: {
    none: 'none',
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    hover: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
  },

  // ========================================
  // 5. BORDER RADIUS
  // ========================================
  borderRadius: {
    none: '0px',
    sm: '4px',      // Inputs, tight
    md: '8px',      // Default buttons, cards
    lg: '12px',     // Modals, large cards
    xl: '16px',     // Extra large
    full: '9999px', // Badges, avatars
  },

  // ========================================
  // 6. TRANSITIONS
  // ========================================
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    verySlow: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // ========================================
  // 7. BREAKPOINTS (Mobile First)
  // ========================================
  breakpoints: {
    mobile: '640px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1280px',
  },

  // ========================================
  // 8. Z-INDEX HIERARCHY
  // ========================================
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    fixed: 1200,
    modal: 1300,
    tooltip: 1400,
  },
};

// EXPORT HELPERS
export const getSpacing = (multiplier: number) => `${multiplier * 8}px`;
export const getColor = (shade: string) => designSystem.colors[shade as keyof typeof designSystem.colors] || '#000';
