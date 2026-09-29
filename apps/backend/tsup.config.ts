import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Shared is consumed as TypeScript source, so bundle it into the output.
  noExternal: ['@kavriel/shared'],
});
