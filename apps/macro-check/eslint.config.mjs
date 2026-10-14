import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/webpack.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/src/**/*.spec.ts',
            '{projectRoot}/src/app/test-*.ts',
          ],
          ignoredDependencies: [
            // Type-only imports; the @types/* packages are dev dependencies.
            'express',
            'multer',
            // Needed at runtime by Nest and the compiler, never imported by us.
            'reflect-metadata',
            'rxjs',
            'tslib',
            // Imported by the bundled macro-detection lib; the production
            // install only sees this package.json, so it must be listed here.
            'jszip',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
