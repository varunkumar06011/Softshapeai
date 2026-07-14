// ─────────────────────────────────────────────────────────────────────────────
// ESLint Config — Linting configuration for the Softshape frontend
// ─────────────────────────────────────────────────────────────────────────────
// Uses ESLint flat config format with:
//   - @eslint/js recommended rules
//   - eslint-plugin-react-hooks (rules of hooks, exhaustive deps)
//   - eslint-plugin-react-refresh (fast refresh compatibility checks)
//   - Global ignores: dist/
//   - Applies to all .js and .jsx files
// ─────────────────────────────────────────────────────────────────────────────

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Flag raw fetch() calls that lack a signal/timeout option.
      // Allowed wrappers: httpFetch, fetchWithRetry, apiFetch, cloudFetch.
      // Uses no-restricted-syntax to catch fetch( not preceded by an allowed wrapper.
      'no-restricted-syntax': ['warn', {
        // Match CallExpression where callee.name is 'fetch' (bare fetch, not a wrapper)
        selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
        message: 'Use httpFetch/fetchWithRetry/apiFetch instead of raw fetch() to ensure timeout and retry protection. If this is intentional, add a signal or // eslint-disable-next-line comment.',
      }],
    },
  },
])
