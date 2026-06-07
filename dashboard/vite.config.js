import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public-react',   // build ra thư mục này, Express serve từ đây
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Dev: proxy API calls sang Express (chạy trên port 10001)
      '/api':  { target: 'http://localhost:10001', changeOrigin: true },
      '/auth': { target: 'http://localhost:10001', changeOrigin: true },
      '/health': { target: 'http://localhost:10001', changeOrigin: true },
    },
  },
});
