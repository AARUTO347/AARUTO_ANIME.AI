/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API key is read from import.meta.env.VITE_GEMINI_API_KEY at runtime.
// See .env.example and README.md — never commit a real key.
export default defineConfig({
  server: {
    port: 3010,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
