import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        loader: resolve(__dirname, 'src/loader.ts'),
        widget: resolve(__dirname, 'src/widget.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    cssCodeSplit: false,
    minify: 'esbuild',
  },
  server: {
    port: 3001,
  },
});
