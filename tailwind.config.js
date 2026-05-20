/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

export default {
  content: ['./index.html', './src/react-app/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f9f1',
          100: '#ccf2e4',
          500: '#10b77f',
          600: '#10b77f', // Verde principal AirTrust
          700: '#0d9e6e',
          DEFAULT: '#10b77f', // AirTrust green
        },
        'background-light': '#f6f8f7',
        'background-dark': '#10221c',
        success: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a', // Green for valid - matching HTML pattern
          DEFAULT: '#16a34a',
        },
        warning: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#f59e0b',
          DEFAULT: '#f59e0b',
        },
        danger: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#ef4444',
        },
        critical: {
          DEFAULT: '#dc2626', // Red for expired - matching HTML pattern
        },
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        full: '9999px',
      },
      // Z-index hierarchy (aligned with design-system.ts zIndex tokens)
      // Use z-header, z-dropdown, z-modal etc. instead of z-50
      zIndex: {
        header: '100',    // sticky header
        dropdown: '200',  // dropdowns, popovers
        sidebar: '300',   // sidebars
        modal: '400',     // modals / dialogs
        toast: '500',     // toast notifications
        tooltip: '600',   // tooltips
      },
      animation: {
        shimmer: 'shimmer 2s infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [forms, containerQueries],
  safelist: [
    // Design System Card Variants
    'card',
    'card-primary',
    'card-success',
    'card-warning',
    'card-error',
    'card-info',
    'card-neutral',
    'card-elevated',
    // Button variants
    'btn-primary',
    'btn-secondary',
    'btn-success',
    'btn-warning',
    'btn-error',
    'btn-info',
    'btn-ghost',
    'btn-sm',
    'btn-lg',
    // Badge variants
    'badge',
    'badge-primary',
    'badge-success',
    'badge-warning',
    'badge-error',
    'badge-info',
    // Text colors
    'text-primary',
    'text-success',
    'text-warning',
    'text-error',
    'text-info',
    'text-muted',
    // Background colors
    'bg-primary',
    'bg-success',
    'bg-warning',
    'bg-error',
    'bg-info',
    // Transparency utilities used in badges/nav
    'bg-success/10',
    'bg-warning/10',
    'bg-primary/10',
    'bg-primary/20',
    'dark:bg-primary/30',
    // Typography utility classes
    'h1-page-title',
    'h2-section-title',
    'h3-subsection-title',
    'body-large',
    'body-small',
    'body-xs',
    'label-medium',
    'label-small',
    'data-value',
    'data-value-large',
    'nav-link',
    'nav-link-active',
    // Spacing utilities
    'p-xs',
    'p-sm',
    'p-md',
    'p-lg',
    'p-xl',
    'm-xs',
    'm-sm',
    'm-md',
    'm-lg',
    'm-xl',
    'gap-xs',
    'gap-sm',
    'gap-md',
    'gap-lg',
    'gap-xl',
    // Animations
    'animate-fade-in',
    'animate-slide-in',
    'animate-scale-in',
    'animate-spin',
    // Z-index semantic classes
    'z-header',
    'z-dropdown',
    'z-sidebar',
    'z-modal',
    'z-toast',
    'z-tooltip',
  ],
};
