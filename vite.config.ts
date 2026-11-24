import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { shareMeta } from './share-meta';

export default defineConfig({
  // Relative base: the same build works on Netlify, Vercel and GitHub Pages sub-paths.
  base: './',
  plugins: [
    react(),
    // Link-preview tags, JSON-LD, robots.txt and sitemap.xml (set SITE_URL for absolute URLs).
    shareMeta({
      author: 'Oleg Bobokhidze',
      genre: "Mines",
      imageAlt: "Frontier Dynamite & Bounty by Oleg Bobokhidze: a marshal beside a board of wooden claim tiles.",
      keywords: ["western game", "mines game", "grid game", "dynamite", "bounty", "browser game", "react", "typescript"],
    }),
  ],
  // LAN exposure is opt-in for device testing: pnpm dev --host
  server: { port: 5174 },
  build: { target: 'es2022', sourcemap: true },
});
