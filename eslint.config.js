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
  },
])
