import { glob } from 'node:fs/promises';

import { defineConfig } from 'vite-plus';
import tailwindcss from '@tailwindcss/vite';

const webComponents: Record<string, string> = {};
for await (const file of glob('./src/components/**/element.ts')) {
  webComponents[file.split('/').slice(-2, -1)[0]] = file;
}

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    emptyOutDir: true,
    outDir: 'src/public/dist',

    rolldownOptions: {
      input: {
        style: './src/styles/globals.css',
        vendor: './src/scripts/vendor/index.ts',
        ...webComponents,
      },
      output: {
        format: 'esm',
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
