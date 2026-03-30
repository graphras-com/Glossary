import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Proxy only fetch/XHR API requests to the backend, not page navigations.
function apiOnly(req) {
  const accept = req.headers.accept || ''
  if (accept.includes('text/html')) {
    // Return false-y string path to skip proxy and serve index.html instead
    return req.url
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_COMMIT__:  JSON.stringify(process.env.VITE_BUILD_COMMIT  || 'dev'),
    __BUILD_TAG__:     JSON.stringify(process.env.VITE_BUILD_TAG     || ''),
    __BUILD_TIME__:    JSON.stringify(process.env.VITE_BUILD_TIME    || new Date().toISOString()),
    __BUILD_BRANCH__:  JSON.stringify(process.env.VITE_BUILD_BRANCH  || 'local'),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'auth-popup': resolve(__dirname, 'auth-popup.html'),
      },
    },
  },
  server: {
    proxy: {
      '/categories': { target: 'http://localhost:8000', bypass: apiOnly },
      '/terms':      { target: 'http://localhost:8000', bypass: apiOnly },
      '/backup':     { target: 'http://localhost:8000', bypass: apiOnly },
      '/health':     { target: 'http://localhost:8000', bypass: apiOnly },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
