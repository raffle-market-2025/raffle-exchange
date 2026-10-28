// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Денежный код: никакого float-округления и преобразований в number (02 §9, 02 §10). */
const NO_FLOAT_MONEY = [
  {
    selector: "CallExpression[callee.name='Number']",
    message: 'Деньги и курсы — только Money/rate из @raffle-exchange/core, не Number().',
  },
  {
    selector: "CallExpression[callee.name=/^parse(Float|Int)$/]",
    message: 'parseFloat/parseInt в денежном коде запрещены: используйте MoneyFactory.of / rate.',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name=/^(round|floor|ceil|trunc)$/]",
    message: 'Округление денег — только MoneyFactory.multiply/divide с явным RoundingMode.',
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: 'toFixed на number теряет точность; Money.toString() уже выводит масштаб актива.',
  },
];

/** Время только через Clock: иначе нельзя проверить дедлайны и дрейф (EC-009, EC-041). */
const NO_AMBIENT_TIME = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Время — только через Clock из @raffle-exchange/core.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Время — только через Clock из @raffle-exchange/core.',
  },
];

const DOMAIN_FILES = [
  'packages/exchange-domain/src/**/*.ts',
  'packages/exchange-ledger/src/**/*.ts',
  'packages/walt-adapter/src/**/*.ts',
  'packages/fiat-adapter/src/**/*.ts',
  'apps/exchange-worker/src/**/*.ts',
];

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**', 'docs/spec/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly' } },
  },
  {
    files: DOMAIN_FILES,
    rules: { 'no-restricted-syntax': ['error', ...NO_FLOAT_MONEY, ...NO_AMBIENT_TIME] },
  },
  {
    // Сам Money работает с Decimal.toFixed — это не number. Остальной core под теми же правилами.
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/money.ts', 'packages/core/src/clock.ts'],
    rules: { 'no-restricted-syntax': ['error', ...NO_FLOAT_MONEY, ...NO_AMBIENT_TIME] },
  },
  {
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
