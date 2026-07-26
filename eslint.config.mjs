import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'uploads', '.pgdata', 'src/generated', 'coverage'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',

      // Atlas keeps this as a warning rather than an error.
      //
      // Every remaining instance is the case React's own guidance allows:
      // synchronising with an external system — a fetch that has resolved, a
      // Socket.IO connection changing state, a form being seeded from a record
      // that has just loaded. The alternative (remounting each form on a `key`)
      // would add indirection without changing what a person sees. Left as a
      // warning so a genuinely careless `setState` in an effect still shows up.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['*.js', '*.cjs', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
);
