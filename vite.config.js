import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/pwa-test/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: false,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Service-Worker-Allowed': '/',
    },
    hmr: {
      port: 5174,
    },
    middlewareMode: false,
    fs: {
      strict: false
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },
  plugins: [
    react(),
    // Custom plugin to handle static assets and manifest
    {
      name: 'static-assets-handler',
      configureServer(server) {
        // Handle all requests with CORS headers
        server.middlewares.use((req, res, next) => {
          // Add CORS headers for all requests
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
          
          // Handle manifest.json specifically
          if (req.url === '/manifest.json') {
            res.setHeader('Content-Type', 'application/manifest+json');
            res.setHeader('Service-Worker-Allowed', '/');
          }
          
          // Handle image files specifically
          if (req.url && req.url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
          }
          
          next();
        });
      }
    }
  ],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    }
  },
})
