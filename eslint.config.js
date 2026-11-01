// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');
const reactNative = require('eslint-plugin-react-native');

/** A pattern of imports a folder must not have; its tests and test helpers are free. */
function layerRule(folder, pattern) {
  return [
    {
      files: [`${folder}/**/*.{ts,tsx}`],
      ignores: ['**/*.test.{ts,tsx}', '**/testing.ts'],
      rules: { '@typescript-eslint/no-restricted-imports': ['error', { patterns: [pattern] }] },
    },
  ];
}

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'android/*', 'ios/*', 'docs/*']),
  expoConfig,
  {
    // No hard-coded colours or texts: colours come from src/theme/tokens.ts, texts from src/i18n/hu.json.
    // Tests are exempt: their labels are fixtures, not texts of the app.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    plugins: { 'react-native': reactNative },
    rules: {
      'react-native/no-color-literals': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'JSXText[value=/\\S/]', message: 'Texts come from src/i18n/hu.json: use t().' },
        { selector: 'JSXExpressionContainer > Literal[value=/\\S/]', message: 'Texts come from src/i18n/hu.json: use t().' },
        {
          selector: 'JSXAttribute[name.name=/^(title|label|placeholder|accessibilityLabel|accessibilityHint)$/] > Literal[value=/\\S/]',
          message: 'Texts come from src/i18n/hu.json: use t().',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'import/no-cycle': ['error', { ignoreExternal: true }] },
  },
  // The layers (J-17). Type imports are allowed where a layer only names what another one holds.
  ...layerRule('src/domain', {
    regex: '^(?!@waypost/schema$|@/time/zone$|@/time/timestamp$|@/chain/payloads$|\\.)',
    allowTypeImports: true,
    message: 'The domain is pure: it reaches only time/zone, time/timestamp and chain/payloads.',
  }),
  ...layerRule('src/chain', {
    regex: '^@/(domain|sync|guard|api|auth|alarms|navigation|app|components)(/|$)',
    message: 'The chain is below these: they follow it through its events.',
  }),
  ...layerRule('src/db', {
    regex: '^@/domain(/|$)',
    allowTypeImports: true,
    message: 'The database does not reach the domain when it runs.',
  }),
  prettierConfig,
]);
