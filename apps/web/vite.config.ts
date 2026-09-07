import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // Intercept proxy failure (ECONNREFUSED) when backend is down
            if (!res.headersSent && 'writeHead' in res) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  code: 'NETWORK_ERROR',
                  message:
                    'Cannot connect to the backend server at http://127.0.0.1:3001. Please make sure the backend server is running with "pnpm dev" or "pnpm dev:server".',
                  detail: err.message,
                })
              );
            }
          });
        },
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          shaka: ['shaka-player'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
