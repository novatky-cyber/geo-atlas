import { defineConfig } from 'vite';

// GitHub Pages はリポジトリ名のサブパス（/geo-atlas/）で公開される
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/geo-atlas/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
}));
