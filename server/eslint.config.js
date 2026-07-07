// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
  {
    // The Keizer engine must stay pure: no DB, no HTTP framework, no reaching
    // outside its own folder. This is what actually keeps it "isolated" for
    // whoever inherits this repo — not just a comment saying so.
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@prisma/client', message: 'engine/ must stay DB-free.' },
            { name: 'fastify', message: 'engine/ must stay HTTP-free.' },
            { name: 'node:http', message: 'engine/ must stay HTTP-free.' },
            { name: 'pg', message: 'engine/ must stay DB-free.' },
          ],
          patterns: [
            {
              group: ['../db/*', '../db', '../modules/*', '../modules', '**/db/**', '**/modules/**'],
              message: 'engine/ must not import from db/ or modules/.',
            },
          ],
        },
      ],
    },
  },
];
