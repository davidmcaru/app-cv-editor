import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const reglas = {
    quotes: ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    semi: ['warn', 'always'],
    // De la sangría manda Prettier: esta regla discrepa de él en ternarios y encadenados anidados
    indent: 'off',
    'no-console': 'off',
    'no-debugger': 'warn',
    // null: 'ignore' permite `x != null`, que cubre null y undefined a la vez
    eqeqeq: ['warn', 'always', { null: 'ignore' }],
    'no-var': 'error',
    'prefer-const': 'warn',
    'no-duplicate-imports': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
};
const sinUsar = { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' };

export default [
    { ignores: ['node_modules/**', 'dist/**', 'playwright-report/**', 'test-results/**', '**/*.d.ts'] },

    js.configs.recommended,

    // Los tests (Playwright) corren en Node, y lo que le pasan a page.evaluate, en el navegador
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
        rules: { ...reglas, 'no-unused-vars': ['warn', sinUsar], 'no-undef': 'warn' },
    },

    ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.ts'] })),
    {
        files: ['**/*.ts'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
        rules: {
            ...reglas,
            '@typescript-eslint/no-unused-vars': ['warn', sinUsar],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
        },
    },
    {
        files: ['*.config.ts'],
        languageOptions: { globals: { ...globals.node } },
    },
];
