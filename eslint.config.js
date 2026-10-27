// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNative = require('eslint-plugin-react-native');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'android/*', 'ios/*', 'docs/*']),
  expoConfig,
  {
    // No hard-coded colours or texts: colours come from src/theme/tokens.ts, texts from src/i18n/hu.json.
    files: ['src/**/*.{ts,tsx}'],
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
]);
