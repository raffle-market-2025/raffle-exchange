import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC нужен NestJS: esbuild в vitest не выдаёт decorator metadata, и DI по типам ломается.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.test.ts'] },
});
