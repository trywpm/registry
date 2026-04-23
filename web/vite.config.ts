import { glob } from 'node:fs/promises';
import { join, basename } from 'node:path';

import { defineConfig } from 'vite-plus';
import tailwindcss from '@tailwindcss/vite';

const webComponents: Record<string, string> = {};
for await (const file of glob(join(__dirname, 'src/components/**/*.island.ts'))) {
  const name = basename(file, '.island.ts');
  if (`${name}.island.ts` !== basename(file)) {
    throw new Error(`File ${file} does not follow the naming convention of {name}.island.ts`);
  }

  webComponents[name] = file;
}

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    emptyOutDir: true,
    outDir: 'src/public/dist',
    rolldownOptions: {
      input: {
        style: 'src/styles/globals.css',
        vendor: 'src/scripts/vendor/index.ts',
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
