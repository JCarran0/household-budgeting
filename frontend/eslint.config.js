import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

// LOC budgets — see CLAUDE.md "File size budgets". `warn` so pre-existing
// offenders surface without blocking CI; new files crossing the threshold
// should extract a collaborator rather than disable the rule.
const MAX_LINES_PAGE = 600
const MAX_LINES_DEFAULT = 800

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'max-lines': ['warn', { max: MAX_LINES_DEFAULT, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['warn', { max: MAX_LINES_PAGE, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      'max-lines': 'off',
    },
  },
])
