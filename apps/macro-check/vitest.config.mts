import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/macro-check',
  // Nest relies on decorator metadata, which esbuild (Vitest's default) does not emit.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2021',
      },
    }),
  ],
  resolve: {
    // Resolve the workspace lib from source so tests need no prior lib build.
    conditions: ['@djbender/source'],
  },
  test: {
    name: '@djbender/macro-check',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
  },
}));
