import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: process.env.ELR_OUT_DIR || 'dist' },
  plugins: [{
    name: 'local-pdf-assets',
    closeBundle() {
      for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        cpSync(resolve('node_modules/pdfjs-dist', folder), resolve(process.env.ELR_OUT_DIR || 'dist', 'pdf-assets', folder), { recursive: true });
      }
    },
  }],
});
