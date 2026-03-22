import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
