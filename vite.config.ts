import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build" : version PWA normale (manifest + service worker, à héberger).
// "npm run build:single" : un seul fichier HTML autonome (démo partageable).
export default defineConfig(({ mode }) => ({
  plugins: [preact(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  define: { __SINGLE__: JSON.stringify(mode === 'single') },
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', target: 'es2019' },
}));
