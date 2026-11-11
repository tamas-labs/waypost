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

const HARD_CODED_TEXTS = [
  { selector: 'JSXText[value=/\\S/]', message: 'Texts come from src/i18n/hu.json: use t().' },
  { selector: 'JSXExpressionContainer > Literal[value=/\\S/]', message: 'Texts come from src/i18n/hu.json: use t().' },
  {
    selector: 'JSXAttribute[name.name=/^(title|label|placeholder|accessibilityLabel|accessibilityHint)$/] > Literal[value=/\\S/]',
    message: 'Texts come from src/i18n/hu.json: use t().',
  },
];

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
      'no-restricted-syntax': ['error', ...HARD_CODED_TEXTS],
    },
  },
  {
    // The session has one writer, src/auth/session.ts (logIn, logOut, clearShiftStart).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/testing.ts', 'src/auth/session.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...HARD_CODED_TEXTS,
        {
          selector: "MemberExpression[object.name='useSession'][property.name='setState']",
          message: 'The session is written in src/auth/session.ts: use its functions.',
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
  // WP-APP-006: the phone's own data and the session stay below the flows that use them, so the folders keep no cycle.
  ...layerRule('src/device', {
    regex: '^@/(?!db|device|time|id|api|i18n)[^/]+(/|$)',
    allowTypeImports: true,
    message: "The device holds the phone's own data and state: the checklist is in src/setup, the flows above it.",
  }),
  ...layerRule('src/auth', {
    regex: '^@/(sync|account|setup|guard|alarms|nfc|supervisor|hooks|components|navigation|app)(/|$)',
    allowTypeImports: true,
    message: 'The session and the PIN are below the sync: the flows that use both are in src/account.',
  }),
  // FR-022: a shared component shows what a screen or a hook (src/hooks) hands it, and calls back; it runs no flow itself.
  ...layerRule('src/components', {
    regex: '^@/(account|api|db|app)(/|$)',
    allowTypeImports: true,
    message: 'A component gets its data and actions as props or from a hook (src/hooks): no database, API or account flow.',
  }),
  ...layerRule('src/db', {
    regex: '^@/domain(/|$)',
    allowTypeImports: true,
    message: 'The database does not reach the domain when it runs.',
  }),
  prettierConfig,
]);
