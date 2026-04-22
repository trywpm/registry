import { defineConfig } from 'vite-plus';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    emptyOutDir: true,
    outDir: 'src/public/dist',

    rolldownOptions: {
      input: {
        style: './src/styles/globals.css',
        vendor: './src/scripts/vendor/index.ts',
        'site-navbar': './src/scripts/site-navbar.ts',
        'theme-toggle': './src/scripts/theme-toggle.ts',
        'custom-select': './src/scripts/custom-select.ts',
        'avatar-element': './src/scripts/avatar-element.ts',
        'package-sidebar': './src/scripts/package-sidebar.ts',
        'install-command-cta': './src/scripts/install-command-cta.ts',
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
