import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Output ra ngoài project — cùng cấp với thư mục dashboard/
    // Tức là: <repo-root>/public-react/
    // Đây là thư mục static được Express serve trực tiếp.
    outDir: '../public-react',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api':    { target: 'http://localhost:10001', changeOrigin: true },
      '/auth':   { target: 'http://localhost:10001', changeOrigin: true },
      '/health': { target: 'http://localhost:10001', changeOrigin: true },
    },
  },
});
