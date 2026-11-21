import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', './worker-configuration.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Acessibilidade de JSX (relatório UI/UX 2026-11-20). Tudo em `warn` até a
    // dívida legada chegar a zero; então promover para `error` regra a regra.
    // `label-has-for` é depreciada e `control-has-associated-label` gera falsos
    // positivos quando o rótulo é uma expressão (`{label}`) de um <label> que envolve o campo.
    files: ['src/react-app/**/*.tsx', 'src/components/**/*.tsx'],
    ignores: ['**/*.test.tsx', '**/__tests__/**'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, 'warn']),
      ),
      'jsx-a11y/label-has-associated-control': [
        'warn',
        {
          assert: 'either',
          depth: 4,
          controlComponents: [
            'Input',
            'Select',
            'TextArea',
            'TimeInput',
            'FuncionarioCombobox',
            'SeletorFuncionario',
            'AeronaveSelect',
            'AeronaveMultiSelect',
          ],
        },
      ],
      'jsx-a11y/label-has-for': 'off',
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  {
    // Diálogos nativos bloqueiam a thread, não são acessíveis nem estilizáveis.
    // Use `useConfirmDialog` (hooks/useConfirmDialog) e o Toast do sistema.
    files: ['src/react-app/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    rules: {
      'no-alert': 'error',
    },
  },
  {
    // These validators intentionally reject C0/DEL characters in untrusted ZIP
    // paths. The security check is the reason for the control-character regex.
    files: [
      'src/react-app/pages/lms/lmsPackageValidator.ts',
      'worker-airtrust/src/lib/lms/lms-package-validator.ts',
    ],
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    // Test doubles model Hono and D1/R2 interfaces without widening production
    // types. The production delta type-safety guard does not exclude runtime code.
    files: [
      'worker-airtrust/src/__tests__/lib/lms/lms-content-upload-service.test.ts',
      'worker-airtrust/src/__tests__/routes/lms-cursos-schema-compat.test.ts',
      'worker-airtrust/src/__tests__/routes/lms-cursos-structured-upload-complete.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
  {
    // These copied legacy routes retain their known lint baseline. New type-safety
    // regressions remain blocked by guard:typescript-delta on every changed line.
    files: [
      'worker-airtrust/src/routes/lms-cursos-legacy.ts',
      'worker-airtrust/src/routes/qualificacoes/historico.ts',
    ],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // This monolithic legacy page carries a known lint baseline. Keep the
    // exemption rule-scoped so unrelated ESLint protections remain active.
    files: ['src/react-app/pages/Qualificacoes.tsx'],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
);
