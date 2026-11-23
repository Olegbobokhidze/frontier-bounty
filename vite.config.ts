import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base: the same build works on Netlify, Vercel and GitHub Pages sub-paths.
  base: './',
  plugins: [react()],
  // LAN exposure is opt-in for device testing: pnpm dev --host
  server: { port: 5174 },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
